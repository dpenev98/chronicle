import type { DatabaseConnection } from './connection';
import { DatabaseError } from '../utils/errors';

export interface MemoryRecord {
  id: string;
  title: string;
  description: string;
  summary: string;
  sessionAgent: string | null;
  parentIds: string[];
  supersededById: string | null;
  tokenCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryListItem {
  id: string;
  title: string;
  description: string;
  tokenCount: number | null;
  createdAt: string;
  supersededById: string | null;
}

export interface InsertMemoryInput {
  id: string;
  title: string;
  description: string;
  summary: string;
  sessionAgent?: string;
  parentIds: string[];
  supersededById?: string | null;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateMemoryInput {
  id: string;
  title?: string;
  description?: string;
  summary?: string;
  sessionAgent?: string;
  parentIds?: string[];
  tokenCount?: number;
  updatedAt: string;
}

export interface ListMemoriesOptions {
  includeSuperseded?: boolean;
  limit: number;
  offset: number;
}

export interface MemoryReference {
  id: string;
  title: string;
}

interface MemoryRow {
  id: string;
  title: string;
  description: string;
  summary: string;
  sessionAgent: string | null;
  parentIds: string;
  supersededById: string | null;
  tokenCount: number | null;
  createdAt: string;
  updatedAt: string;
}

interface MemoryListRow {
  id: string;
  title: string;
  description: string;
  tokenCount: number | null;
  createdAt: string;
  supersededById: string | null;
}

function toParentIdsJson(parentIds: string[]): string {
  return JSON.stringify(parentIds);
}

function parseParentIdsJson(parentIds: string): string[] {
  try {
    const parsed = JSON.parse(parentIds) as unknown;

    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
      throw new Error('Invalid parent_ids payload.');
    }

    return parsed;
  } catch (error) {
    throw new DatabaseError('Stored memory has invalid parent_ids JSON.', error);
  }
}

function mapMemoryRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    summary: row.summary,
    sessionAgent: row.sessionAgent,
    parentIds: parseParentIdsJson(row.parentIds),
    supersededById: row.supersededById,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapListRow(row: MemoryListRow): MemoryListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
    supersededById: row.supersededById,
  };
}

export function createQueries(db: DatabaseConnection) {
  const insertMemoryStatement = db.prepare(`
    INSERT INTO memories (
      id,
      title,
      description,
      summary,
      session_agent,
      parent_ids,
      superseded_by_id,
      token_count,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @title,
      @description,
      @summary,
      @sessionAgent,
      @parentIds,
      @supersededById,
      @tokenCount,
      @createdAt,
      @updatedAt
    )
  `);

  const getMemoryStatement = db.prepare(`
    SELECT
      id,
      title,
      description,
      summary,
      session_agent AS sessionAgent,
      parent_ids AS parentIds,
      superseded_by_id AS supersededById,
      token_count AS tokenCount,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM memories
    WHERE id = ?
  `);

  const listActiveMemoriesStatement = db.prepare(`
    SELECT
      id,
      title,
      description,
      token_count AS tokenCount,
      created_at AS createdAt,
      superseded_by_id AS supersededById
    FROM memories
    WHERE superseded_by_id IS NULL
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `);

  const listAllMemoriesStatement = db.prepare(`
    SELECT
      id,
      title,
      description,
      token_count AS tokenCount,
      created_at AS createdAt,
      superseded_by_id AS supersededById
    FROM memories
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `);

  const countActiveMemoriesStatement = db.prepare('SELECT COUNT(*) AS count FROM memories WHERE superseded_by_id IS NULL');
  const countAllMemoriesStatement = db.prepare('SELECT COUNT(*) AS count FROM memories');
  const memoryExistsStatement = db.prepare('SELECT id FROM memories WHERE id = ?');
  const deleteMemoryStatement = db.prepare('DELETE FROM memories WHERE id = ?');
  const updateMemoryStatement = db.prepare(`
    UPDATE memories
    SET
      title = COALESCE(@title, title),
      description = COALESCE(@description, description),
      summary = COALESCE(@summary, summary),
      session_agent = COALESCE(@sessionAgent, session_agent),
      parent_ids = COALESCE(@parentIds, parent_ids),
      token_count = COALESCE(@tokenCount, token_count),
      updated_at = @updatedAt
    WHERE id = @id
  `);

  const supersedeMemoryStatement = db.prepare('UPDATE memories SET superseded_by_id = ? WHERE id = ?');
  const referencingParentsStatement = db.prepare(`
    SELECT id, title
    FROM memories
    WHERE EXISTS (
      SELECT 1
      FROM json_each(memories.parent_ids)
      WHERE json_each.value = @id
    )
    ORDER BY created_at DESC
  `);
  const referencedBySupersessionStatement = db.prepare(`
    SELECT id, title
    FROM memories
    WHERE superseded_by_id = @id
    ORDER BY created_at DESC
  `);
  const getSupersededByStatement = db.prepare('SELECT superseded_by_id AS supersededById FROM memories WHERE id = ?');

  return {
    insertMemory(input: InsertMemoryInput): void {
      try {
        insertMemoryStatement.run({
          ...input,
          parentIds: toParentIdsJson(input.parentIds),
          sessionAgent: input.sessionAgent ?? null,
          supersededById: input.supersededById ?? null,
        });
      } catch (error) {
        throw new DatabaseError('Failed to insert memory.', error);
      }
    },

    updateMemory(input: UpdateMemoryInput): boolean {
      try {
        const result = updateMemoryStatement.run({
          id: input.id,
          title: input.title ?? null,
          description: input.description ?? null,
          summary: input.summary ?? null,
          parentIds: input.parentIds ? toParentIdsJson(input.parentIds) : null,
          sessionAgent: input.sessionAgent ?? null,
          tokenCount: input.tokenCount ?? null,
          updatedAt: input.updatedAt,
        });

        return result.changes > 0;
      } catch (error) {
        throw new DatabaseError(`Failed to update memory ${input.id}.`, error);
      }
    },

    getMemory(id: string): MemoryRecord | null {
      try {
        const row = getMemoryStatement.get(id) as MemoryRow | undefined;

        return row ? mapMemoryRow(row) : null;
      } catch (error) {
        throw new DatabaseError(`Failed to load memory ${id}.`, error);
      }
    },

    listMemories(options: ListMemoriesOptions): MemoryListItem[] {
      try {
        const statement = options.includeSuperseded ? listAllMemoriesStatement : listActiveMemoriesStatement;
        const rows = statement.all({ limit: options.limit, offset: options.offset }) as MemoryListRow[];

        return rows.map(mapListRow);
      } catch (error) {
        throw new DatabaseError('Failed to list memories.', error);
      }
    },

    countMemories(includeSuperseded = false): number {
      try {
        const statement = includeSuperseded ? countAllMemoriesStatement : countActiveMemoriesStatement;
        const row = statement.get() as { count: number };

        return row.count;
      } catch (error) {
        throw new DatabaseError('Failed to count memories.', error);
      }
    },

    deleteMemory(id: string): boolean {
      try {
        const result = deleteMemoryStatement.run(id);

        return result.changes > 0;
      } catch (error) {
        throw new DatabaseError(`Failed to delete memory ${id}.`, error);
      }
    },

    supersedeMemory(oldId: string, newId: string): boolean {
      try {
        const result = supersedeMemoryStatement.run(newId, oldId);

        return result.changes > 0;
      } catch (error) {
        throw new DatabaseError(`Failed to supersede memory ${oldId} with ${newId}.`, error);
      }
    },

    memoryExists(id: string): boolean {
      try {
        return Boolean(memoryExistsStatement.get(id));
      } catch (error) {
        throw new DatabaseError(`Failed to check if memory ${id} exists.`, error);
      }
    },

    findMemoriesReferencingParent(id: string): MemoryReference[] {
      try {
        return referencingParentsStatement.all({ id }) as MemoryReference[];
      } catch (error) {
        throw new DatabaseError(`Failed to find parent references for memory ${id}.`, error);
      }
    },

    findMemoriesReferencingSupersession(id: string): MemoryReference[] {
      try {
        return referencedBySupersessionStatement.all({ id }) as MemoryReference[];
      } catch (error) {
        throw new DatabaseError(`Failed to find supersession references for memory ${id}.`, error);
      }
    },

    getSupersededBy(id: string): string | null {
      try {
        const row = getSupersededByStatement.get(id) as { supersededById: string | null } | undefined;

        return row?.supersededById ?? null;
      } catch (error) {
        throw new DatabaseError(`Failed to read supersession target for memory ${id}.`, error);
      }
    },
  };
}

export type ChronicleQueries = ReturnType<typeof createQueries>;
