import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';

function readPackageVersion(): string {
  const packageJsonPath = resolve(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };

  return packageJson.version ?? '0.0.0';
}

export function createProgram(): Command {
  return new Command()
    .name('chronicle')
    .description('Project-scoped local memory layer for coding agents.')
    .version(readPackageVersion());
}

export async function run(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

if (require.main === module) {
  void run();
}
