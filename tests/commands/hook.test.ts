import { afterEach, describe, expect, it } from 'vitest';
import { executeSessionStartHookCommand } from '../../src/commands/hook';
import { createInitializedRepo, createTestRuntime, seedMemory, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('hook session-start command', () => {
  it('returns an empty payload for an uninitialized repo', () => {
    const repo = createInitializedRepo();
    repos.push(repo);

    const result = executeSessionStartHookCommand(createTestRuntime({ cwd: repo.repoRoot + '-missing' }));

    expect(result).toEqual({});
  });

  it('returns an empty-store message when no memories exist', () => {
    const repo = createInitializedRepo();
    repos.push(repo);

    const result = executeSessionStartHookCommand(createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.hookSpecificOutput?.additionalContext).toContain('has no memories yet');
    expect(result.hookSpecificOutput?.additionalContext).toContain('/chronicle-memory');
    expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
  });

  it('returns a truncated catalog with browse instructions when needed', () => {
    const repo = createInitializedRepo({ maxCatalogEntries: 1 });
    repos.push(repo);
    seedMemory(repo, {
      createdAt: '2026-04-05T10:00:00.000Z',
      description: 'Older memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'older',
      title: 'Older',
    });
    seedMemory(repo, {
      createdAt: '2026-04-05T11:00:00.000Z',
      description: 'Newest memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'newest',
      title: 'Newest',
    });

    const result = executeSessionStartHookCommand(createTestRuntime({ cwd: repo.repoRoot }));
    const context = result.hookSpecificOutput?.additionalContext ?? '';

    expect(context).toContain('showing 1 of 2 active memories');
    expect(context).toContain('Older entries exist.');
    expect(context).toContain('chronicle list --offset 1 --limit 1');
    expect(context).toContain('Respect the project limits');
  });
});
