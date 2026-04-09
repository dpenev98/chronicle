import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import packageMetadata from '../../package.json';
import { readConfig, writeConfig } from '../../src/config/config';
import { registerCreateCommand } from '../../src/commands/create';
import { registerDeleteCommand } from '../../src/commands/delete';
import { registerGetCommand } from '../../src/commands/get';
import { registerHookCommand } from '../../src/commands/hook';
import { registerInitCommand } from '../../src/commands/init';
import { registerListCommand } from '../../src/commands/list';
import { registerSupersedeCommand } from '../../src/commands/supersede';
import { registerUpdateCommand } from '../../src/commands/update';
import { ExitCode } from '../../src/utils/errors';
import { ensureObject, parseJsonObject } from '../../src/utils/validation';
import { createGitRepo, createTestRuntime, type TestRepo, type TestRuntime, type TestRuntimeOptions } from '../commands/helpers';

const repos: TestRepo[] = [];

function makeRepo(): TestRepo {
  const repo = createGitRepo();
  repos.push(repo);
  return repo;
}

function createIntegrationProgram(runtime: TestRuntime): Command {
  const program = new Command().name('chronicle');

  program.exitOverride();
  registerCreateCommand(program, runtime);
  registerInitCommand(program, runtime);
  registerUpdateCommand(program, runtime);
  registerGetCommand(program, runtime);
  registerListCommand(program, runtime);
  registerDeleteCommand(program, runtime);
  registerSupersedeCommand(program, runtime);
  registerHookCommand(program, runtime);

  return program;
}

async function runCliCommand(args: string[], runtimeOptions: TestRuntimeOptions): Promise<TestRuntime> {
  const runtime = createTestRuntime(runtimeOptions);
  const program = createIntegrationProgram(runtime);

  await program.parseAsync(['node', 'chronicle', ...args]);

  return runtime;
}

function parseStdoutObject(runtime: TestRuntime): Record<string, unknown> {
  expect(runtime.stderrBuffer).toBe('');
  expect(runtime.stdoutBuffer).not.toBe('');
  return parseJsonObject<Record<string, unknown>>(runtime.stdoutBuffer, 'CLI stdout');
}

function parseStderrObject(runtime: TestRuntime): Record<string, unknown> {
  expect(runtime.stdoutBuffer).toBe('');
  expect(runtime.stderrBuffer).not.toBe('');
  return parseJsonObject<Record<string, unknown>>(runtime.stderrBuffer, 'CLI stderr');
}

function parseStdoutText(runtime: TestRuntime): string {
  expect(runtime.stderrBuffer).toBe('');
  expect(runtime.stdoutBuffer).not.toBe('');
  return runtime.stdoutBuffer;
}

function getArrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    throw new Error(`Expected '${key}' to be an array.`);
  }

  return value;
}

function getRecordArrayField(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return getArrayField(record, key).map((value, index) => ensureObject(value, `${key}[${index}]`));
}

function getObjectField(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return ensureObject(record[key], key);
}

function getStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  if (typeof value !== 'string') {
    throw new Error(`Expected '${key}' to be a string.`);
  }

  return value;
}

function getNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];

  if (typeof value !== 'number') {
    throw new Error(`Expected '${key}' to be a number.`);
  }

  return value;
}

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('integration lifecycle', () => {
  it('runs the full init to delete lifecycle through registered CLI commands', async () => {
    const repo = makeRepo();

    const initRuntime = await runCliCommand(['init', '--agent', 'claude-code', '--agent', 'copilot'], {
      cwd: repo.repoRoot,
    });
    const initOutput = parseStdoutObject(initRuntime);

    expect(initOutput.target_agents).toEqual(['claude-code', 'copilot']);
    expect(initOutput.created_paths).toEqual(expect.arrayContaining([
      '.chronicle/',
      '.chronicle/chronicle.db',
      '.chronicle/config.json',
      '.claude/settings.json',
      '.github/hooks/chronicle.json',
      'CLAUDE.md',
      '.github/copilot-instructions.md',
    ]));

    const createOldRuntime = await runCliCommand([
      'create',
      '--title',
      'Initial memory',
      '--description',
      'Initial implementation notes.',
      '--summary',
      '## Goals\n- Capture lifecycle coverage',
      '--agent',
      'claude-code',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-old'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });
    const createOldOutput = parseStdoutObject(createOldRuntime);

    expect(createOldOutput.id).toBe('memory-old');

    const listBeforeUpdateRuntime = await runCliCommand(['list'], { cwd: repo.repoRoot });
    const listBeforeUpdateOutput = parseStdoutObject(listBeforeUpdateRuntime);
    const listBeforeUpdateItems = getArrayField(listBeforeUpdateOutput, 'items');

    expect(listBeforeUpdateOutput.total).toBe(1);
    expect(listBeforeUpdateItems).toHaveLength(1);
    expect(ensureObject(listBeforeUpdateItems[0], 'items[0]').id).toBe('memory-old');

    const getBeforeUpdateRuntime = await runCliCommand(['get', 'memory-old'], { cwd: repo.repoRoot });
    const getBeforeUpdateOutput = parseStdoutObject(getBeforeUpdateRuntime);

    expect(getBeforeUpdateOutput.title).toBe('Initial memory');
    expect(getBeforeUpdateOutput.description).toBe('Initial implementation notes.');

    const updateRuntime = await runCliCommand(['update', 'memory-old', '--stdin'], {
      cwd: repo.repoRoot,
      now: new Date('2026-04-05T12:30:00.000Z'),
      stdinText: JSON.stringify({
        agent: 'copilot',
        description: 'Updated implementation notes.',
        parentIds: ['seed-parent'],
        summary: '## Decisions\n- Updated lifecycle state',
      }),
    });
    const updateOutput = parseStdoutObject(updateRuntime);

    expect(updateOutput.id).toBe('memory-old');
    expect(getNumberField(updateOutput, 'token_count')).toBeGreaterThan(0);

    const getAfterUpdateRuntime = await runCliCommand(['get', 'memory-old'], { cwd: repo.repoRoot });
    const getAfterUpdateOutput = parseStdoutObject(getAfterUpdateRuntime);

    expect(getAfterUpdateOutput.description).toBe('Updated implementation notes.');
    expect(getAfterUpdateOutput.parent_ids).toEqual(['seed-parent']);
    expect(getAfterUpdateOutput.session_agent).toBe('copilot');

    const createNewRuntime = await runCliCommand([
      'create',
      '--title',
      'Replacement memory',
      '--description',
      'Replacement implementation notes.',
      '--summary',
      '## Outcome\n- Replacement memory created',
      '--agent',
      'claude-code',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-new'],
      now: new Date('2026-04-05T13:00:00.000Z'),
    });
    const createNewOutput = parseStdoutObject(createNewRuntime);

    expect(createNewOutput.id).toBe('memory-new');

    const supersedeRuntime = await runCliCommand(['supersede', 'memory-old', 'memory-new'], {
      cwd: repo.repoRoot,
    });
    const supersedeOutput = parseStdoutObject(supersedeRuntime);

    expect(supersedeOutput.old_id).toBe('memory-old');
    expect(supersedeOutput.new_id).toBe('memory-new');
    expect(supersedeOutput.repointed).toBe(false);

    const listAfterSupersedeRuntime = await runCliCommand(['list'], { cwd: repo.repoRoot });
    const listAfterSupersedeOutput = parseStdoutObject(listAfterSupersedeRuntime);
    const listAfterSupersedeItems = getArrayField(listAfterSupersedeOutput, 'items');

    expect(listAfterSupersedeOutput.total).toBe(1);
    expect(listAfterSupersedeItems).toHaveLength(1);
    expect(ensureObject(listAfterSupersedeItems[0], 'items[0]').id).toBe('memory-new');

    const deleteRuntime = await runCliCommand(['delete', 'memory-old', '--force'], { cwd: repo.repoRoot });
    const deleteOutput = parseStdoutObject(deleteRuntime);

    expect(deleteOutput).toEqual({ deleted: true, id: 'memory-old' });

    const listAfterDeleteRuntime = await runCliCommand(['list', '--include-superseded'], { cwd: repo.repoRoot });
    const listAfterDeleteOutput = parseStdoutObject(listAfterDeleteRuntime);
    const listAfterDeleteItems = getArrayField(listAfterDeleteOutput, 'items');

    expect(listAfterDeleteOutput.total).toBe(1);
    expect(listAfterDeleteItems).toHaveLength(1);
    expect(ensureObject(listAfterDeleteItems[0], 'items[0]').id).toBe('memory-new');
  });

  it('initializes from a nested directory and re-running init is a no-op through registered CLI commands', async () => {
    const repo = makeRepo();
    const nestedDirectory = join(repo.repoRoot, 'src', 'feature');

    mkdirSync(nestedDirectory, { recursive: true });

    const firstInitRuntime = await runCliCommand(['init'], { cwd: nestedDirectory });
    const firstInitOutput = parseStdoutObject(firstInitRuntime);

    expect(firstInitOutput.repo_root).toBe(repo.repoRoot);
    expect(firstInitOutput.target_agents).toEqual(['claude-code']);

    const createRuntime = await runCliCommand([
      'create',
      '--title',
      'Nested memory',
      '--description',
      'Created from a nested working directory.',
      '--summary',
      '## Goals\n- Verify nested cwd command resolution',
    ], {
      cwd: nestedDirectory,
      generatedIds: ['nested-memory'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });
    const createOutput = parseStdoutObject(createRuntime);

    expect(createOutput.id).toBe('nested-memory');

    const secondInitRuntime = await runCliCommand(['init'], { cwd: nestedDirectory });
    const secondInitOutput = parseStdoutObject(secondInitRuntime);

    expect(secondInitOutput.created_paths).toEqual([]);
    expect(secondInitOutput.updated_paths).toEqual([]);

    const getRuntime = await runCliCommand(['get', 'nested-memory'], { cwd: nestedDirectory });
    const getOutput = parseStdoutObject(getRuntime);

    expect(getOutput.id).toBe('nested-memory');
    expect(getOutput.description).toBe('Created from a nested working directory.');
  });

  it('uses config-driven default list limits and supports pagination with table output', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    writeConfig(repo.configPath, {
      ...readConfig(repo.configPath),
      maxCatalogEntries: 1,
    });

    await runCliCommand([
      'create',
      '--title',
      'First memory',
      '--description',
      'Oldest entry.',
      '--summary',
      'first',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-1'],
      now: new Date('2026-04-05T10:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Second memory',
      '--description',
      'Middle entry.',
      '--summary',
      'second',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-2'],
      now: new Date('2026-04-05T11:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Third memory',
      '--description',
      'Newest entry.',
      '--summary',
      'third',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-3'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const defaultListRuntime = await runCliCommand(['list'], { cwd: repo.repoRoot });
    const defaultListOutput = parseStdoutObject(defaultListRuntime);
    const defaultItems = getRecordArrayField(defaultListOutput, 'items');

    expect(getNumberField(defaultListOutput, 'limit')).toBe(1);
    expect(getNumberField(defaultListOutput, 'offset')).toBe(0);
    expect(getNumberField(defaultListOutput, 'total')).toBe(3);
    expect(defaultItems).toHaveLength(1);
    expect(defaultItems[0]?.id).toBe('memory-3');

    const pagedListRuntime = await runCliCommand(['list', '--limit', '1', '--offset', '1'], { cwd: repo.repoRoot });
    const pagedListOutput = parseStdoutObject(pagedListRuntime);
    const pagedItems = getRecordArrayField(pagedListOutput, 'items');

    expect(getNumberField(pagedListOutput, 'total')).toBe(3);
    expect(pagedItems).toHaveLength(1);
    expect(pagedItems[0]?.id).toBe('memory-2');

    const tableRuntime = await runCliCommand(['list', '--format', 'table', '--limit', '1', '--offset', '2'], { cwd: repo.repoRoot });
    const tableOutput = parseStdoutText(tableRuntime);

    expect(tableOutput).toContain('Showing 1 of 3 memories.');
    expect(tableOutput).toContain('ID');
    expect(tableOutput).toContain('Title');
    expect(tableOutput).toContain('memory-1');
    expect(tableOutput).toContain('First memory');
  });

  it('returns an empty hook payload before Chronicle is initialized', async () => {
    const repo = makeRepo();
    const nestedDirectory = join(repo.repoRoot, 'packages', 'agent');

    mkdirSync(nestedDirectory, { recursive: true });

    const hookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: nestedDirectory });
    const hookOutput = parseStdoutObject(hookRuntime);

    expect(hookOutput).toEqual({});
    expect(hookRuntime.exitCode).toBeUndefined();
  });

  it('returns empty-store guidance first and then a truncated catalog based on config limits', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });

    const emptyStoreHookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: repo.repoRoot });
    const emptyStoreHookOutput = parseStdoutObject(emptyStoreHookRuntime);
    const emptyStoreHookSpecificOutput = getObjectField(emptyStoreHookOutput, 'hookSpecificOutput');

    expect(getStringField(emptyStoreHookSpecificOutput, 'hookEventName')).toBe('SessionStart');
    expect(getStringField(emptyStoreHookSpecificOutput, 'additionalContext')).toContain('has no memories yet');

    writeConfig(repo.configPath, {
      ...readConfig(repo.configPath),
      maxCatalogEntries: 1,
    });

    await runCliCommand([
      'create',
      '--title',
      'Older memory',
      '--description',
      'Older catalog entry.',
      '--summary',
      'older',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['older-memory'],
      now: new Date('2026-04-05T10:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Newest memory',
      '--description',
      'Newest catalog entry.',
      '--summary',
      'newest',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['newest-memory'],
      now: new Date('2026-04-05T11:00:00.000Z'),
    });

    const catalogHookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: repo.repoRoot });
    const catalogHookOutput = parseStdoutObject(catalogHookRuntime);
    const catalogHookSpecificOutput = getObjectField(catalogHookOutput, 'hookSpecificOutput');
    const additionalContext = getStringField(catalogHookSpecificOutput, 'additionalContext');

    expect(additionalContext).toContain('showing 1 of 2 active memories');
    expect(additionalContext).toContain('newest-memory');
    expect(additionalContext).toContain('Older entries exist.');
    expect(additionalContext).toContain('chronicle list --offset 1 --limit 1');
  });

  it('converts invalid Chronicle config into a non-fatal hook warning', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    writeFileSync(repo.configPath, '{\n  "maxCatalogEntries": "bad"\n}\n', 'utf8');

    const hookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: repo.repoRoot });
    const hookOutput = parseStdoutObject(hookRuntime);
    const hookSpecificOutput = getObjectField(hookOutput, 'hookSpecificOutput');
    const additionalContext = getStringField(hookSpecificOutput, 'additionalContext');

    expect(hookRuntime.exitCode).toBeUndefined();
    expect(hookRuntime.stderrBuffer).toBe('');
    expect(getStringField(hookSpecificOutput, 'hookEventName')).toBe('SessionStart');
    expect(additionalContext).toContain('[Chronicle Warning]');
    expect(additionalContext).toContain('CONFIG_ERROR');
  });

  it('emits a Claude-compatible SessionStart payload with catalog context', async () => {
    const repo = makeRepo();

    await runCliCommand(['init', '--agent', 'claude-code'], { cwd: repo.repoRoot });
    await runCliCommand([
      'create',
      '--title',
      'Claude memory',
      '--description',
      'Catalog entry for Claude.',
      '--summary',
      '## Goals\n- Verify Claude hook payload',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['claude-memory'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const hookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: repo.repoRoot });
    const hookOutput = parseStdoutObject(hookRuntime);
    const hookSpecificOutput = getObjectField(hookOutput, 'hookSpecificOutput');
    const additionalContext = getStringField(hookSpecificOutput, 'additionalContext');

    expect(getStringField(hookSpecificOutput, 'hookEventName')).toBe('SessionStart');
    expect(additionalContext).toContain('[Chronicle Memory Catalog]');
    expect(additionalContext).toContain('claude-memory');
    expect(readFileSync(join(repo.repoRoot, '.claude', 'settings.json'), 'utf8')).toContain('chronicle hook session-start');
  });

  it('emits a Copilot-compatible SessionStart payload with catalog context', async () => {
    const repo = makeRepo();

    await runCliCommand(['init', '--agent', 'copilot'], { cwd: repo.repoRoot });
    await runCliCommand([
      'create',
      '--title',
      'Copilot memory',
      '--description',
      'Catalog entry for Copilot.',
      '--summary',
      '## Goals\n- Verify Copilot hook payload',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['copilot-memory'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const hookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: repo.repoRoot });
    const hookOutput = parseStdoutObject(hookRuntime);
    const hookSpecificOutput = getObjectField(hookOutput, 'hookSpecificOutput');
    const additionalContext = getStringField(hookSpecificOutput, 'additionalContext');

    expect(getStringField(hookSpecificOutput, 'hookEventName')).toBe('SessionStart');
    expect(additionalContext).toContain('[Chronicle Memory Catalog]');
    expect(additionalContext).toContain('copilot-memory');
    expect(readFileSync(join(repo.repoRoot, '.github', 'hooks', 'chronicle.json'), 'utf8')).toContain('chronicle hook session-start');
  });

  it('writes the copilot hook file with the correct event-keyed structure through registered CLI', async () => {
    const repo = makeRepo();

    await runCliCommand(['init', '--agent', 'copilot'], { cwd: repo.repoRoot });

    const hookPath = join(repo.repoRoot, '.github', 'hooks', 'chronicle.json');
    const hookContent = JSON.parse(readFileSync(hookPath, 'utf8')) as Record<string, unknown>;
    const hooks = hookContent.hooks as Record<string, unknown>;
    const sessionStart = hooks.SessionStart as Array<Record<string, unknown>>;

    expect(Array.isArray(hookContent.hooks)).toBe(false);
    expect(typeof hookContent.hooks).toBe('object');
    expect(hooks).toHaveProperty('SessionStart');
    expect(Array.isArray(sessionStart)).toBe(true);
    expect(sessionStart).toHaveLength(1);
    expect(sessionStart[0]).toEqual(expect.objectContaining({
      type: 'command',
      command: 'chronicle hook session-start',
      timeout: 5000,
    }));
    expect(hookContent.$comment).toContain('managed by Chronicle');
  });

  it('supports create and update stdin flows with summaries larger than 10KB', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    writeConfig(repo.configPath, {
      ...readConfig(repo.configPath),
      maxMemorySummaryTokens: 4000,
    });

    const largeCreateSummary = `## Goals\n${'a'.repeat(11000)}`;
    const createRuntime = await runCliCommand(['create', '--stdin'], {
      cwd: repo.repoRoot,
      generatedIds: ['large-memory'],
      now: new Date('2026-04-05T12:00:00.000Z'),
      stdinText: JSON.stringify({
        agent: 'claude-code',
        description: 'Large stdin payload create path.',
        summary: largeCreateSummary,
        title: 'Large payload memory',
      }),
    });
    const createOutput = parseStdoutObject(createRuntime);

    expect(getNumberField(createOutput, 'token_count')).toBeGreaterThan(2500);

    const largeUpdateSummary = `## Decisions\n${'b'.repeat(12000)}`;
    const updateRuntime = await runCliCommand(['update', 'large-memory', '--stdin'], {
      cwd: repo.repoRoot,
      now: new Date('2026-04-05T12:30:00.000Z'),
      stdinText: JSON.stringify({
        description: 'Large stdin payload update path.',
        summary: largeUpdateSummary,
      }),
    });
    const updateOutput = parseStdoutObject(updateRuntime);

    expect(getNumberField(updateOutput, 'token_count')).toBeGreaterThan(3000);

    const getRuntime = await runCliCommand(['get', 'large-memory'], { cwd: repo.repoRoot });
    const getOutput = parseStdoutObject(getRuntime);

    expect(getOutput.description).toBe('Large stdin payload update path.');
    expect(getStringField(getOutput, 'summary').length).toBe(largeUpdateSummary.length);
  });

  it('returns structured system errors when the Chronicle database is missing', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    rmSync(repo.dbPath, { force: true });

    const listRuntime = await runCliCommand(['list'], { cwd: repo.repoRoot });
    const errorOutput = parseStderrObject(listRuntime);

    expect(listRuntime.exitCode).toBe(ExitCode.SystemError);
    expect(errorOutput.code).toBe('DATABASE_ERROR');
    expect(getStringField(errorOutput, 'message')).toContain('Failed to open database');
  });

  it('supports interactive delete cancellation and confirmation flows', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    await runCliCommand([
      'create',
      '--title',
      'Interactive delete memory',
      '--description',
      'Used to verify interactive delete behavior.',
      '--summary',
      'delete me interactively',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['interactive-delete-memory'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const cancelDeleteRuntime = await runCliCommand(['delete', 'interactive-delete-memory'], {
      confirmResponse: false,
      cwd: repo.repoRoot,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const cancelDeleteOutput = parseStderrObject(cancelDeleteRuntime);

    expect(cancelDeleteRuntime.exitCode).toBe(ExitCode.UserError);
    expect(cancelDeleteRuntime.confirmMessages).toEqual(["Delete memory 'interactive-delete-memory' permanently? [y/N]"]);
    expect(cancelDeleteOutput.code).toBe('OPERATION_CANCELED');
    expect(getStringField(cancelDeleteOutput, 'message')).toBe('Deletion canceled.');

    const getAfterCancelRuntime = await runCliCommand(['get', 'interactive-delete-memory'], { cwd: repo.repoRoot });
    const getAfterCancelOutput = parseStdoutObject(getAfterCancelRuntime);

    expect(getAfterCancelOutput.id).toBe('interactive-delete-memory');

    const confirmDeleteRuntime = await runCliCommand(['delete', 'interactive-delete-memory'], {
      confirmResponse: true,
      cwd: repo.repoRoot,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });
    const confirmDeleteOutput = parseStdoutObject(confirmDeleteRuntime);

    expect(confirmDeleteOutput).toEqual({ deleted: true, id: 'interactive-delete-memory' });
  });

  it('returns structured parent and supersession references when deletion is blocked', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    await runCliCommand([
      'create',
      '--title',
      'Target memory',
      '--description',
      'Memory that will be referenced in multiple ways.',
      '--summary',
      'target',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['target-memory'],
      now: new Date('2026-04-05T10:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Child memory',
      '--description',
      'References the target as a parent.',
      '--summary',
      'child',
      '--parent-ids',
      '["target-memory"]',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['child-memory'],
      now: new Date('2026-04-05T11:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Superseded memory',
      '--description',
      'Will point to the target as its replacement.',
      '--summary',
      'superseded',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['superseded-memory'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });
    await runCliCommand(['supersede', 'superseded-memory', 'target-memory'], { cwd: repo.repoRoot });

    const deleteRuntime = await runCliCommand(['delete', 'target-memory'], { cwd: repo.repoRoot });
    const deleteOutput = parseStderrObject(deleteRuntime);
    const details = getObjectField(deleteOutput, 'details');
    const parentReferences = getRecordArrayField(details, 'parent_references');
    const supersessionReferences = getRecordArrayField(details, 'supersession_references');

    expect(deleteRuntime.exitCode).toBe(ExitCode.UserError);
    expect(deleteOutput.code).toBe('VALIDATION_ERROR');
    expect(getStringField(deleteOutput, 'message')).toContain('Re-run with --force to delete it');
    expect(parentReferences).toEqual([{ id: 'child-memory', title: 'Child memory' }]);
    expect(supersessionReferences).toEqual([{ id: 'superseded-memory', title: 'Superseded memory' }]);
  });

  it('supports supersession repointing and rejects cycle creation with structured CLI errors', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    await runCliCommand([
      'create',
      '--title',
      'Memory A',
      '--description',
      'Original memory.',
      '--summary',
      'A',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-a'],
      now: new Date('2026-04-05T10:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Memory B',
      '--description',
      'First replacement.',
      '--summary',
      'B',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-b'],
      now: new Date('2026-04-05T11:00:00.000Z'),
    });
    await runCliCommand([
      'create',
      '--title',
      'Memory C',
      '--description',
      'Second replacement.',
      '--summary',
      'C',
    ], {
      cwd: repo.repoRoot,
      generatedIds: ['memory-c'],
      now: new Date('2026-04-05T12:00:00.000Z'),
    });

    const firstSupersedeRuntime = await runCliCommand(['supersede', 'memory-a', 'memory-b'], { cwd: repo.repoRoot });
    const firstSupersedeOutput = parseStdoutObject(firstSupersedeRuntime);

    expect(firstSupersedeOutput.repointed).toBe(false);

    const secondSupersedeRuntime = await runCliCommand(['supersede', 'memory-a', 'memory-c'], { cwd: repo.repoRoot });
    const secondSupersedeOutput = parseStdoutObject(secondSupersedeRuntime);

    expect(secondSupersedeOutput.repointed).toBe(true);

    const getRuntime = await runCliCommand(['get', 'memory-a'], { cwd: repo.repoRoot });
    const getOutput = parseStdoutObject(getRuntime);

    expect(getOutput.superseded_by_id).toBe('memory-c');

    const cycleRuntime = await runCliCommand(['supersede', 'memory-c', 'memory-a'], { cwd: repo.repoRoot });
    const cycleOutput = parseStderrObject(cycleRuntime);

    expect(cycleRuntime.exitCode).toBe(ExitCode.UserError);
    expect(cycleOutput.code).toBe('VALIDATION_ERROR');
    expect(getStringField(cycleOutput, 'message')).toContain('would create a cycle');
  });

  it('keeps hook execution graceful when the Chronicle database is corrupt', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });
    writeFileSync(repo.dbPath, 'not-a-sqlite-database', 'utf8');

    const hookRuntime = await runCliCommand(['hook', 'session-start'], { cwd: repo.repoRoot });
    const hookOutput = parseStdoutObject(hookRuntime);
    const hookSpecificOutput = getObjectField(hookOutput, 'hookSpecificOutput');
    const additionalContext = getStringField(hookSpecificOutput, 'additionalContext');

    expect(hookRuntime.exitCode).toBeUndefined();
    expect(hookRuntime.stderrBuffer).toBe('');
    expect(getStringField(hookSpecificOutput, 'hookEventName')).toBe('SessionStart');
    expect(additionalContext).toContain('[Chronicle Warning]');
    expect(additionalContext).toContain('DATABASE_ERROR');
  });

  it('returns structured user errors for invalid stdin input', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });

    const createRuntime = await runCliCommand(['create', '--stdin'], {
      cwd: repo.repoRoot,
      stdinText: '{',
    });
    const errorOutput = parseStderrObject(createRuntime);

    expect(createRuntime.exitCode).toBe(ExitCode.UserError);
    expect(errorOutput.code).toBe('VALIDATION_ERROR');
    expect(getStringField(errorOutput, 'message')).toContain('stdin input is not valid JSON');
  });

  it('returns text-formatted validation errors for table output requests', async () => {
    const repo = makeRepo();

    await runCliCommand(['init'], { cwd: repo.repoRoot });

    const listRuntime = await runCliCommand(['list', '--format', 'table', '--limit', 'bad'], { cwd: repo.repoRoot });

    expect(listRuntime.exitCode).toBe(ExitCode.UserError);
    expect(listRuntime.stdoutBuffer).toBe('');
    expect(listRuntime.stderrBuffer.trim()).toBe('VALIDATION_ERROR: limit must be a non-negative integer.');
  });

  it('exposes a working chronicle binary that can execute --version', () => {
    const binEntry = ensureObject(packageMetadata.bin, 'package.bin');
    const binPath = getStringField(binEntry, 'chronicle');
    const binFilePath = join(__dirname, '..', '..', binPath);

    expect(binPath).toBe('bin/chronicle.js');

    const result = spawnSync('node', [binFilePath, '--version'], {
      encoding: 'utf8',
      cwd: join(__dirname, '..', '..'),
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });
});
