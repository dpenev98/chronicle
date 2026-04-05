import { renderSkillTemplate, type SupportedAgent } from '../shared';

export function renderCreateMemorySkill(agent: SupportedAgent): string {
  return renderSkillTemplate({
    agent,
    description: 'Create a Chronicle memory from the current session.',
    name: '/create-memory',
    body: `# /create-memory

Create a Chronicle memory that preserves durable project knowledge from the current session.

## When to use this skill

- Use it when the session produced decisions, implementation details, debugging discoveries, or next steps worth reusing later.
- Skip it for temporary chatter, abandoned ideas, or details that are already obsolete.

## Workflow

1. Review the entire conversation, not just the final exchange.
2. Identify the durable knowledge worth saving.
3. If Chronicle memories were loaded earlier in the session, collect their IDs for \`parentIds\`.
4. Write a short title and a retrieval-oriented description.
5. Build the summary using this markdown structure:
   - \`## Goals\`
   - \`## Decisions\`
   - \`## Implementation\`
   - \`## Learnings\`
   - \`## Current State\`
   - \`## Next Steps\`
6. Read \`.chronicle/config.json\` and keep the summary within \`maxMemorySummaryTokens\`.
7. Call Chronicle in \`--stdin\` mode with a JSON payload.

## Description quality rule

Think: if a future agent reads only the description, would it know whether this memory is relevant?

## Command pattern

\`\`\`bash
echo '{"title":"...","description":"...","summary":"...","parentIds":["memory-1"],"agent":"claude-code"}' | chronicle create --stdin
\`\`\`

Always prefer \`--stdin\` mode so long summaries and structured markdown remain reliable across shells.`,
  });
}
