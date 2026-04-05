import type { DatabaseConnection } from './connection';
import { DatabaseError } from '../utils/errors';

export const CURRENT_SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  summary TEXT NOT NULL,
  session_agent TEXT,
  parent_ids TEXT DEFAULT '[]',
  superseded_by_id TEXT,
  token_count INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_active
  ON memories(superseded_by_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

export function initializeSchema(db: DatabaseConnection): void {
  try {
    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.exec(SCHEMA_SQL);

      const existing = db
        .prepare('SELECT version FROM schema_version WHERE version = ?')
        .get(CURRENT_SCHEMA_VERSION) as { version: number } | undefined;

      if (!existing) {
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(CURRENT_SCHEMA_VERSION, now);
      }
    });

    transaction();
  } catch (error) {
    throw new DatabaseError('Failed to initialize Chronicle schema.', error);
  }
}

export function getCurrentSchemaVersion(db: DatabaseConnection): number {
  try {
    const row = db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined;

    return row?.version ?? 0;
  } catch (error) {
    throw new DatabaseError('Failed to read Chronicle schema version.', error);
  }
}
