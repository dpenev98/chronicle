export type { SupportedAgent } from './shared';
export { renderClaudeCodeHookConfig, createClaudeCodeHookConfig } from './hooks/claude-code';
export { renderCopilotHookConfig, createCopilotHookConfig } from './hooks/copilot';
export { renderClaudeMdInstructions } from './instructions/claude-md';
export { renderCopilotInstructions } from './instructions/copilot-instructions';
export { getSkillTemplateFiles, type SkillTemplateEntry, type SkillTemplateFile } from './skills';
