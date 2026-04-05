import { afterEach, describe, expect, it } from 'vitest';
import { executeSupersedeCommand } from '../../src/commands/supersede';
import { ValidationError } from '../../src/utils/errors';
import { openDatabase } from '../../src/db/connection';
import { createQueries } from '../../src/db/queries';
import { createInitializedRepo, createTestRuntime, seedMemory, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('supersede command', () => {
  it('marks one memory as superseded by another', () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const oldId = seedMemory(repo, {
      description: 'Old strategy',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'old',
      title: 'Old',
    });
    const newId = seedMemory(repo, {
      description: 'New strategy',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'new',
      title: 'New',
    });

    const result = executeSupersedeCommand(oldId, newId, createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.old_id).toBe(oldId);
    expect(result.new_id).toBe(newId);
    expect(result.repointed).toBe(false);

    const db = openDatabase(repo.dbPath, { fileMustExist: true });
    const memory = createQueries(db).getMemory(oldId);
    db.close();

    expect(memory?.supersededById).toBe(newId);
  });

  it('rejects self-supersession', () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Single memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'single',
      title: 'Single',
    });

    expect(() => executeSupersedeCommand(id, id, createTestRuntime({ cwd: repo.repoRoot }))).toThrow(ValidationError);
  });

  it('rejects supersession cycles', () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const a = seedMemory(repo, {
      description: 'A',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'A',
      title: 'A',
    });
    const b = seedMemory(repo, {
      description: 'B',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'B',
      title: 'B',
    });

    executeSupersedeCommand(a, b, createTestRuntime({ cwd: repo.repoRoot }));

    expect(() => executeSupersedeCommand(b, a, createTestRuntime({ cwd: repo.repoRoot }))).toThrow(ValidationError);
  });
});
