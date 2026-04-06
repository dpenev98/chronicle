import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import type { ChronicleConfig } from '../../src/config/config';
import { DEFAULT_CONFIG, writeConfig } from '../../src/config/config';
import { openDatabase } from '../../src/db/connection';
import { createQueries, type InsertMemoryInput } from '../../src/db/queries';
import { initializeSchema } from '../../src/db/schema';
import { ExitCode, type ErrorFormat } from '../../src/utils/errors';
import type { CommandRuntime } from '../../src/commands/shared';

export interface TestRepo {
  cleanup(): void;
  configPath: string;
  dbPath: string;
  repoRoot: string;
}

export interface TestRuntimeOptions {
  confirmResponse?: boolean;
  cwd: string;
  generatedIds?: string[];
  now?: Date;
  stdinIsTTY?: boolean;
  stdinText?: string;
  stdoutIsTTY?: boolean;
}

export interface TestRuntime extends CommandRuntime {
  confirmMessages: string[];
  exitCode?: ExitCode;
  stderrBuffer: string;
  stdoutBuffer: string;
}

export function createGitRepo(): TestRepo {
  const repoRoot = mkdtempSync(join(tmpdir(), 'chronicle-command-'));

  mkdirSync(join(repoRoot, '.git'), { recursive: true });

  return {
    cleanup(): void {
      rmSync(repoRoot, { recursive: true, force: true });
    },
    configPath: join(repoRoot, '.chronicle', 'config.json'),
    dbPath: join(repoRoot, '.chronicle', 'chronicle.db'),
    repoRoot,
  };
}

export function createInitializedRepo(configOverrides: Partial<ChronicleConfig> = {}): TestRepo {
  const repo = createGitRepo();
  const repoRoot = repo.repoRoot;
  const chronicleDir = join(repoRoot, '.chronicle');
  const dbPath = join(chronicleDir, 'chronicle.db');
  const configPath = join(chronicleDir, 'config.json');

  mkdirSync(chronicleDir, { recursive: true });
  writeConfig(configPath, { ...DEFAULT_CONFIG, ...configOverrides });

  const db = openDatabase(dbPath);
  initializeSchema(db);
  db.close();

  return {
    cleanup(): void {
      repo.cleanup();
    },
    configPath,
    dbPath,
    repoRoot,
  };
}

export function seedMemory(repo: TestRepo, input: Omit<InsertMemoryInput, 'createdAt' | 'id' | 'tokenCount' | 'updatedAt'> & {
  createdAt?: string;
  id?: string;
  tokenCount?: number;
  updatedAt?: string;
}): string {
  const db = openDatabase(repo.dbPath, { fileMustExist: true });
  const queries = createQueries(db);
  const id = input.id ?? `memory-${Math.random().toString(16).slice(2, 10)}`;
  const createdAt = input.createdAt ?? '2026-04-05T10:00:00.000Z';
  const updatedAt = input.updatedAt ?? createdAt;

  queries.insertMemory({
    createdAt,
    description: input.description,
    id,
    parentIds: input.parentIds,
    sessionAgent: input.sessionAgent,
    summary: input.summary,
    supersededById: input.supersededById,
    title: input.title,
    tokenCount: input.tokenCount ?? Math.ceil(input.summary.length / 4),
    updatedAt,
  });

  db.close();

  return id;
}

export function createTestRuntime(options: TestRuntimeOptions): TestRuntime {
  const generatedIds = [...(options.generatedIds ?? ['generated-memory-id'])];
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let exitCode: ExitCode | undefined;
  const confirmMessages: string[] = [];

  return {
    async confirm(message: string): Promise<boolean> {
      confirmMessages.push(message);
      return options.confirmResponse ?? false;
    },
    confirmMessages,
    cwd: options.cwd,
    generateId(): string {
      return generatedIds.shift() ?? 'generated-memory-id';
    },
    now(): Date {
      return options.now ?? new Date('2026-04-05T12:00:00.000Z');
    },
    setExitCode(code: ExitCode): void {
      exitCode = code;
    },
    stderr(text: string): void {
      stderrBuffer += text;
    },
    get stderrBuffer(): string {
      return stderrBuffer;
    },
    stdin: Readable.from(options.stdinText ?? ''),
    stdinIsTTY: options.stdinIsTTY ?? false,
    stdout(text: string): void {
      stdoutBuffer += text;
    },
    get stdoutBuffer(): string {
      return stdoutBuffer;
    },
    stdoutIsTTY: options.stdoutIsTTY ?? false,
    get exitCode(): ExitCode | undefined {
      return exitCode;
    },
  };
}
