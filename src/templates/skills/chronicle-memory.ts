import { renderSkillTemplate, type SupportedAgent } from '../shared';

export function renderChronicleMemorySkill(agent: SupportedAgent): string {
  return renderSkillTemplate({
    agent,
    description: 'Use this skill when the user wants to browse the Chronicle memory catalog, load prior project context, save durable learnings from the current session, create memories from existing docs or pasted source material, or update an outdated Chronicle memory, even if they ask in terms of preserving context, recalling past decisions, or documenting what changed rather than mentioning Chronicle explicitly.',
    name: 'chronicle-memory',
    body: `# /chronicle-memory

Use this skill for all Chronicle memory workflows: browsing the catalog, recalling memories, creating new memories, creating memories from existing material, and updating stale memories.

## General rules

1. Start from titles and descriptions, then load only the memories that appear relevant.
2. Read \`.chronicle/config.json\` whenever a workflow depends on retrieval budgets or summary size limits.
3. Respect \`maxMemoriesToPull\`, \`maxRetrievalTokenBudget\`, \`requireConfirmationAbove\`, and \`maxMemorySummaryTokens\`.
4. After loading a memory, verify any referenced files, implementations, or configuration before relying on it.
5. Prefer \`--stdin\` for create and update operations so structured markdown and JSON remain reliable across shells.
6. If loaded Chronicle memories influenced a new memory, include their IDs in \`parentIds\`.

## List memories

Use this when you need to browse the catalog before deciding what to load.

1. Run \`chronicle list --format table\`.
2. Review titles, descriptions, token counts, and timestamps.
3. If the catalog is truncated, page with \`--offset\` and \`--limit\`.

Command pattern:

\`\`\`bash
chronicle list --format table
chronicle list --format table --offset 20 --limit 20
\`\`\`

## Recall memories

Use this when the current task may depend on previously saved project knowledge.

1. Start from the injected catalog or from \`chronicle list --format table\`.
2. Select only the IDs that look relevant from title and description.
3. If loading more than \`requireConfirmationAbove\` memories, ask the user first and show token estimates.
4. Load each memory with \`chronicle get <id>\`.
5. Verify referenced artifacts before relying on the loaded memory.

Command pattern:

\`\`\`bash
chronicle get <id>
\`\`\`

## Create from the current session

Use this when the conversation produced durable project knowledge worth reusing later.

1. Review the entire conversation, not just the last exchange.
2. Capture durable decisions, implementation details, debugging discoveries, and next steps.
3. Write a short title and a retrieval-oriented description.
4. Build the summary with these sections:
   - \`## Goals\`
   - \`## Decisions\`
   - \`## Implementation\`
   - \`## Learnings\`
   - \`## Current State\`
   - \`## Next Steps\`
5. Keep the summary within \`maxMemorySummaryTokens\`.
6. Call Chronicle in \`--stdin\` mode.

Description quality rule: if a future agent reads only the description, it should still know whether the memory is relevant.

Command pattern:

\`\`\`bash
echo '{"title":"...","description":"...","summary":"...","parentIds":["memory-1"],"agent":"${agent}"}' | chronicle create --stdin
\`\`\`

## Create from existing files or pasted material

Use this for brownfield adoption when important knowledge already exists outside the current chat.

1. Read the provided files or pasted text carefully.
2. Analyze the supplied files or pasted text as the primary source material, not the conversation.
3. Apply the same title, description, summary structure, and \`parentIds\` rules used for session-based creation.
4. Keep the summary within \`maxMemorySummaryTokens\`.
5. Call Chronicle in \`--stdin\` mode.

Command pattern:

\`\`\`bash
echo '{"title":"...","description":"...","summary":"...","parentIds":[],"agent":"${agent}"}' | chronicle create --stdin
\`\`\`

Example usage:

- \`/chronicle-memory\` for source material like \`@docs/architecture.md\` or pasted migration notes

## Update an existing memory

Use this when a saved memory is stale, incomplete, or partially incorrect.

1. Identify the target memory ID.
2. Load the current memory first with \`chronicle get <id>\`.
3. Compare the stored memory against the current project state and session context.
4. Preserve information that is still correct.
5. Update only the fields that are stale or incomplete.
6. If you change \`summary\`, keep it within \`maxMemorySummaryTokens\`.
7. Prefer \`--stdin\` mode for structured updates.

Command pattern:

\`\`\`bash
chronicle get <id>
echo '{"summary":"## Goals\n...","description":"Updated retrieval signal"}' | chronicle update <id> --stdin
\`\`\`

Do not rewrite a memory from scratch unless the old content is no longer trustworthy.`,
  });
}