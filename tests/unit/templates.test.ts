import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/config';
import {
  createClaudeCodeHookConfig,
  createCopilotHookConfig,
  renderClaudeCodeHookConfig,
  renderCopilotHookConfig,
} from '../../src/templates';
import { renderInstructionBlock, renderJsonTemplate, renderSkillTemplate } from '../../src/templates/shared';
import { renderClaudeMdInstructions } from '../../src/templates/instructions/claude-md';
import { renderCopilotInstructions } from '../../src/templates/instructions/copilot-instructions';
import { renderCreateMemoryFromSkill } from '../../src/templates/skills/create-memory-from';
import { renderCreateMemorySkill } from '../../src/templates/skills/create-memory';
import { getSkillTemplateFiles } from '../../src/templates/skills';
import { renderListMemoriesSkill } from '../../src/templates/skills/list-memories';
import { renderRecallSkill } from '../../src/templates/skills/recall';
import { renderUpdateMemorySkill } from '../../src/templates/skills/update-memory';

function countOccurrences(content: string, fragment: string): number {
  return content.split(fragment).length - 1;
}

describe('template layer', () => {
  it('renders all five skill files for both supported agents', () => {
    const claudeSkills = getSkillTemplateFiles('claude-code');
    const copilotSkills = getSkillTemplateFiles('copilot');

    expect(claudeSkills).toHaveLength(5);
    expect(copilotSkills).toHaveLength(5);
    expect(claudeSkills.map((skill) => skill.directoryName)).toEqual([
      'create-memory',
      'create-memory-from',
      'update-memory',
      'list-memories',
      'recall',
    ]);
    expect(copilotSkills[0]?.content.startsWith('---\nname: /create-memory')).toBe(true);
    expect(claudeSkills[0]?.content.startsWith('---')).toBe(false);
  });

  it('keeps skill directory names unique and aligned across agents', () => {
    const claudeSkills = getSkillTemplateFiles('claude-code');
    const copilotSkills = getSkillTemplateFiles('copilot');
    const claudeNames = claudeSkills.map((skill) => skill.directoryName);
    const copilotNames = copilotSkills.map((skill) => skill.directoryName);

    expect(new Set(claudeNames).size).toBe(claudeNames.length);
    expect(new Set(copilotNames).size).toBe(copilotNames.length);
    expect(copilotNames).toEqual(claudeNames);
  });

  it('renders copilot skills with exactly one yaml frontmatter block and claude skills without one', () => {
    const copilotSkills = getSkillTemplateFiles('copilot');
    const claudeSkills = getSkillTemplateFiles('claude-code');

    for (const skill of copilotSkills) {
      expect(countOccurrences(skill.content, '---')).toBe(2);
      expect(skill.content.startsWith('---\nname: /')).toBe(true);
      expect(skill.content).toContain('\ndescription: ');
      expect(skill.content).toContain('\n# /');
    }

    for (const skill of claudeSkills) {
      expect(skill.content.startsWith('---')).toBe(false);
      expect(skill.content.startsWith('# /')).toBe(true);
    }
  });

  it('renders the create-memory skill with config-aware and stdin guidance', () => {
    const content = renderCreateMemorySkill('claude-code');

    expect(content).toContain('.chronicle/config.json');
    expect(content).toContain('chronicle create --stdin');
    expect(content).toContain('## Goals');
    expect(content).toContain('if a future agent reads only the description');
  });

  it('renders the create-memory-from skill around supplied source material', () => {
    const content = renderCreateMemoryFromSkill('claude-code');

    expect(content).toContain('Analyze the supplied files or pasted text');
    expect(content).toContain('/create-memory-from @docs/architecture.md');
  });

  it('renders update, list, and recall skills with the expected commands', () => {
    expect(renderUpdateMemorySkill('claude-code')).toContain('chronicle update <id> --stdin');
    expect(renderUpdateMemorySkill('claude-code')).toContain('chronicle get <id>');
    expect(renderListMemoriesSkill('claude-code')).toContain('chronicle list --format table');
    expect(renderRecallSkill('claude-code')).toContain('maxMemoriesToPull');
    expect(renderRecallSkill('claude-code')).toContain('maxRetrievalTokenBudget');
    expect(renderRecallSkill('claude-code')).toContain('requireConfirmationAbove');
  });

  it('renders instruction snippets with markers and resolved config values', () => {
    const claudeInstructions = renderClaudeMdInstructions(DEFAULT_CONFIG);
    const copilotInstructions = renderCopilotInstructions(DEFAULT_CONFIG);

    expect(claudeInstructions).toContain('<!-- chronicle:start -->');
    expect(claudeInstructions).toContain('<!-- chronicle:end -->');
    expect(claudeInstructions).toContain(`max ${DEFAULT_CONFIG.maxMemoriesToPull} memories`);
    expect(claudeInstructions).toContain(`max ${DEFAULT_CONFIG.maxRetrievalTokenBudget} total tokens`);
    expect(copilotInstructions).toContain('Chronicle is separate from your built-in memory systems');
  });

  it('renders instruction snippets with custom config values instead of unresolved placeholders', () => {
    const customConfig = {
      ...DEFAULT_CONFIG,
      maxMemoriesToPull: 9,
      maxRetrievalTokenBudget: 1234,
      requireConfirmationAbove: 7,
    };
    const instructions = renderClaudeMdInstructions(customConfig);

    expect(instructions).toContain('max 9 memories');
    expect(instructions).toContain('max 1234 total tokens');
    expect(instructions).toContain('If loading more than 7 memories');
    expect(instructions).not.toContain('{maxMemoriesToPull}');
    expect(instructions).not.toContain('{maxRetrievalTokenBudget}');
    expect(instructions).not.toContain('{requireConfirmationAbove}');
  });

  it('wraps instruction blocks with exactly one marker pair and trims surrounding whitespace', () => {
    const content = renderInstructionBlock('\n\n## Heading\nBody\n\n');

    expect(content.startsWith('<!-- chronicle:start -->\n')).toBe(true);
    expect(content.endsWith('<!-- chronicle:end -->\n')).toBe(true);
    expect(countOccurrences(content, '<!-- chronicle:start -->')).toBe(1);
    expect(countOccurrences(content, '<!-- chronicle:end -->')).toBe(1);
    expect(content).toContain('## Heading\nBody');
  });

  it('renders hook configs that invoke the session-start command', () => {
    const claudeConfig = createClaudeCodeHookConfig();
    const copilotConfig = createCopilotHookConfig();

    expect(claudeConfig.hooks.SessionStart[0]?.hooks[0]?.command).toBe('chronicle hook session-start');
    expect(claudeConfig.hooks.SessionStart[0]?.matcher).toBe('startup');
    expect(copilotConfig.hooks[0]?.command).toBe('chronicle hook session-start');
    expect(copilotConfig.hooks[0]?.event).toBe('SessionStart');
  });

  it('renders parseable json hook configs with trailing newlines', () => {
    const claudeJson = renderClaudeCodeHookConfig();
    const copilotJson = renderCopilotHookConfig();

    expect(claudeJson.endsWith('\n')).toBe(true);
    expect(copilotJson.endsWith('\n')).toBe(true);
    expect(JSON.parse(claudeJson)).toEqual(createClaudeCodeHookConfig());
    expect(JSON.parse(copilotJson)).toEqual(createCopilotHookConfig());
  });

  it('normalizes ad hoc skill and json templates predictably', () => {
    const skill = renderSkillTemplate({
      agent: 'copilot',
      body: '\n# /demo\nBody\n',
      description: 'Demo description',
      name: '/demo',
    });
    const json = renderJsonTemplate({ nested: { ok: true } });

    expect(skill).toBe('---\nname: /demo\ndescription: Demo description\n---\n# /demo\nBody\n');
    expect(json).toBe('{\n  "nested": {\n    "ok": true\n  }\n}\n');
  });
});
