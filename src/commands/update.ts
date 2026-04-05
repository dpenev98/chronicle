import type { Command } from 'commander';
import { estimateTokens } from '../utils/tokens';
import { NotFoundError, ValidationError } from '../utils/errors';
import { parseJsonObject, validateUpdateMemoryInput } from '../utils/validation';
import { openChronicleContext, readStdinText, runRegisteredCommand, type CommandRuntime, writeJson } from './shared';

export interface UpdateCommandOptions {
  agent?: string;
  description?: string;
  parentIds?: string;
  stdin?: boolean;
  summary?: string;
  title?: string;
}

export interface UpdateCommandResult {
  id: string;
  token_count: number | null;
  updated_at: string;
}

function buildArgsInput(options: UpdateCommandOptions): Record<string, unknown> {
  const rawInput: Record<string, unknown> = {};

  if (options.title !== undefined) {
    rawInput.title = options.title;
  }

  if (options.description !== undefined) {
    rawInput.description = options.description;
  }

  if (options.summary !== undefined) {
    rawInput.summary = options.summary;
  }

  if (options.parentIds !== undefined) {
    rawInput.parentIds = options.parentIds;
  }

  if (options.agent !== undefined) {
    rawInput.agent = options.agent;
  }

  return rawInput;
}

export async function executeUpdateCommand(id: string, options: UpdateCommandOptions, runtime: CommandRuntime): Promise<UpdateCommandResult> {
  const rawInput = options.stdin
    ? parseJsonObject<Record<string, unknown>>(await readStdinText(runtime), 'stdin input')
    : buildArgsInput(options);
  const input = validateUpdateMemoryInput(rawInput);
  const context = openChronicleContext(runtime);

  try {
    const existingMemory = context.queries.getMemory(id);

    if (!existingMemory) {
      throw new NotFoundError(`No memory with id '${id}'.`);
    }

    const recalculatedTokenCount = input.summary === undefined ? undefined : estimateTokens(input.summary);

    if (recalculatedTokenCount !== undefined && recalculatedTokenCount > context.config.maxMemorySummaryTokens) {
      throw new ValidationError(`summary exceeds maxMemorySummaryTokens (${context.config.maxMemorySummaryTokens}).`);
    }

    const updatedAt = runtime.now().toISOString();
    const updated = context.queries.updateMemory({
      description: input.description,
      id,
      parentIds: input.parentIds,
      sessionAgent: input.agent,
      summary: input.summary,
      title: input.title,
      tokenCount: recalculatedTokenCount,
      updatedAt,
    });

    if (!updated) {
      throw new NotFoundError(`No memory with id '${id}'.`);
    }

    return {
      id,
      token_count: recalculatedTokenCount ?? existingMemory.tokenCount,
      updated_at: updatedAt,
    };
  } finally {
    context.close();
  }
}

export function registerUpdateCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('update')
    .description('Update an existing Chronicle memory.')
    .argument('<id>')
    .option('--title <title>')
    .option('--description <description>')
    .option('--summary <summary>')
    .option('--parent-ids <parentIds>')
    .option('--agent <agent>')
    .option('--stdin')
    .action(async (id: string, options: UpdateCommandOptions) => {
      await runRegisteredCommand(runtime, 'json', () => executeUpdateCommand(id, options, runtime), (result) => {
        writeJson(runtime, result);
      });
    })
    .showHelpAfterError();
}
