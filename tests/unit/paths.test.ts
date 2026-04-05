import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChroniclePaths, findChronicleDirectory, findRepoRoot, resolveChroniclePaths } from '../../src/utils/paths';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronicle-paths-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('paths', () => {
  it('finds the repo root by walking up to .git', () => {
    const repoRoot = createTempDir();
    mkdirSync(join(repoRoot, '.git'));
    mkdirSync(join(repoRoot, 'src', 'nested'), { recursive: true });

    expect(findRepoRoot(join(repoRoot, 'src', 'nested'))).toBe(repoRoot);
  });

  it('finds the chronicle directory and resolves file paths', () => {
    const repoRoot = createTempDir();
    mkdirSync(join(repoRoot, '.chronicle'));
    mkdirSync(join(repoRoot, 'apps', 'api'), { recursive: true });
    writeFileSync(join(repoRoot, '.chronicle', 'config.json'), '{}');

    expect(findChronicleDirectory(join(repoRoot, 'apps', 'api'))).toBe(join(repoRoot, '.chronicle'));

    const resolved = resolveChroniclePaths(join(repoRoot, 'apps', 'api'));

    expect(resolved?.repoRoot).toBe(repoRoot);
    expect(resolved?.dbPath).toBe(join(repoRoot, '.chronicle', 'chronicle.db'));
  });

  it('builds canonical chronicle paths', () => {
    const repoRoot = createTempDir();
    const paths = buildChroniclePaths(repoRoot);

    expect(paths.chronicleDir).toBe(join(repoRoot, '.chronicle'));
    expect(paths.configPath).toBe(join(repoRoot, '.chronicle', 'config.json'));
  });
});
