import type { Command } from 'commander';
import { NotFoundError, ValidationError, ChronicleError, ExitCode } from '../utils/errors';
import { openChronicleContext, runRegisteredCommand, type CommandRuntime, writeJson } from './shared';

export interface DeleteCommandOptions {
  force?: boolean;
}

export interface DeleteCommandResult {
  deleted: true;
  id: string;
}

class OperationCanceledError extends ChronicleError {
  constructor(message: string) {
    super({ code: 'OPERATION_CANCELED', exitCode: ExitCode.UserError, message });
  }
}

export async function executeDeleteCommand(id: string, options: DeleteCommandOptions, runtime: CommandRuntime): Promise<DeleteCommandResult> {
  const context = openChronicleContext(runtime);

  try {
    const memory = context.queries.getMemory(id);

    if (!memory) {
      throw new NotFoundError(`No memory with id '${id}'.`);
    }

    const parentReferences = context.queries.findMemoriesReferencingParent(id);
    const supersessionReferences = context.queries.findMemoriesReferencingSupersession(id);

    if ((parentReferences.length > 0 || supersessionReferences.length > 0) && !options.force) {
      throw new ValidationError(`Memory '${id}' is referenced by other memories. Re-run with --force to delete it.`, {
        parent_references: parentReferences,
        supersession_references: supersessionReferences,
      });
    }

    if (!options.force) {
      if (!runtime.stdinIsTTY || !runtime.stdoutIsTTY) {
        throw new ValidationError('Deleting a memory requires --force in non-interactive mode.');
      }

      const confirmed = await runtime.confirm(`Delete memory '${id}' permanently? [y/N]`);

      if (!confirmed) {
        throw new OperationCanceledError('Deletion canceled.');
      }
    }

    const deleted = context.queries.deleteMemory(id);

    if (!deleted) {
      throw new NotFoundError(`No memory with id '${id}'.`);
    }

    return {
      deleted: true,
      id,
    };
  } finally {
    context.close();
  }
}

export function registerDeleteCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('delete')
    .description('Delete a Chronicle memory.')
    .argument('<id>')
    .option('--force')
    .action(async (id: string, options: DeleteCommandOptions) => {
      await runRegisteredCommand(runtime, 'json', () => executeDeleteCommand(id, options, runtime), (result) => {
        writeJson(runtime, result);
      });
    })
    .showHelpAfterError();
}
