import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { DatabaseError } from '../utils/errors';

export type DatabaseConnection = Database.Database;

export interface OpenDatabaseOptions {
  fileMustExist?: boolean;
}

export function openDatabase(dbPath: string, options: OpenDatabaseOptions = {}): DatabaseConnection {
  let db: Database.Database | null = null;

  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    db = new Database(dbPath, { fileMustExist: options.fileMustExist ?? false });

    db.pragma('journal_mode = DELETE');

    return db;
  } catch (error) {
    db?.close();
    throw new DatabaseError(`Failed to open database at ${dbPath}.`, error);
  }
}
