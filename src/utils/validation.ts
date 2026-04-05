import { ValidationError } from './errors';

export const MAX_TITLE_LENGTH = 160;
export const MAX_DESCRIPTION_LENGTH = 600;

export interface ValidatedCreateMemoryInput {
  title: string;
  description: string;
  summary: string;
  parentIds: string[];
  agent?: string;
}

export interface ValidatedUpdateMemoryInput {
  title?: string;
  description?: string;
  summary?: string;
  parentIds?: string[];
  agent?: string;
}

export function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ValidationError(`${fieldName} is required.`);
  }

  return trimmed;
}

function validateOptionalAgent(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return ensureNonEmptyString(value, 'agent');
}

export function validateTitle(value: unknown): string {
  const title = ensureNonEmptyString(value, 'title');

  if (title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }

  return title;
}

export function validateDescription(value: unknown): string {
  const description = ensureNonEmptyString(value, 'description');

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }

  return description;
}

export function validateSummary(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('summary must be a string.');
  }

  if (!value.trim()) {
    throw new ValidationError('summary is required.');
  }

  return value;
}

export function parseJsonObject<T extends Record<string, unknown>>(jsonText: string, label = 'JSON input'): T {
  try {
    return ensureObject(JSON.parse(jsonText), label) as T;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError(`${label} is not valid JSON.`);
  }
}

export function parseParentIds(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  let candidate: unknown;

  try {
    candidate = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new ValidationError('parentIds must be a JSON array of strings.');
  }

  if (!Array.isArray(candidate)) {
    throw new ValidationError('parentIds must be a JSON array of strings.');
  }

  const invalidValue = candidate.find((entry) => typeof entry !== 'string' || !entry.trim());

  if (invalidValue !== undefined) {
    throw new ValidationError('parentIds must contain only non-empty strings.');
  }

  return candidate.map((entry) => entry.trim());
}

export function validateCreateMemoryInput(input: unknown): ValidatedCreateMemoryInput {
  const objectInput = ensureObject(input, 'create input');

  return {
    title: validateTitle(objectInput.title),
    description: validateDescription(objectInput.description),
    summary: validateSummary(objectInput.summary),
    parentIds: parseParentIds(objectInput.parentIds ?? objectInput.parent_ids),
    agent: validateOptionalAgent(objectInput.agent),
  };
}

export function validateUpdateMemoryInput(input: unknown): ValidatedUpdateMemoryInput {
  const objectInput = ensureObject(input, 'update input');
  const output: ValidatedUpdateMemoryInput = {};

  if (Object.prototype.hasOwnProperty.call(objectInput, 'title')) {
    output.title = validateTitle(objectInput.title);
  }

  if (Object.prototype.hasOwnProperty.call(objectInput, 'description')) {
    output.description = validateDescription(objectInput.description);
  }

  if (Object.prototype.hasOwnProperty.call(objectInput, 'summary')) {
    output.summary = validateSummary(objectInput.summary);
  }

  if (Object.prototype.hasOwnProperty.call(objectInput, 'parentIds') || Object.prototype.hasOwnProperty.call(objectInput, 'parent_ids')) {
    output.parentIds = parseParentIds(objectInput.parentIds ?? objectInput.parent_ids);
  }

  if (Object.prototype.hasOwnProperty.call(objectInput, 'agent')) {
    output.agent = validateOptionalAgent(objectInput.agent);
  }

  if (Object.keys(output).length === 0) {
    throw new ValidationError('At least one updatable field must be provided.');
  }

  return output;
}
