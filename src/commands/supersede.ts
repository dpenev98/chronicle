import type { Command } from 'commander';
import { DatabaseError, NotFoundError, ValidationError } from '../utils/errors';
import { openChronicleContext, runRegisteredCommand, type CommandRuntime, writeJson } from './shared';
import type { ChronicleQueries } from '../db/queries';

export interface SupersedeCommandResult {
  new_id: string;
  old_id: string;
  repointed: boolean;
}

function assertNoSupersessionCycle(queries: ChronicleQueries, oldId: string, newId: string): void {
  const visited = new Set<string>();
  let currentId: string | null = newId;

  while (currentId !== null) {
    if (currentId === oldId) {
      throw new ValidationError(`Cannot supersede '${oldId}' with '${newId}' because it would create a cycle.`);
    }

    if (visited.has(currentId)) {
      throw new DatabaseError('The existing supersession graph contains a cycle.');
    }

    visited.add(currentId);
    currentId = queries.getSupersededBy(currentId);
  }
}

export function executeSupersedeCommand(oldId: string, newId: string, runtime: CommandRuntime): SupersedeCommandResult {
  if (oldId === newId) {
    throw new ValidationError('A memory cannot supersede itself.');
  }

  const context = openChronicleContext(runtime);

  try {
    if (!context.queries.memoryExists(oldId)) {
      throw new NotFoundError(`No memory with id '${oldId}'.`);
    }

    if (!context.queries.memoryExists(newId)) {
      throw new NotFoundError(`No memory with id '${newId}'.`);
    }

    assertNoSupersessionCycle(context.queries, oldId, newId);

    const repointed = context.queries.getSupersededBy(oldId) !== null;
    const updated = context.queries.supersedeMemory(oldId, newId);

    if (!updated) {
      throw new NotFoundError(`No memory with id '${oldId}'.`);
    }

    return {
      new_id: newId,
      old_id: oldId,
      repointed,
    };
  } finally {
    context.close();
  }
}

export function registerSupersedeCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('supersede')
    .description('Mark one memory as superseded by another.')
    .argument('<oldId>')
    .argument('<newId>')
    .action(async (oldId: string, newId: string) => {
      await runRegisteredCommand(runtime, 'json', () => executeSupersedeCommand(oldId, newId, runtime), (result) => {
        writeJson(runtime, result);
      });
    })
    .showHelpAfterError();
}
