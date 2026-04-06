import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPackageVersion } from '../../src/utils/package';

describe('package utils', () => {
  it('reads the package version from the package root', () => {
    const packageJsonPath = resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };

    expect(readPackageVersion()).toBe(packageJson.version);
  });
});
