import type { Command } from 'commander';
import { formatError } from '../utils/errors';
import { describeTokenCount, openOptionalChronicleContext, registerCommandGroup, type ChronicleCommandContext, type CommandRuntime, writeJson } from './shared';

export interface SessionStartHookOutput {
  hookSpecificOutput?: {
    additionalContext?: string;
    hookEventName: 'SessionStart';
  };
}

function buildCatalogContext(
  total: number,
  shown: number,
  maxCatalogEntries: number,
  items: Array<{ description: string; id: string; title: string; tokenCount: number | null }>,
  config: { maxMemoriesToPull: number; maxRetrievalTokenBudget: number; requireConfirmationAbove: number },
): string {
  const lines: string[] = [`[Chronicle Memory Catalog] (showing ${shown} of ${total} active memories)`];

  for (const item of items) {
    lines.push(`- [${item.id}] ${item.title} — ${item.description} (~${describeTokenCount(item.tokenCount)} tokens)`);
  }

  if (total > shown) {
    lines.push('');
    lines.push(`Older entries exist. Run \`chronicle list --offset ${shown} --limit ${maxCatalogEntries}\` to browse more.`);
  }

  lines.push('');
  lines.push('When the user sends the first message:');
  lines.push('1. Review the catalog and decide whether any memory is relevant from title and description alone.');
  lines.push('2. If relevant, load only the specific memories you need with `chronicle get <id>`.');
  lines.push(`3. Respect the project limits: max ${config.maxMemoriesToPull} memories and max ${config.maxRetrievalTokenBudget} total tokens.`);
  lines.push(`4. If loading more than ${config.requireConfirmationAbove} memories, ask the user first and show token estimates.`);
  lines.push('5. After loading a memory, verify referenced files or configurations before relying on it.');

  return lines.join('\n');
}

export function executeSessionStartHookCommand(runtime: CommandRuntime): SessionStartHookOutput {
  let context: ChronicleCommandContext | null = null;

  try {
    context = openOptionalChronicleContext(runtime);

    if (!context) {
      return {};
    }

    const total = context.queries.countMemories(false);

    if (total === 0) {
      return {
        hookSpecificOutput: {
          additionalContext: 'Chronicle is initialized but has no memories yet. Use /chronicle-memory to save session knowledge.',
          hookEventName: 'SessionStart',
        },
      };
    }

    const items = context.queries.listMemories({
      limit: context.config.maxCatalogEntries,
      offset: 0,
    });
    const additionalContext = buildCatalogContext(total, items.length, context.config.maxCatalogEntries, items.map((item) => ({
      description: item.description,
      id: item.id,
      title: item.title,
      tokenCount: item.tokenCount,
    })), context.config);

    return {
      hookSpecificOutput: {
        additionalContext,
        hookEventName: 'SessionStart',
      },
    };
  } catch (error) {
    return {
      hookSpecificOutput: {
        additionalContext: `[Chronicle Warning]\n${formatError(error, 'text')}`,
        hookEventName: 'SessionStart',
      },
    };
  } finally {
    context?.close();
  }
}

export function registerHookCommand(program: Command, runtime: CommandRuntime): void {
  const hookGroup = registerCommandGroup(program, 'hook', 'Hook utilities for agent integrations.');

  hookGroup
    .command('session-start')
    .description('Emit SessionStart hook payload.')
    .action(() => {
      writeJson(runtime, executeSessionStartHookCommand(runtime));
    })
    .showHelpAfterError();
}
