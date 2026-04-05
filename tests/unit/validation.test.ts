import { describe, expect, it } from 'vitest';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  parseJsonObject,
  parseParentIds,
  validateCreateMemoryInput,
  validateDescription,
  validateTitle,
  validateUpdateMemoryInput,
} from '../../src/utils/validation';
import { ValidationError } from '../../src/utils/errors';

describe('validation', () => {
  it('validates create input with parent ids', () => {
    const result = validateCreateMemoryInput({
      title: 'Auth implementation',
      description: 'JWT auth module changes for Express routes.',
      summary: '## Goals\n- Build auth',
      parentIds: ['id-1', 'id-2'],
      agent: 'claude-code',
    });

    expect(result.parentIds).toEqual(['id-1', 'id-2']);
    expect(result.agent).toBe('claude-code');
  });

  it('rejects oversized title and description values', () => {
    expect(() => validateTitle('a'.repeat(MAX_TITLE_LENGTH + 1))).toThrow(ValidationError);
    expect(() => validateDescription('a'.repeat(MAX_DESCRIPTION_LENGTH + 1))).toThrow(ValidationError);
  });

  it('rejects malformed parentIds JSON', () => {
    expect(() => parseParentIds('not json')).toThrow(ValidationError);
    expect(() => parseParentIds('{"bad":true}')).toThrow(ValidationError);
  });

  it('parses JSON object strings', () => {
    expect(parseJsonObject<{ hello: string }>(' {"hello":"world"} ')).toEqual({ hello: 'world' });
  });

  it('requires at least one field for update', () => {
    expect(() => validateUpdateMemoryInput({})).toThrow(ValidationError);
  });

  it('validates partial update input', () => {
    const result = validateUpdateMemoryInput({ description: 'Updated retrieval signal.' });

    expect(result).toEqual({ description: 'Updated retrieval signal.' });
  });
});
