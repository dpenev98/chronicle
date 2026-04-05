import { renderSkillTemplate, type SupportedAgent } from '../shared';

export function renderCreateMemoryFromSkill(agent: SupportedAgent): string {
  return renderSkillTemplate({
    agent,
    description: 'Create a Chronicle memory from existing files or pasted source material.',
    name: '/create-memory-from',
    body: `# /create-memory-from

Create a Chronicle memory from existing project files, documents, or pasted source material.

## When to use this skill

- Use it for brownfield adoption when important project knowledge already exists outside the current chat.
- Analyze the supplied files or pasted text, not the conversation history, as the primary source material.

## Workflow

1. Read the provided files or pasted text carefully.
2. Identify the durable knowledge worth preserving.
3. If Chronicle memories were loaded in the current session, include those IDs in \`parentIds\` when they influenced your understanding.
4. Write a title and a retrieval-oriented description.
5. Build the summary using the standard Chronicle sections:
   - \`## Goals\`
   - \`## Decisions\`
   - \`## Implementation\`
   - \`## Learnings\`
   - \`## Current State\`
   - \`## Next Steps\`
6. Read \`.chronicle/config.json\` and keep the summary within \`maxMemorySummaryTokens\`.
7. Call Chronicle in \`--stdin\` mode.

## Command pattern

\`\`\`bash
echo '{"title":"...","description":"...","summary":"...","parentIds":[],"agent":"claude-code"}' | chronicle create --stdin
\`\`\`

Example usage:

- \`/create-memory-from @docs/architecture.md @docs/api-design.md\`
- \`/create-memory-from <pasted migration plan>\``,
  });
}
