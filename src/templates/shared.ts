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
  switch (agent) {
    case 'claude-code':
      return '';
    case 'copilot':
      return normalizeTemplateContent(`---
name: ${name}
description: ${description}
---`);
  }
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
A memory catalog is injected into the session context. When you see the user's first message:
1. Review the Chronicle memory catalog (titles and descriptions)
2. Determine which memories, if any, are relevant to the user's request
3. If relevant memories exist, run \`chronicle get <id>\` to load full content
4. Respect budget limits: max ${config.maxMemoriesToPull} memories, max ${config.maxRetrievalTokenBudget} total tokens
5. If loading more than ${config.requireConfirmationAbove} memories, ask the user first and show token estimates


### Memory Workflows
Use the \`chronicle-memory\` skill for Chronicle memory operations such as browsing the catalog,
recalling relevant memories, creating new memories, creating memories from existing source material,
and updating stale memories.`;
}
