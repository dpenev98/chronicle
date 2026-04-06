import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ConfigError } from './errors';

function resolvePackageJsonPath(): string {
  let currentDirectory = __dirname;

  while (true) {
    const candidatePath = join(currentDirectory, 'package.json');

    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      throw new ConfigError('Could not locate package.json.');
    }

    currentDirectory = parentDirectory;
  }
}

export function readPackageVersion(): string {
  const packageJsonPath = resolvePackageJsonPath();
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };

  if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
    throw new ConfigError('package.json version must be a non-empty string.');
  }

  return packageJson.version;
}
