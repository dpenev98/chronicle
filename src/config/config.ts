import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConfigError } from '../utils/errors';
import { ensureObject, parseJsonObject } from '../utils/validation';

export interface ChronicleConfig {
  maxMemoriesToPull: number;
  maxMemorySummaryTokens: number;
  maxRetrievalTokenBudget: number;
  requireConfirmationAbove: number;
  maxCatalogEntries: number;
  chronicleVersion: string;
}

export const DEFAULT_CONFIG: ChronicleConfig = {
  maxMemoriesToPull: 5,
  maxMemorySummaryTokens: 2000,
  maxRetrievalTokenBudget: 5000,
  requireConfirmationAbove: 3,
  maxCatalogEntries: 20,
  chronicleVersion: '1.0.0',
};

function validatePositiveInteger(value: unknown, fieldName: keyof ChronicleConfig): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ConfigError(`${fieldName} must be a non-negative integer.`);
  }

  return value;
}

export function validateConfig(input: unknown): ChronicleConfig {
  const partial = input === undefined ? {} : (ensureObject(input, 'config') as Partial<ChronicleConfig>);
  const merged: ChronicleConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
  };

  return {
    maxMemoriesToPull: validatePositiveInteger(merged.maxMemoriesToPull, 'maxMemoriesToPull'),
    maxMemorySummaryTokens: validatePositiveInteger(merged.maxMemorySummaryTokens, 'maxMemorySummaryTokens'),
    maxRetrievalTokenBudget: validatePositiveInteger(merged.maxRetrievalTokenBudget, 'maxRetrievalTokenBudget'),
    requireConfirmationAbove: validatePositiveInteger(merged.requireConfirmationAbove, 'requireConfirmationAbove'),
    maxCatalogEntries: validatePositiveInteger(merged.maxCatalogEntries, 'maxCatalogEntries'),
    chronicleVersion: validateChronicleVersion(merged.chronicleVersion),
  };
}

function validateChronicleVersion(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigError('chronicleVersion must be a non-empty string.');
  }

  return value.trim();
}

export function readConfig(configPath: string): ChronicleConfig {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const contents = readFileSync(configPath, 'utf8');
    const parsed = parseJsonObject<Partial<ChronicleConfig>>(contents, 'config');

    return validateConfig(parsed);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    throw new ConfigError(`Failed to read config at ${configPath}.`);
  }
}

export function writeConfig(configPath: string, config: Partial<ChronicleConfig> = {}): ChronicleConfig {
  const validated = validateConfig({ ...DEFAULT_CONFIG, ...config });

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');

  return validated;
}
