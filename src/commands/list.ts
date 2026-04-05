import type { Command } from 'commander';
import { describeTokenCount, formatTable, normalizeListFormat, openChronicleContext, parseNonNegativeInteger, runRegisteredCommand, toListJsonMemory, type CommandRuntime, type ListJsonMemory, writeJson, writeText } from './shared';

export interface ListCommandOptions {
  format?: string;
  includeSuperseded?: boolean;
  limit?: string;
  offset?: string;
}

export interface ListCommandResult {
  format: 'json' | 'table';
  items: ListJsonMemory[];
  limit: number;
  offset: number;
  total: number;
}

export function executeListCommand(options: ListCommandOptions, runtime: CommandRuntime): ListCommandResult {
  const context = openChronicleContext(runtime);

  try {
    const format = normalizeListFormat(options.format);
    const limit = parseNonNegativeInteger(options.limit, 'limit', context.config.maxCatalogEntries);
    const offset = parseNonNegativeInteger(options.offset, 'offset', 0);
    const items = context.queries.listMemories({
      includeSuperseded: options.includeSuperseded,
      limit,
      offset,
    });
    const total = context.queries.countMemories(Boolean(options.includeSuperseded));

    return {
      format,
      items: items.map(toListJsonMemory),
      limit,
      offset,
      total,
    };
  } finally {
    context.close();
  }
}

function renderListTable(result: ListCommandResult): string {
  if (result.items.length === 0) {
    return `No memories found. Total: ${result.total}.`;
  }

  const rows = result.items.map((item) => ({
    created_at: item.created_at,
    description: item.description,
    id: item.id,
    title: item.title,
    token_count: describeTokenCount(item.token_count),
  }));
  const table = formatTable(rows, [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'token_count', label: 'Tokens' },
    { key: 'created_at', label: 'Created At' },
    { key: 'description', label: 'Description' },
  ]);

  return [`Showing ${result.items.length} of ${result.total} memories.`, table].join('\n\n');
}

export function registerListCommand(program: Command, runtime: CommandRuntime): void {
  program
    .command('list')
    .description('List Chronicle memories.')
    .option('--format <format>')
    .option('--include-superseded')
    .option('--limit <limit>')
    .option('--offset <offset>')
    .action(async (options: ListCommandOptions) => {
      const rawFormat = options.format?.trim().toLowerCase();
      const errorFormat = rawFormat === 'table' ? 'text' : 'json';

      await runRegisteredCommand(runtime, errorFormat, () => executeListCommand(options, runtime), (result) => {
        if (result.format === 'table') {
          writeText(runtime, renderListTable(result));
          return;
        }

        writeJson(runtime, {
          items: result.items,
          limit: result.limit,
          offset: result.offset,
          total: result.total,
        });
      });
    })
    .showHelpAfterError();
}
