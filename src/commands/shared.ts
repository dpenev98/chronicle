import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { stdout as processStdout, stderr as processStderr, stdin as processStdin } from 'node:process';
import type { Command } from 'commander';
import type { ChronicleConfig } from '../config/config';
import { readConfig } from '../config/config';
import { openDatabase, type DatabaseConnection } from '../db/connection';
import { createQueries, type ChronicleQueries, type MemoryListItem, type MemoryRecord } from '../db/queries';
import { type ErrorFormat, ExitCode, RepositoryError, ValidationError, formatError, getExitCode } from '../utils/errors';
import { resolveChroniclePaths, type ChroniclePaths } from '../utils/paths';

export interface CommandRuntime {
  confirm(message: string): Promise<boolean>;
  cwd: string;
  generateId(): string;
  now(): Date;
  setExitCode(code: ExitCode): void;
  stderr(text: string): void;
  stdin: NodeJS.ReadableStream;
  stdinIsTTY: boolean;
  stdout(text: string): void;
  stdoutIsTTY: boolean;
}

export interface ChronicleCommandContext {
  close(): void;
  config: ChronicleConfig;
  db: DatabaseConnection;
  paths: ChroniclePaths;
  queries: ChronicleQueries;
}

export interface ListJsonMemory {
  created_at: string;
  description: string;
  id: string;
  token_count: number | null;
  title: string;
}

export interface GetJsonMemory extends ListJsonMemory {
  parent_ids: string[];
  session_agent: string | null;
  summary: string;
  superseded_by_id: string | null;
  updated_at: string;
}

export function createNodeCommandRuntime(): CommandRuntime {
  return {
    async confirm(message: string): Promise<boolean> {
      const readline = createInterface({ input: processStdin, output: processStdout });

      try {
        const answer = await readline.question(`${message} `);
        const normalizedAnswer = answer.trim().toLowerCase();

        return normalizedAnswer === 'y' || normalizedAnswer === 'yes';
      } finally {
        readline.close();
      }
    },
    cwd: process.cwd(),
    generateId: () => randomUUID(),
    now: () => new Date(),
    setExitCode(code: ExitCode): void {
      process.exitCode = code;
    },
    stderr(text: string): void {
      processStderr.write(text);
    },
    stdin: processStdin,
    stdinIsTTY: Boolean(processStdin.isTTY),
    stdout(text: string): void {
      processStdout.write(text);
    },
    stdoutIsTTY: Boolean(processStdout.isTTY),
  };
}

export function writeJson(runtime: CommandRuntime, value: unknown): void {
  runtime.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(runtime: CommandRuntime, value: string): void {
  runtime.stdout(`${value.endsWith('\n') ? value : `${value}\n`}`);
}

export function emitCommandError(runtime: CommandRuntime, error: unknown, format: ErrorFormat = 'json'): void {
  runtime.stderr(`${formatError(error, format)}\n`);
  runtime.setExitCode(getExitCode(error));
}

export async function runRegisteredCommand<TResult>(
  runtime: CommandRuntime,
  format: ErrorFormat,
  action: () => Promise<TResult> | TResult,
  render: (result: TResult) => void,
): Promise<void> {
  try {
    const result = await action();
    render(result);
  } catch (error) {
    emitCommandError(runtime, error, format);
  }
}

export async function readStdinText(runtime: CommandRuntime): Promise<string> {
  const chunks: string[] = [];
  const readable = runtime.stdin as AsyncIterable<string | Buffer | Uint8Array>;

  for await (const chunk of readable) {
    if (typeof chunk === 'string') {
      chunks.push(chunk);
      continue;
    }

    chunks.push(Buffer.from(chunk).toString('utf8'));
  }

  return chunks.join('');
}

export function openChronicleContext(runtime: CommandRuntime): ChronicleCommandContext {
  const paths = resolveChroniclePaths(runtime.cwd);

  if (!paths) {
    throw new RepositoryError('Chronicle is not initialized in this repository.');
  }

  const config = readConfig(paths.configPath);
  const db = openDatabase(paths.dbPath, { fileMustExist: true });
  const queries = createQueries(db);

  return {
    close(): void {
      db.close();
    },
    config,
    db,
    paths,
    queries,
  };
}

export function openOptionalChronicleContext(runtime: CommandRuntime): ChronicleCommandContext | null {
  const paths = resolveChroniclePaths(runtime.cwd);

  if (!paths) {
    return null;
  }

  const config = readConfig(paths.configPath);
  const db = openDatabase(paths.dbPath, { fileMustExist: true });
  const queries = createQueries(db);

  return {
    close(): void {
      db.close();
    },
    config,
    db,
    paths,
    queries,
  };
}

export function requireMemory(record: MemoryRecord | null, id: string): MemoryRecord {
  if (!record) {
    throw new RepositoryError(`No memory with id '${id}'.`);
  }

  return record;
}

export function parseNonNegativeInteger(value: string | undefined, fieldName: string, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!/^[0-9]+$/.test(value)) {
    throw new ValidationError(`${fieldName} must be a non-negative integer.`);
  }

  return Number(value);
}

export function normalizeListFormat(value: string | undefined): 'json' | 'table' {
  const normalized = value?.trim().toLowerCase() ?? 'json';

  if (normalized !== 'json' && normalized !== 'table') {
    throw new ValidationError('format must be either json or table.');
  }

  return normalized;
}

export function toListJsonMemory(memory: MemoryListItem): ListJsonMemory {
  return {
    created_at: memory.createdAt,
    description: memory.description,
    id: memory.id,
    token_count: memory.tokenCount,
    title: memory.title,
  };
}

export function toGetJsonMemory(memory: MemoryRecord): GetJsonMemory {
  return {
    created_at: memory.createdAt,
    description: memory.description,
    id: memory.id,
    parent_ids: memory.parentIds,
    session_agent: memory.sessionAgent,
    summary: memory.summary,
    superseded_by_id: memory.supersededById,
    title: memory.title,
    token_count: memory.tokenCount,
    updated_at: memory.updatedAt,
  };
}

interface TableColumn<RowType> {
  key: keyof RowType;
  label: string;
}

export function formatTable<RowType extends Record<string, string>>(rows: RowType[], columns: TableColumn<RowType>[]): string {
  const widths = columns.map((column) => {
    return rows.reduce((maxWidth, row) => Math.max(maxWidth, row[column.key].length), column.label.length);
  });

  const header = columns.map((column, index) => column.label.padEnd(widths[index])).join('  ');
  const divider = columns.map((_, index) => '-'.repeat(widths[index])).join('  ');
  const body = rows.map((row) => columns.map((column, index) => row[column.key].padEnd(widths[index])).join('  '));

  return [header, divider, ...body].join('\n');
}

export function describeTokenCount(tokenCount: number | null): string {
  return tokenCount === null ? 'unknown' : String(tokenCount);
}

export function registerCommandGroup(program: Command, name: string, description: string): Command {
  return program.command(name).description(description);
}
