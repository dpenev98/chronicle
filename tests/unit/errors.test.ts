import { describe, expect, it } from 'vitest';
import { ExitCode, ValidationError, formatError, getExitCode, normalizeError } from '../../src/utils/errors';

describe('errors', () => {
  it('formats Chronicle errors as JSON', () => {
    const output = formatError(new ValidationError('Invalid input'));

    expect(output).toContain('VALIDATION_ERROR');
    expect(output).toContain('Invalid input');
  });

  it('formats Chronicle errors as text', () => {
    expect(formatError(new ValidationError('Invalid input'), 'text')).toBe('VALIDATION_ERROR: Invalid input');
  });

  it('normalizes native errors', () => {
    const normalized = normalizeError(new Error('boom'));

    expect(normalized.code).toBe('UNEXPECTED_ERROR');
    expect(getExitCode(normalized)).toBe(ExitCode.SystemError);
  });
});
