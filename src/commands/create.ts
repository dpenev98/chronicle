import type { Command } from 'commander';
import { estimateTokens } from '../utils/tokens';
import { ValidationError } from '../utils/errors';
import { parseJsonObject, validateCreateMemoryInput } from '../utils/validation';
import { openChronicleContext, readStdinText, runRegisteredCommand, type CommandRuntime, writeJson } from './shared';

export interface CreateCommandOptions {
  agent?: string;
  description?: string;
  parentIds?: string;
  stdin?: boolean;
  summary?: string;
  title?: string;
}

export interface CreateCommandResult {
  created_at: string;
  id: string;
  token_count: number;
}

export async function executeCreateCommand(options: CreateCommandOptions, runtime: CommandRuntime): Promise<CreateCommandResult> {
  const rawInput = options.stdin
    ? parseJsonObject<Record<string, unknown>>(await readStdinText(runtime), 'stdin input')
    : {
        agent: options.agent,
        description: options.description,
        parentIds: options.parentIds,
        summary: options.summary,
        title: options.title,
      };
  const input = validateCreateMemoryInput(rawInput);
  const context = openChronicleContext(runtime);

  try {
    const tokenCount = estimateTokens(input.summary);

    if (tokenCount > context.config.maxMemorySummaryTokens) {
      throw new ValidationError(`summary exceeds maxMemorySummaryTokens (${context.config.maxMemorySummaryTokens}).`);
    }

    const id = runtime.generateId();
    const createdAt = runtime.now().toISOString();

    context.queries.insertMemory({
      createdAt,
      description: input.description,
      id,
      parentIds: input.parentIds,
      sessionAgent: input.agent,
      summary: input.summary,
      title: input.title,
      tokenCount,
      updatedAt: createdAt,
    });

    return {
      created_at: createdAt,
      id,
      token_count: tokenCount,
    };
  } finally {
    context.close();
  }
}

export function registerCreateCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('create')
    .description('Create a Chronicle memory.')
    .option('--title <title>')
    .option('--description <description>')
    .option('--summary <summary>')
    .option('--parent-ids <parentIds>')
    .option('--agent <agent>')
    .option('--stdin')
    .action(async (options: CreateCommandOptions) => {
      await runRegisteredCommand(runtime, 'json', () => executeCreateCommand(options, runtime), (result) => {
        writeJson(runtime, result);
      });
    })
    .showHelpAfterError();
}
