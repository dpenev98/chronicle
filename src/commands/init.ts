import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import type { Command } from 'commander';
import { readConfig, validateConfig } from '../config/config';
import { openDatabase } from '../db/connection';
import { getCurrentSchemaVersion, initializeSchema } from '../db/schema';
import {
  createClaudeCodeHookConfig,
  getSkillTemplateFiles,
  renderClaudeMdInstructions,
  renderCopilotHookConfig,
  renderCopilotInstructions,
  type SupportedAgent,
} from '../templates';
import { ConfigError, DatabaseError, RepositoryError, ValidationError } from '../utils/errors';
import { buildChroniclePaths, findRepoRoot } from '../utils/paths';
import { ensureObject, parseJsonObject } from '../utils/validation';
import { runRegisteredCommand, type CommandRuntime, writeJson } from './shared';

const CHRONICLE_GITIGNORE_HEADER = '# Chronicle transient files';
const CHRONICLE_GITIGNORE_ENTRY = '.chronicle/chronicle.db-journal';
const CHRONICLE_MANAGED_MARKDOWN_HEADER = '<!-- This file is managed by Chronicle. Re-running `chronicle init` may overwrite local changes. -->';
const CHRONICLE_MANAGED_JSON_COMMENT = 'This file is managed by Chronicle. Re-running `chronicle init` may overwrite local changes.';
const INSTRUCTION_START_MARKER = '<!-- chronicle:start -->';
const INSTRUCTION_END_MARKER = '<!-- chronicle:end -->';

export interface InitCommandOptions {
  agent?: string[];
}

export interface InitCommandResult {
  created_paths: string[];
  repo_root: string;
  target_agents: SupportedAgent[];
  updated_paths: string[];
}

type FileChangeState = 'created' | 'unchanged' | 'updated';

export interface IntegrityCheckConnection {
  prepare(sql: string): {
    all(): unknown[];
  };
}

function readPackageVersion(): string {
  const packageJsonPath = resolve(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };

  if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
    throw new ConfigError('package.json version must be a non-empty string.');
  }

  return packageJson.version;
}

function normalizeAgents(agentOptions: string[] | undefined): SupportedAgent[] {
  const inputAgents = agentOptions ?? [];

  if (inputAgents.length === 0) {
    return ['claude-code'];
  }

  const normalizedAgents: SupportedAgent[] = [];

  for (const rawAgent of inputAgents) {
    const normalizedAgent = rawAgent.trim().toLowerCase();

    if (normalizedAgent === 'claude-code') {
      if (!normalizedAgents.includes('claude-code')) {
        normalizedAgents.push('claude-code');
      }

      continue;
    }

    if (normalizedAgent === 'copilot') {
      if (!normalizedAgents.includes('copilot')) {
        normalizedAgents.push('copilot');
      }

      continue;
    }

    throw new ValidationError("agent must be 'claude-code' or 'copilot'.");
  }

  return normalizedAgents;
}

function readTextFileIfExists(filePath: string): string | null {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
}

function ensureFileContent(filePath: string, content: string): FileChangeState {
  const existingContent = readTextFileIfExists(filePath);

  if (existingContent === content) {
    return 'unchanged';
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');

  return existingContent === null ? 'created' : 'updated';
}

function renderManagedMarkdownContent(content: string): string {
  if (content.startsWith('---\n')) {
    const frontmatterEnd = content.indexOf('\n---\n', 4);

    if (frontmatterEnd !== -1) {
      const frontmatterWithClosingDelimiter = content.slice(0, frontmatterEnd + 5);
      const body = content.slice(frontmatterEnd + 5).replace(/^\n+/u, '');

      return `${frontmatterWithClosingDelimiter}${CHRONICLE_MANAGED_MARKDOWN_HEADER}\n\n${body}`;
    }
  }

  return `${CHRONICLE_MANAGED_MARKDOWN_HEADER}\n\n${content}`;
}

function renderManagedJsonContent(content: string): string {
  const parsedContent = parseJsonObject<Record<string, unknown>>(content, 'Chronicle-managed JSON artifact');

  return `${JSON.stringify({
    ...parsedContent,
    $comment: CHRONICLE_MANAGED_JSON_COMMENT,
  }, null, 2)}\n`;
}

export function verifyDatabaseIntegrity(connection: IntegrityCheckConnection): void {
  let integrityRows: unknown[];

  try {
    integrityRows = connection.prepare('PRAGMA integrity_check').all();
  } catch (error) {
    throw new DatabaseError('Failed to verify Chronicle database integrity.', error);
  }

  if (integrityRows.length === 0) {
    throw new DatabaseError('Chronicle database integrity check returned no result.');
  }

  const failures: string[] = [];

  for (const row of integrityRows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      failures.push('malformed integrity check result');
      continue;
    }

    const integrityValue = Reflect.get(row, 'integrity_check');

    if (integrityValue !== 'ok') {
      failures.push(typeof integrityValue === 'string' && integrityValue.trim() ? integrityValue.trim() : 'unknown integrity error');
    }
  }

  if (failures.length > 0) {
    throw new DatabaseError(`Chronicle database integrity check failed: ${failures.join('; ')}`);
  }
}

function replaceManagedInstructionBlock(existingContent: string, instructionBlock: string): string {
  const startIndex = existingContent.indexOf(INSTRUCTION_START_MARKER);
  const endIndex = existingContent.indexOf(INSTRUCTION_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    const trimmedContent = existingContent.trimEnd();

    if (!trimmedContent) {
      return instructionBlock;
    }

    return `${trimmedContent}\n\n${instructionBlock}`;
  }

  const before = existingContent.slice(0, startIndex).trimEnd();
  const after = existingContent.slice(endIndex + INSTRUCTION_END_MARKER.length).trimStart();
  const parts = [before, instructionBlock.trimEnd(), after].filter((part) => part.length > 0);

  return `${parts.join('\n\n')}\n`;
}

function ensureInstructionFile(filePath: string, instructionBlock: string): FileChangeState {
  const existingContent = readTextFileIfExists(filePath);
  const nextContent = replaceManagedInstructionBlock(existingContent ?? '', instructionBlock);

  if (existingContent === nextContent) {
    return 'unchanged';
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, nextContent, 'utf8');

  return existingContent === null ? 'created' : 'updated';
}

function ensureGitignoreEntry(gitignorePath: string): FileChangeState {
  const existingContent = readTextFileIfExists(gitignorePath);

  if (existingContent === null) {
    writeFileSync(gitignorePath, `${CHRONICLE_GITIGNORE_HEADER}\n${CHRONICLE_GITIGNORE_ENTRY}\n`, 'utf8');
    return 'created';
  }

  const normalizedContent = existingContent.replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');

  if (lines.includes(CHRONICLE_GITIGNORE_ENTRY)) {
    return 'unchanged';
  }

  if (lines.includes(CHRONICLE_GITIGNORE_HEADER)) {
    const headerIndex = lines.indexOf(CHRONICLE_GITIGNORE_HEADER);
    lines.splice(headerIndex + 1, 0, CHRONICLE_GITIGNORE_ENTRY);
  } else {
    const trimmedContent = normalizedContent.trimEnd();
    const block = `${CHRONICLE_GITIGNORE_HEADER}\n${CHRONICLE_GITIGNORE_ENTRY}`;
    const nextContent = trimmedContent ? `${trimmedContent}\n\n${block}\n` : `${block}\n`;

    writeFileSync(gitignorePath, nextContent, 'utf8');
    return 'updated';
  }

  writeFileSync(gitignorePath, `${lines.join('\n').replace(/\n*$/u, '')}\n`, 'utf8');
  return 'updated';
}

function isChronicleClaudeSessionStartEntry(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = ensureObject(value, 'Claude settings SessionStart entry');

  if (entry.matcher !== 'startup' || !Array.isArray(entry.hooks)) {
    return false;
  }

  return entry.hooks.some((hook) => {
    if (typeof hook !== 'object' || hook === null || Array.isArray(hook)) {
      return false;
    }

    const hookObject = ensureObject(hook, 'Claude settings hook entry');
    return hookObject.command === 'chronicle hook session-start';
  });
}

function renderMergedClaudeSettings(existingContent: string | null): string {
  const parsedRoot = existingContent === null ? {} : parseJsonObject<Record<string, unknown>>(existingContent, 'Claude settings');
  const hooksValue = parsedRoot.hooks;
  const hooksObject = hooksValue === undefined ? {} : ensureObject(hooksValue, 'Claude settings hooks');
  const sessionStartValue = hooksObject.SessionStart;
  const desiredEntry = createClaudeCodeHookConfig().hooks.SessionStart[0];
  const mergedEntries: unknown[] = [];
  let foundChronicleEntry = false;

  if (sessionStartValue !== undefined && !Array.isArray(sessionStartValue)) {
    throw new ValidationError('Claude settings hooks.SessionStart must be an array.');
  }

  for (const entry of sessionStartValue ?? []) {
    if (isChronicleClaudeSessionStartEntry(entry)) {
      if (!foundChronicleEntry) {
        mergedEntries.push(desiredEntry);
        foundChronicleEntry = true;
      }

      continue;
    }

    mergedEntries.push(entry);
  }

  if (!foundChronicleEntry) {
    mergedEntries.push(desiredEntry);
  }

  const nextRoot: Record<string, unknown> = {
    ...parsedRoot,
    hooks: {
      ...hooksObject,
      SessionStart: mergedEntries,
    },
  };

  return `${JSON.stringify(nextRoot, null, 2)}\n`;
}

function getSkillBaseDirectory(repoRoot: string, agent: SupportedAgent): string {
  switch (agent) {
    case 'claude-code':
      return join(repoRoot, '.claude', 'skills');
    case 'copilot':
      return join(repoRoot, '.github', 'skills');
  }
}

function getInstructionFilePath(repoRoot: string, agent: SupportedAgent): string {
  switch (agent) {
    case 'claude-code':
      return join(repoRoot, 'CLAUDE.md');
    case 'copilot':
      return join(repoRoot, '.github', 'copilot-instructions.md');
  }
}

function addChangedPath(paths: string[], path: string): void {
  if (!paths.includes(path)) {
    paths.push(path);
  }
}

function applyChange(state: FileChangeState, relativePath: string, result: InitCommandResult): void {
  if (state === 'created') {
    addChangedPath(result.created_paths, relativePath);
    return;
  }

  if (state === 'updated') {
    addChangedPath(result.updated_paths, relativePath);
  }
}

function ensureChronicleStorage(repoRoot: string, chronicleVersion: string, result: InitCommandResult): void {
  const paths = buildChroniclePaths(repoRoot);
  const chronicleDirectoryExisted = existsSync(paths.chronicleDir);

  mkdirSync(paths.chronicleDir, { recursive: true });

  if (!chronicleDirectoryExisted) {
    addChangedPath(result.created_paths, '.chronicle/');
  }

  const dbAlreadyExists = existsSync(paths.dbPath);
  const db = openDatabase(paths.dbPath);

  try {
    if (dbAlreadyExists) {
      verifyDatabaseIntegrity(db);
    }

    const previousSchemaVersion = dbAlreadyExists ? getCurrentSchemaVersion(db) : 0;
    initializeSchema(db);
    const nextSchemaVersion = getCurrentSchemaVersion(db);

    if (!dbAlreadyExists) {
      addChangedPath(result.created_paths, '.chronicle/chronicle.db');
    } else if (nextSchemaVersion > previousSchemaVersion) {
      addChangedPath(result.updated_paths, '.chronicle/chronicle.db');
    }
  } finally {
    db.close();
  }

  const existingConfig = existsSync(paths.configPath) ? readConfig(paths.configPath) : undefined;
  const desiredConfig = validateConfig({ ...(existingConfig ?? {}), chronicleVersion });
  const desiredConfigText = `${JSON.stringify(desiredConfig, null, 2)}\n`;
  const configWriteState = ensureFileContent(paths.configPath, desiredConfigText);

  applyChange(configWriteState, '.chronicle/config.json', result);
}

function ensureAgentArtifacts(repoRoot: string, agent: SupportedAgent, result: InitCommandResult): void {
  const skillsBaseDirectory = getSkillBaseDirectory(repoRoot, agent);

  for (const skillFile of getSkillTemplateFiles(agent)) {
    const skillPath = join(skillsBaseDirectory, skillFile.directoryName, 'SKILL.md');
    const relativePath = agent === 'claude-code'
      ? `.claude/skills/${skillFile.directoryName}/SKILL.md`
      : `.github/skills/${skillFile.directoryName}/SKILL.md`;

    applyChange(ensureFileContent(skillPath, renderManagedMarkdownContent(skillFile.content)), relativePath, result);
  }

  const config = readConfig(join(repoRoot, '.chronicle', 'config.json'));
  const instructionPath = getInstructionFilePath(repoRoot, agent);
  const instructionContent = agent === 'claude-code'
    ? renderClaudeMdInstructions(config)
    : renderCopilotInstructions(config);

  applyChange(
    ensureInstructionFile(instructionPath, instructionContent),
    agent === 'claude-code' ? 'CLAUDE.md' : '.github/copilot-instructions.md',
    result,
  );

  if (agent === 'claude-code') {
    const settingsPath = join(repoRoot, '.claude', 'settings.json');
    applyChange(
      ensureFileContent(settingsPath, renderMergedClaudeSettings(readTextFileIfExists(settingsPath))),
      '.claude/settings.json',
      result,
    );
    return;
  }

  const copilotHookPath = join(repoRoot, '.github', 'hooks', 'chronicle.json');
  applyChange(ensureFileContent(copilotHookPath, renderManagedJsonContent(renderCopilotHookConfig())), '.github/hooks/chronicle.json', result);
}

function collectAgentOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function executeInitCommand(options: InitCommandOptions, runtime: CommandRuntime): InitCommandResult {
  const repoRoot = findRepoRoot(runtime.cwd);

  if (!repoRoot) {
    throw new RepositoryError('Not inside a Git repository.');
  }

  const result: InitCommandResult = {
    created_paths: [],
    repo_root: repoRoot,
    target_agents: normalizeAgents(options.agent),
    updated_paths: [],
  };
  const chronicleVersion = readPackageVersion();

  ensureChronicleStorage(repoRoot, chronicleVersion, result);
  applyChange(ensureGitignoreEntry(join(repoRoot, '.gitignore')), '.gitignore', result);

  for (const agent of result.target_agents) {
    ensureAgentArtifacts(repoRoot, agent, result);
  }

  return result;
}

export function registerInitCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('init')
    .description('Initialize Chronicle in the current repository.')
    .option('--agent <agent>', 'Target agent integration to generate. Repeat for multiple agents.', collectAgentOption, [])
    .action(async (options: InitCommandOptions) => {
      await runRegisteredCommand(runtime, 'json', () => executeInitCommand(options, runtime), (result) => {
        writeJson(runtime, result);
      });
    })
    .showHelpAfterError();
}
