import { afterEach, describe, expect, it } from 'vitest';
import { executeUpdateCommand } from '../../src/commands/update';
import { NotFoundError, ValidationError } from '../../src/utils/errors';
import { openDatabase } from '../../src/db/connection';
import { createQueries } from '../../src/db/queries';
import { createInitializedRepo, createTestRuntime, seedMemory, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('update command', () => {
  it('updates only provided fields and preserves the rest', async () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Original description.',
      parentIds: [],
      sessionAgent: 'claude-code',
      summary: '## Goals\n- Initial work',
      title: 'Original title',
    });

    const result = await executeUpdateCommand(id, { description: 'Updated description.' }, createTestRuntime({ cwd: repo.repoRoot }));

    expect(result.id).toBe(id);

    const db = openDatabase(repo.dbPath, { fileMustExist: true });
    const memory = createQueries(db).getMemory(id);
    db.close();

    expect(memory?.title).toBe('Original title');
    expect(memory?.description).toBe('Updated description.');
  });

  it('supports stdin updates and recalculates token count when summary changes', async () => {
    const repo = createInitializedRepo();
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Original summary',
      parentIds: [],
      sessionAgent: 'copilot',
      summary: 'short',
      title: 'Summary update',
    });
    const runtime = createTestRuntime({
      cwd: repo.repoRoot,
      stdinText: JSON.stringify({ summary: 'This is a much longer updated summary.' }),
    });

    const result = await executeUpdateCommand(id, { stdin: true }, runtime);

    expect(result.token_count).toBeGreaterThan(2);
  });

  it('fails when the target memory does not exist', async () => {
    const repo = createInitializedRepo();
    repos.push(repo);

    await expect(executeUpdateCommand('missing-id', { description: 'noop' }, createTestRuntime({ cwd: repo.repoRoot }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects oversized updated summaries', async () => {
    const repo = createInitializedRepo({ maxMemorySummaryTokens: 1 });
    repos.push(repo);
    const id = seedMemory(repo, {
      description: 'Original summary',
      parentIds: [],
      sessionAgent: 'copilot',
      summary: 'short',
      title: 'Summary update',
    });

    await expect(
      executeUpdateCommand(id, { summary: 'this is too long' }, createTestRuntime({ cwd: repo.repoRoot })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
