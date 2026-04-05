import type { ChronicleConfig } from '../config/config';

export type SupportedAgent = 'claude-code' | 'copilot';

export interface SkillTemplateOptions {
  agent: SupportedAgent;
  body: string;
  description: string;
  name: string;
}

function normalizeTemplateContent(content: string): string {
  return `${content.trim()}\n`;
}

function renderSkillFrontmatter(agent: SupportedAgent, name: string, description: string): string {
  if (agent === 'claude-code') {
    return '';
  }

  return normalizeTemplateContent(`---
name: ${name}
description: ${description}
---`);
}

export function renderSkillTemplate(options: SkillTemplateOptions): string {
  return `${renderSkillFrontmatter(options.agent, options.name, options.description)}${normalizeTemplateContent(options.body)}`;
}

export function renderInstructionBlock(body: string): string {
  return normalizeTemplateContent(`<!-- chronicle:start -->
${body.trim()}
<!-- chronicle:end -->`);
}

export function renderJsonTemplate(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildChronicleInstructionBody(config: ChronicleConfig): string {
  return `## Chronicle Memory System

This project uses Chronicle for persistent, version-controlled memory across coding sessions.
Chronicle is separate from your built-in memory systems and stores structured project knowledge
in a local SQLite database within the repository.

### On Session Start
A memory catalog may be injected into the session context. When you see the user's first message:
1. Review the Chronicle memory catalog (titles and descriptions)
2. Determine which memories, if any, are relevant to the user's request
3. If relevant memories exist, run \`chronicle get <id>\` to load full content
4. Respect budget limits: max ${config.maxMemoriesToPull} memories, max ${config.maxRetrievalTokenBudget} total tokens
5. If loading more than ${config.requireConfirmationAbove} memories, ask the user first and show token estimates

### On Memory Conflicts
If loaded memories contradict each other, prefer the most recently created one.
Flag the conflict to the user so it can be resolved with a follow-up memory or a supersession update.

### Verify Before Trusting
After loading a memory, if it references specific files, implementations, or configurations,
spot-check that those artifacts still exist and still match what the memory describes before relying on it.

### Available Commands
- \`chronicle list\` — View catalog entries
- \`chronicle get <id>\` — Load a full memory
- Use \`/create-memory\` to save session knowledge
- Use \`/update-memory <id>\` to update an existing memory
- \`chronicle supersede <old_id> <new_id>\` — Mark a memory as replaced`;
}
