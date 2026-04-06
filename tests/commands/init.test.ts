import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig, writeConfig } from '../../src/config/config';
import { executeInitCommand, verifyDatabaseIntegrity } from '../../src/commands/init';
import { openDatabase } from '../../src/db/connection';
import { createQueries } from '../../src/db/queries';
import { CURRENT_SCHEMA_VERSION, getCurrentSchemaVersion, initializeSchema } from '../../src/db/schema';
import { ConfigError, DatabaseError, RepositoryError, ValidationError } from '../../src/utils/errors';
import { createGitRepo, createTestRuntime, seedMemory, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

function countOccurrences(content: string, fragment: string): number {
  return content.split(fragment).length - 1;
}

function makeGitRepo(): TestRepo {
  const repo = createGitRepo();
  repos.push(repo);
  return repo;
}

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('init command', () => {
  it('initializes Chronicle from a nested directory using the default claude-code target', () => {
    const repo = makeGitRepo();
    const nestedDirectory = join(repo.repoRoot, 'src', 'feature');

    mkdirSync(nestedDirectory, { recursive: true });

    const result = executeInitCommand({}, createTestRuntime({ cwd: nestedDirectory }));
    const config = readConfig(repo.configPath);
    const db = openDatabase(repo.dbPath, { fileMustExist: true });
    const schemaVersion = getCurrentSchemaVersion(db);
    db.close();

    expect(result.repo_root).toBe(repo.repoRoot);
    expect(result.target_agents).toEqual(['claude-code']);
    expect(result.created_paths).toContain('.chronicle/');
    expect(result.created_paths).toContain('.chronicle/chronicle.db');
    expect(result.created_paths).toContain('.chronicle/config.json');
    expect(result.created_paths).toContain('.gitignore');
    expect(result.created_paths).toContain('.claude/settings.json');
    expect(result.created_paths).toContain('.claude/skills/create-memory/SKILL.md');
    expect(result.created_paths).toContain('CLAUDE.md');
    expect(existsSync(repo.dbPath)).toBe(true);
    expect(schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(config.chronicleVersion).toBe('1.0.0');
    expect(readFileSync(join(repo.repoRoot, '.gitignore'), 'utf8')).toContain('.chronicle/chronicle.db-journal');
    expect(readFileSync(join(repo.repoRoot, '.claude', 'settings.json'), 'utf8')).toContain('chronicle hook session-start');
    expect(readFileSync(join(repo.repoRoot, 'CLAUDE.md'), 'utf8')).toContain('<!-- chronicle:start -->');
    expect(readFileSync(join(repo.repoRoot, '.claude', 'skills', 'create-memory', 'SKILL.md'), 'utf8')).toContain('This file is managed by Chronicle');
  });

  it('fails outside a git repository', () => {
    const repo = makeGitRepo();

    expect(() => executeInitCommand({}, createTestRuntime({ cwd: `${repo.repoRoot}-missing` }))).toThrow(RepositoryError);
  });

  it('rejects unsupported agents', () => {
    const repo = makeGitRepo();

    expect(() => executeInitCommand({ agent: ['codex'] }, createTestRuntime({ cwd: repo.repoRoot }))).toThrow(ValidationError);
  });

  it('returns no file changes on a no-op re-run', () => {
    const repo = makeGitRepo();
    const runtime = createTestRuntime({ cwd: repo.repoRoot });

    executeInitCommand({}, runtime);
    const result = executeInitCommand({}, runtime);

    expect(result.created_paths).toEqual([]);
    expect(result.updated_paths).toEqual([]);
  });

  it('is idempotent, preserves existing memories, refreshes config version, and does not duplicate managed blocks', () => {
    const repo = makeGitRepo();
    const runtime = createTestRuntime({ cwd: repo.repoRoot });

    executeInitCommand({}, runtime);

    const memoryId = seedMemory(repo, {
      description: 'Existing Chronicle memory.',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: '## Current State\n- Seeded memory',
      title: 'Seeded memory',
    });
    const claudePath = join(repo.repoRoot, 'CLAUDE.md');
    const existingClaudeContent = readFileSync(claudePath, 'utf8').trim();

    writeFileSync(claudePath, `User intro\n\n${existingClaudeContent}\n\nUser footer\n`, 'utf8');
    writeConfig(repo.configPath, {
      ...readConfig(repo.configPath),
      chronicleVersion: '0.0.1',
      maxMemoriesToPull: 9,
    });

    const result = executeInitCommand({}, runtime);
    const config = readConfig(repo.configPath);
    const db = openDatabase(repo.dbPath, { fileMustExist: true });
    const memory = createQueries(db).getMemory(memoryId);
    db.close();
    const claudeContent = readFileSync(claudePath, 'utf8');
    const gitignoreContent = readFileSync(join(repo.repoRoot, '.gitignore'), 'utf8');
    const settingsContent = readFileSync(join(repo.repoRoot, '.claude', 'settings.json'), 'utf8');

    expect(memory?.id).toBe(memoryId);
    expect(config.chronicleVersion).toBe('1.0.0');
    expect(config.maxMemoriesToPull).toBe(9);
    expect(result.updated_paths).toContain('.chronicle/config.json');
    expect(result.updated_paths).toContain('CLAUDE.md');
    expect(claudeContent).toContain('User intro');
    expect(claudeContent).toContain('User footer');
    expect(claudeContent).toContain('max 9 memories');
    expect(countOccurrences(claudeContent, '<!-- chronicle:start -->')).toBe(1);
    expect(countOccurrences(claudeContent, '<!-- chronicle:end -->')).toBe(1);
    expect(countOccurrences(gitignoreContent, '.chronicle/chronicle.db-journal')).toBe(1);
    expect(countOccurrences(settingsContent, 'chronicle hook session-start')).toBe(1);
  });

  it('initializes schema in an existing valid database and reports the database as updated', () => {
    const repo = makeGitRepo();

    mkdirSync(join(repo.repoRoot, '.chronicle'), { recursive: true });
    writeConfig(repo.configPath, { chronicleVersion: '0.0.1' });

    const db = openDatabase(repo.dbPath);
    db.close();

    const result = executeInitCommand({}, createTestRuntime({ cwd: repo.repoRoot }));
    const reopenedDb = openDatabase(repo.dbPath, { fileMustExist: true });
    const schemaVersion = getCurrentSchemaVersion(reopenedDb);
    reopenedDb.close();

    expect(schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.created_paths).not.toContain('.chronicle/chronicle.db');
    expect(result.updated_paths).toContain('.chronicle/chronicle.db');
  });

  it('rejects invalid existing Chronicle config files', () => {
    const repo = makeGitRepo();

    mkdirSync(join(repo.repoRoot, '.chronicle'), { recursive: true });
    writeFileSync(repo.configPath, '{\n  "maxMemoriesToPull": "bad"\n}\n', 'utf8');

    const db = openDatabase(repo.dbPath);
    initializeSchema(db);
    db.close();

    expect(() => executeInitCommand({}, createTestRuntime({ cwd: repo.repoRoot }))).toThrow(ConfigError);
  });

  it('rejects invalid existing claude settings structures', () => {
    const repo = makeGitRepo();
    const claudeSettingsPath = join(repo.repoRoot, '.claude', 'settings.json');

    mkdirSync(join(repo.repoRoot, '.claude'), { recursive: true });
    writeFileSync(claudeSettingsPath, '{\n  "hooks": {\n    "SessionStart": {}\n  }\n}\n', 'utf8');

    expect(() => executeInitCommand({}, createTestRuntime({ cwd: repo.repoRoot }))).toThrow(ValidationError);
  });

  it('inserts the chronicle gitignore entry directly under an existing Chronicle header', () => {
    const repo = makeGitRepo();
    const gitignorePath = join(repo.repoRoot, '.gitignore');

    writeFileSync(gitignorePath, 'node_modules/\n\n# Chronicle transient files\n.env\n', 'utf8');

    const result = executeInitCommand({}, createTestRuntime({ cwd: repo.repoRoot }));
    const gitignoreContent = readFileSync(gitignorePath, 'utf8');

    expect(result.updated_paths).toContain('.gitignore');
    expect(countOccurrences(gitignoreContent, '# Chronicle transient files')).toBe(1);
    expect(gitignoreContent).toContain('# Chronicle transient files\n.chronicle/chronicle.db-journal\n.env');
  });

  it('creates copilot artifacts when explicitly targeted and preserves other claude hooks when merging', () => {
    const repo = makeGitRepo();
    const claudeSettingsPath = join(repo.repoRoot, '.claude', 'settings.json');

    mkdirSync(join(repo.repoRoot, '.claude'), { recursive: true });
    writeFileSync(
      claudeSettingsPath,
      `${JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  command: 'echo existing-startup',
                  timeout: 1000,
                  type: 'command',
                },
              ],
              matcher: 'startup',
            },
          ],
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const result = executeInitCommand({ agent: ['claude-code', 'copilot', 'copilot'] }, createTestRuntime({ cwd: repo.repoRoot }));
    const mergedClaudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8')) as {
      hooks: {
        SessionStart: Array<{
          hooks: Array<{ command: string }>;
          matcher: string;
        }>;
      };
    };

    expect(result.target_agents).toEqual(['claude-code', 'copilot']);
    expect(existsSync(join(repo.repoRoot, '.github', 'hooks', 'chronicle.json'))).toBe(true);
    expect(existsSync(join(repo.repoRoot, '.github', 'skills', 'recall', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(repo.repoRoot, '.github', 'copilot-instructions.md'))).toBe(true);
    expect(readFileSync(join(repo.repoRoot, '.github', 'skills', 'recall', 'SKILL.md'), 'utf8')).toContain('This file is managed by Chronicle');
    expect(JSON.parse(readFileSync(join(repo.repoRoot, '.github', 'hooks', 'chronicle.json'), 'utf8')).$comment).toContain('managed by Chronicle');
    expect(mergedClaudeSettings.hooks.SessionStart).toHaveLength(2);
    expect(mergedClaudeSettings.hooks.SessionStart[0]?.hooks[0]?.command).toBe('echo existing-startup');
    expect(mergedClaudeSettings.hooks.SessionStart[1]?.hooks[0]?.command).toBe('chronicle hook session-start');
  });

  it('generates only copilot artifacts when copilot is the sole target and preserves yaml frontmatter before the managed header', () => {
    const repo = makeGitRepo();

    const result = executeInitCommand({ agent: [' COPILOT '] }, createTestRuntime({ cwd: repo.repoRoot }));
    const skillPath = join(repo.repoRoot, '.github', 'skills', 'recall', 'SKILL.md');
    const skillContent = readFileSync(skillPath, 'utf8');
    const frontmatterEnd = skillContent.indexOf('\n---\n', 4);
    const afterFrontmatter = skillContent.slice(frontmatterEnd + 5);

    expect(result.target_agents).toEqual(['copilot']);
    expect(existsSync(join(repo.repoRoot, '.claude'))).toBe(false);
    expect(existsSync(join(repo.repoRoot, 'CLAUDE.md'))).toBe(false);
    expect(skillContent.startsWith('---\nname: /recall\n')).toBe(true);
    expect(frontmatterEnd).toBeGreaterThan(0);
    expect(afterFrontmatter.startsWith('<!-- This file is managed by Chronicle.')).toBe(true);
  });

  it('overwrites Chronicle-owned copilot skill and hook artifacts on re-init', () => {
    const repo = makeGitRepo();
    const runtime = createTestRuntime({ cwd: repo.repoRoot });
    const skillPath = join(repo.repoRoot, '.github', 'skills', 'recall', 'SKILL.md');
    const hookPath = join(repo.repoRoot, '.github', 'hooks', 'chronicle.json');

    executeInitCommand({ agent: ['copilot'] }, runtime);

    writeFileSync(skillPath, 'custom local rewrite\n', 'utf8');
    writeFileSync(hookPath, '{\n  "hooks": [],\n  "$comment": "custom"\n}\n', 'utf8');

    const result = executeInitCommand({ agent: ['copilot'] }, runtime);
    const skillContent = readFileSync(skillPath, 'utf8');
    const hookContent = JSON.parse(readFileSync(hookPath, 'utf8')) as {
      $comment?: string;
      hooks: Array<{ command: string }>;
    };

    expect(result.updated_paths).toContain('.github/skills/recall/SKILL.md');
    expect(result.updated_paths).toContain('.github/hooks/chronicle.json');
    expect(skillContent).not.toContain('custom local rewrite');
    expect(skillContent).toContain('# /recall');
    expect(hookContent.$comment).toContain('managed by Chronicle');
    expect(hookContent.hooks[0]?.command).toBe('chronicle hook session-start');
  });

  it('deduplicates and refreshes existing Chronicle claude SessionStart hooks', () => {
    const repo = makeGitRepo();
    const claudeSettingsPath = join(repo.repoRoot, '.claude', 'settings.json');

    mkdirSync(join(repo.repoRoot, '.claude'), { recursive: true });
    writeFileSync(
      claudeSettingsPath,
      `${JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  command: 'chronicle hook session-start',
                  timeout: 1,
                  type: 'command',
                },
              ],
              matcher: 'startup',
            },
            {
              hooks: [
                {
                  command: 'chronicle hook session-start',
                  timeout: 2,
                  type: 'command',
                },
              ],
              matcher: 'startup',
            },
          ],
        },
      }, null, 2)}\n`,
      'utf8',
    );

    executeInitCommand({}, createTestRuntime({ cwd: repo.repoRoot }));

    const mergedClaudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8')) as {
      hooks: {
        SessionStart: Array<{
          hooks: Array<{ command: string; timeout: number; type: string }>;
          matcher: string;
        }>;
      };
    };

    expect(mergedClaudeSettings.hooks.SessionStart).toHaveLength(1);
    expect(mergedClaudeSettings.hooks.SessionStart[0]?.hooks[0]?.command).toBe('chronicle hook session-start');
    expect(mergedClaudeSettings.hooks.SessionStart[0]?.hooks[0]?.timeout).toBe(5000);
    expect(mergedClaudeSettings.hooks.SessionStart[0]?.hooks[0]?.type).toBe('command');
  });

  it('rejects non-ok integrity check results', () => {
    expect(() => verifyDatabaseIntegrity({
      prepare(): { all(): unknown[] } {
        return {
          all(): unknown[] {
            return [{ integrity_check: 'database disk image is malformed' }];
          },
        };
      },
    })).toThrow(DatabaseError);
  });

  it('rejects integrity check execution failures', () => {
    expect(() => verifyDatabaseIntegrity({
      prepare(): { all(): unknown[] } {
        throw new Error('sqlite failure');
      },
    })).toThrow(DatabaseError);
  });

  it('rejects malformed integrity check responses', () => {
    expect(() => verifyDatabaseIntegrity({
      prepare(): { all(): unknown[] } {
        return {
          all(): unknown[] {
            return [];
          },
        };
      },
    })).toThrow(DatabaseError);
  });

  it('rejects integrity check rows without an ok result string', () => {
    expect(() => verifyDatabaseIntegrity({
      prepare(): { all(): unknown[] } {
        return {
          all(): unknown[] {
            return [{ unexpected: 'value' }];
          },
        };
      },
    })).toThrow(DatabaseError);
  });
});
