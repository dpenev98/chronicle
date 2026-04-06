import { Command } from 'commander';
import { registerCreateCommand } from './commands/create';
import { registerDeleteCommand } from './commands/delete';
import { registerGetCommand } from './commands/get';
import { registerHookCommand } from './commands/hook';
import { registerInitCommand } from './commands/init';
import { registerListCommand } from './commands/list';
import { createNodeCommandRuntime } from './commands/shared';
import { registerSupersedeCommand } from './commands/supersede';
import { registerUpdateCommand } from './commands/update';
import { readPackageVersion } from './utils/package';

export function createProgram(): Command {
  const program = new Command()
    .name('chronicle')
    .description('Project-scoped local memory layer for coding agents.')
    .version(readPackageVersion());

  const runtime = createNodeCommandRuntime();

  registerCreateCommand(program, runtime);
  registerInitCommand(program, runtime);
  registerUpdateCommand(program, runtime);
  registerGetCommand(program, runtime);
  registerListCommand(program, runtime);
  registerDeleteCommand(program, runtime);
  registerSupersedeCommand(program, runtime);
  registerHookCommand(program, runtime);

  return program;
}

export async function run(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

if (require.main === module) {
  void run();
}
