import { renderJsonTemplate } from '../shared';

export interface ClaudeCodeCommandHook {
  command: string;
  timeout: number;
  type: 'command';
}

export interface ClaudeCodeSessionStartMatcher {
  hooks: ClaudeCodeCommandHook[];
  matcher: 'startup';
}

export interface ClaudeCodeHookSettings {
  hooks: {
    SessionStart: ClaudeCodeSessionStartMatcher[];
  };
}

export function createClaudeCodeHookConfig(): ClaudeCodeHookSettings {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              command: 'chronicle hook session-start',
              timeout: 5000,
              type: 'command',
            },
          ],
          matcher: 'startup',
        },
      ],
    },
  };
}

export function renderClaudeCodeHookConfig(): string {
  return renderJsonTemplate(createClaudeCodeHookConfig());
}
