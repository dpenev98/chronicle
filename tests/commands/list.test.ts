import { afterEach, describe, expect, it } from 'vitest';
import { executeListCommand } from '../../src/commands/list';
import { ValidationError } from '../../src/utils/errors';
import { createInitializedRepo, createTestRuntime, seedMemory, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('list command', () => {
  it('uses config maxCatalogEntries by default and excludes superseded memories', () => {
    const repo = createInitializedRepo({ maxCatalogEntries: 1 });
    repos.push(repo);
    const oldId = seedMemory(repo, {
      createdAt: '2026-04-05T10:00:00.000Z',
      description: 'Old memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'old',
      title: 'Old',
    });
    const newId = seedMemory(repo, {
      createdAt: '2026-04-05T11:00:00.000Z',
      description: 'New memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'new',
      title: 'New',
    });
    seedMemory(repo, {
      createdAt: '2026-04-05T12:00:00.000Z',
      description: 'Superseded memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'superseded',
      supersededById: newId,
      title: 'Superseded',
    });

    const result = executeListCommand({}, createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(newId);
    expect(result.total).toBe(2);
    expect(result.items.find((item) => item.id === oldId)).toBeUndefined();
  });

  it('includes superseded memories when requested and supports table format', () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const memoryId = seedMemory(repo, {
      description: 'List everything',
      parentIds: [],
      sessionAgent: 'copilot',
      summary: 'summary',
      title: 'List memory',
    });

    const result = executeListCommand({ format: 'table', includeSuperseded: true, limit: '10', offset: '0' }, createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.format).toBe('table');
    expect(result.items[0]?.id).toBe(memoryId);
  });

  it('rejects invalid formats', () => {
    const repo = createInitializedRepo();
    repos.push(repo);

    expect(() => executeListCommand({ format: 'xml' }, createTestRuntime({ cwd: repo.repoRoot }))).toThrow(ValidationError);
  });
});
