import { afterEach, describe, expect, it } from 'vitest';
import { executeDeleteCommand } from '../../src/commands/delete';
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

describe('delete command', () => {
  it('requires force in non-interactive mode', async () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Delete test',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'delete me',
      title: 'Delete me',
    });

    await expect(executeDeleteCommand(id, {}, createTestRuntime({ cwd: repo.repoRoot, stdinIsTTY: false, stdoutIsTTY: false }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('deletes memories with force', async () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Delete test',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'delete me',
      title: 'Delete me',
    });

    const result = await executeDeleteCommand(id, { force: true }, createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.deleted).toBe(true);

    const db = openDatabase(repo.dbPath, { fileMustExist: true });
    const memory = createQueries(db).getMemory(id);
    db.close();

    expect(memory).toBeNull();
  });

  it('requires force when the memory is referenced by other memories', async () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const parentId = seedMemory(repo, {
      description: 'Parent memory',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: 'parent',
      title: 'Parent',
    });
    seedMemory(repo, {
      description: 'Child memory',
      parentIds: [parentId],
      sessionAgent: 'claude-code',
      summary: 'child',
      title: 'Child',
    });

    await expect(executeDeleteCommand(parentId, {}, createTestRuntime({ cwd: repo.repoRoot }))).rejects.toBeInstanceOf(ValidationError);
  });
});
