export enum ExitCode {
  Success = 0,
  UserError = 1,
  SystemError = 2,
}

export type ErrorFormat = 'json' | 'text';

export interface StructuredError {
  error: true;
  code: string;
  message: string;
  details?: unknown;
}

export interface ChronicleErrorOptions {
  code: string;
  message: string;
  exitCode: ExitCode;
  details?: unknown;
}

export class ChronicleError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;
  readonly details?: unknown;

  constructor(options: ChronicleErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    this.code = options.code;
    this.exitCode = options.exitCode;
    this.details = options.details;
  }
}

export class ValidationError extends ChronicleError {
  constructor(message: string, details?: unknown) {
    super({ code: 'VALIDATION_ERROR', message, exitCode: ExitCode.UserError, details });
  }
}

export class NotFoundError extends ChronicleError {
  constructor(message: string, details?: unknown) {
    super({ code: 'MEMORY_NOT_FOUND', message, exitCode: ExitCode.UserError, details });
  }
}

export class ConfigError extends ChronicleError {
  constructor(message: string, details?: unknown) {
    super({ code: 'CONFIG_ERROR', message, exitCode: ExitCode.UserError, details });
  }
}

export class DatabaseError extends ChronicleError {
  constructor(message: string, details?: unknown) {
    super({ code: 'DATABASE_ERROR', message, exitCode: ExitCode.SystemError, details });
  }
}

export class RepositoryError extends ChronicleError {
  constructor(message: string, details?: unknown) {
    super({ code: 'REPOSITORY_ERROR', message, exitCode: ExitCode.UserError, details });
  }
}

export function normalizeError(error: unknown): ChronicleError {
  if (error instanceof ChronicleError) {
    return error;
  }

  if (error instanceof Error) {
    return new ChronicleError({
      code: 'UNEXPECTED_ERROR',
      message: error.message,
      exitCode: ExitCode.SystemError,
    });
  }

  return new ChronicleError({
    code: 'UNEXPECTED_ERROR',
    message: 'An unknown error occurred.',
    exitCode: ExitCode.SystemError,
    details: error,
  });
}

export function formatError(error: unknown, format: ErrorFormat = 'json'): string {
  const normalized = normalizeError(error);

  if (format === 'text') {
    return `${normalized.code}: ${normalized.message}`;
  }

  const payload: StructuredError = {
    error: true,
    code: normalized.code,
    message: normalized.message,
  };

  if (normalized.details !== undefined) {
    payload.details = normalized.details;
  }

  return JSON.stringify(payload, null, 2);
}

export function getExitCode(error: unknown): ExitCode {
  return normalizeError(error).exitCode;
}
