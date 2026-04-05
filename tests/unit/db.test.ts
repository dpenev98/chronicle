import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/connection';
import { createQueries } from '../../src/db/queries';
import { CURRENT_SCHEMA_VERSION, getCurrentSchemaVersion, initializeSchema } from '../../src/db/schema';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronicle-db-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('database foundation', () => {
  it('opens a database and initializes schema', () => {
    const dir = createTempDir();
    const db = openDatabase(join(dir, 'chronicle.db'));

    initializeSchema(db);

    expect(getCurrentSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(db.pragma('journal_mode', { simple: true })).toBe('delete');

    db.close();
  });

  it('supports core query operations', () => {
    const dir = createTempDir();
    const db = openDatabase(join(dir, 'chronicle.db'));
    initializeSchema(db);
    const queries = createQueries(db);

    queries.insertMemory({
      id: 'memory-1',
      title: 'Auth implementation',
      description: 'JWT auth decisions for API routes.',
      summary: '## Goals\n- Add auth',
      sessionAgent: 'claude-code',
      parentIds: ['parent-1'],
      tokenCount: 5,
      createdAt: '2026-04-05T10:00:00.000Z',
      updatedAt: '2026-04-05T10:00:00.000Z',
    });

    expect(queries.memoryExists('memory-1')).toBe(true);
    expect(queries.getMemory('memory-1')?.parentIds).toEqual(['parent-1']);
    expect(queries.listMemories({ limit: 10, offset: 0 })).toHaveLength(1);

    const updated = queries.updateMemory({
      id: 'memory-1',
      description: 'Updated retrieval signal.',
      tokenCount: 9,
      updatedAt: '2026-04-05T10:05:00.000Z',
    });

    expect(updated).toBe(true);
    expect(queries.getMemory('memory-1')?.description).toBe('Updated retrieval signal.');

    queries.insertMemory({
      id: 'memory-2',
      title: 'Auth follow-up',
      description: 'Follow-up decisions.',
      summary: '## Decisions\n- Changed middleware',
      sessionAgent: 'copilot',
      parentIds: ['memory-1'],
      tokenCount: 8,
      createdAt: '2026-04-05T11:00:00.000Z',
      updatedAt: '2026-04-05T11:00:00.000Z',
    });

    expect(queries.findMemoriesReferencingParent('memory-1')).toHaveLength(1);
    expect(queries.supersedeMemory('memory-1', 'memory-2')).toBe(true);
    expect(queries.listMemories({ limit: 10, offset: 0 })).toHaveLength(1);
    expect(queries.listMemories({ includeSuperseded: true, limit: 10, offset: 0 })).toHaveLength(2);
    expect(queries.findMemoriesReferencingSupersession('memory-2')).toHaveLength(1);
    expect(queries.getSupersededBy('memory-1')).toBe('memory-2');
    expect(queries.deleteMemory('memory-1')).toBe(true);

    db.close();
  });
});
