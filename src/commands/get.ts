import type { Command } from 'commander';
import { NotFoundError } from '../utils/errors';
import { openChronicleContext, runRegisteredCommand, toGetJsonMemory, type CommandRuntime, type GetJsonMemory, writeJson } from './shared';

export function executeGetCommand(id: string, runtime: CommandRuntime): GetJsonMemory {
  const context = openChronicleContext(runtime);

  try {
    const memory = context.queries.getMemory(id);

    if (!memory) {
      throw new NotFoundError(`No memory with id '${id}'.`);
    }

    return toGetJsonMemory(memory);
  } finally {
    context.close();
  }
}

export function registerGetCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('get')
    .description('Get a Chronicle memory by id.')
    .argument('<id>')
    .action(async (id: string) => {
      await runRegisteredCommand(runtime, 'json', () => executeGetCommand(id, runtime), (result) => {
        writeJson(runtime, result);
      });
    })
    .showHelpAfterError();
}
