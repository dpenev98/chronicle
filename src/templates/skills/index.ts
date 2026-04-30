import type { SupportedAgent } from '../shared';
import { renderChronicleMemorySkill } from './chronicle-memory';

export interface SkillTemplateFile {
  content: string;
  directoryName: string;
}

export function getSkillTemplateFiles(agent: SupportedAgent): SkillTemplateFile[] {
  return [
    {
      content: renderChronicleMemorySkill(agent),
      directoryName: 'chronicle-memory',
    },
  ];
}
