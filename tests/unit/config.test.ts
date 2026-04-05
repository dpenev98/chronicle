import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, readConfig, validateConfig, writeConfig } from '../../src/config/config';
import { ConfigError } from '../../src/utils/errors';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronicle-config-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('config', () => {
  it('returns defaults when the config file is missing', () => {
    const dir = createTempDir();

    expect(readConfig(join(dir, 'missing.json'))).toEqual(DEFAULT_CONFIG);
  });

  it('writes and reads config files', () => {
    const dir = createTempDir();
    const configPath = join(dir, '.chronicle', 'config.json');

    const written = writeConfig(configPath, { maxCatalogEntries: 10, chronicleVersion: '1.2.3' });
    const readBack = readConfig(configPath);

    expect(written.maxCatalogEntries).toBe(10);
    expect(readBack.maxCatalogEntries).toBe(10);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(readBack);
  });

  it('rejects invalid config values', () => {
    expect(() => validateConfig({ maxCatalogEntries: -1 })).toThrow(ConfigError);
  });
});
