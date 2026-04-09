import { renderJsonTemplate } from '../shared';

export interface CopilotCommandHook {
  command: string;
  timeout: number;
  type: 'command';
}

export interface CopilotHookSettings {
  hooks: {
    SessionStart: CopilotCommandHook[];
  };
}

export function createCopilotHookConfig(): CopilotHookSettings {
  return {
    hooks: {
      SessionStart: [
        {
          type: 'command',
          command: 'chronicle hook session-start',
          timeout: 5000,
        },
      ],
    },
  };
}

export function renderCopilotHookConfig(): string {
  return renderJsonTemplate(createCopilotHookConfig());
}
