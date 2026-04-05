import { renderJsonTemplate } from '../shared';

export interface CopilotHookDefinition {
  command: string;
  event: 'SessionStart';
  timeout: number;
}

export interface CopilotHookSettings {
  hooks: CopilotHookDefinition[];
}

export function createCopilotHookConfig(): CopilotHookSettings {
  return {
    hooks: [
      {
        command: 'chronicle hook session-start',
        event: 'SessionStart',
        timeout: 5000,
      },
    ],
  };
}

export function renderCopilotHookConfig(): string {
  return renderJsonTemplate(createCopilotHookConfig());
}
