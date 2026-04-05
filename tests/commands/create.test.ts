import { afterEach, describe, expect, it } from 'vitest';
import { executeCreateCommand } from '../../src/commands/create';
import { NotFoundError, ValidationError } from '../../src/utils/errors';
import { openDatabase } from '../../src/db/connection';
import { createQueries } from '../../src/db/queries';
import { createInitializedRepo, createTestRuntime, type TestRepo } from './helpers';

const repos: TestRepo[] = [];

function makeRepo() {
  const repo = createInitializedRepo();
  repos.push(repo);
  return repo;
}

afterEach(() => {
  while (repos.length > 0) {
    repos.pop()?.cleanup();
  }
});

describe('create command', () => {
  it('creates a memory from args input', async () => {
    const repo = makeRepo();
    const runtime = createTestRuntime({ cwd: repo.repoRoot, generatedIds: ['memory-1'] });

    const result = await executeCreateCommand(
      {
        agent: 'claude-code',
        description: 'JWT auth implementation details.',
        parentIds: '["parent-1"]',
        summary: '## Goals\n- Build auth',
        title: 'Auth implementation',
      },
      runtime,
    );

    expect(result.id).toBe('memory-1');

    const db = openDatabase(repo.dbPath, { fileMustExist: true });
    const memory = createQueries(db).getMemory('memory-1');
    db.close();

    expect(memory?.title).toBe('Auth implementation');
    expect(memory?.parentIds).toEqual(['parent-1']);
  });

  it('creates a memory from stdin input', async () => {
    const repo = makeRepo();
    const runtime = createTestRuntime({
      cwd: repo.repoRoot,
      generatedIds: ['memory-stdin'],
      stdinText: JSON.stringify({
        agent: 'copilot',
        description: 'Rate limiter middleware decisions.',
        parentIds: ['memory-a'],
        summary: '## Decisions\n- Added rate limiter',
        title: 'Rate limiter work',
      }),
    });

    const result = await executeCreateCommand({ stdin: true }, runtime);

    expect(result.id).toBe('memory-stdin');
    expect(result.token_count).toBeGreaterThan(0);
  });

  it('rejects summaries above the configured token limit', async () => {
    const repo = createInitializedRepo({ maxMemorySummaryTokens: 2 });
    repos.push(repo);
    const runtime = createTestRuntime({ cwd: repo.repoRoot, generatedIds: ['memory-overflow'] });

    await expect(
      executeCreateCommand(
        {
          description: 'Oversized summary test.',
          summary: 'a'.repeat(20),
          title: 'Too large',
        },
        runtime,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
