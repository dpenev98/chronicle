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

function renderSkillFrontmatter(_agent: SupportedAgent, name: string, description: string): string {
  return normalizeTemplateContent(`---
name: ${name}
description: ${description}
license: Apache-2.0
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
A memory catalog is injected into the session context. When you see the user's first message:
1. Review the Chronicle memory catalog (titles and descriptions)
2. Default to loading no memories unless a memory is clearly relevant for the user's message
3. Only load the smallest set of memories that are clearly relevant; if relevance is uncertain, do not pull that memory entry
4. If a memory is clearly relevant to the user's message, run \`chronicle get <id>\` to load full content
5. Respect budget limits: max ${config.maxMemoriesToPull} memories, max ${config.maxRetrievalTokenBudget} total tokens
6. If loading more than ${config.requireConfirmationAbove} memories, ask the user first and show token estimates

### Memory Workflows
Use the \`chronicle-memory\` skill for Chronicle memory operations such as browsing the catalog,
recalling relevant memories, creating new memories, creating memories from existing source material,
and updating stale memories.`;
}
