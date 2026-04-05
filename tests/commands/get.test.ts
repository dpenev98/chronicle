import { afterEach, describe, expect, it } from 'vitest';
import { executeGetCommand } from '../../src/commands/get';
import { NotFoundError } from '../../src/utils/errors';
import { createInitializedRepo, createTestRuntime, seedMemory, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('get command', () => {
  it('returns a full memory payload', () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Description signal.',
      parentIds: ['parent-1'],
      sessionAgent: 'claude-code',
      summary: '## Goals\n- Retrieve memory',
      title: 'Get memory',
    });

    const result = executeGetCommand(id, createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.id).toBe(id);
    expect(result.parent_ids).toEqual(['parent-1']);
    expect(result.session_agent).toBe('claude-code');
  });

  it('throws when the memory is missing', () => {
    const repo = createInitializedRepo();
    repos.push(repo);

    expect(() => executeGetCommand('missing-id', createTestRuntime({ cwd: repo.repoRoot }))).toThrow(NotFoundError);
  });
});
