import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface ChroniclePaths {
  repoRoot: string;
  chronicleDir: string;
  dbPath: string;
  configPath: string;
}

function findParentContaining(targetName: string, startDir: string): string | null {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = join(currentDir, targetName);

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

export function findRepoRoot(startDir = process.cwd()): string | null {
  const gitPath = findParentContaining('.git', startDir);

  return gitPath ? dirname(gitPath) : null;
}

export function findChronicleDirectory(startDir = process.cwd()): string | null {
  return findParentContaining('.chronicle', startDir);
}

export function buildChroniclePaths(repoRoot: string): ChroniclePaths {
  const normalizedRepoRoot = resolve(repoRoot);
  const chronicleDir = join(normalizedRepoRoot, '.chronicle');

  return {
    repoRoot: normalizedRepoRoot,
    chronicleDir,
    dbPath: join(chronicleDir, 'chronicle.db'),
    configPath: join(chronicleDir, 'config.json'),
  };
}

export function resolveChroniclePaths(startDir = process.cwd()): ChroniclePaths | null {
  const chronicleDir = findChronicleDirectory(startDir);

  if (!chronicleDir) {
    return null;
  }

  return buildChroniclePaths(dirname(chronicleDir));
}
