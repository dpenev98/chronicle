import type { SupportedAgent } from '../shared';
import { renderChronicleMemorySkill, renderChronicleMemoryTemplateReference } from './chronicle-memory';

export interface SkillTemplateEntry {
  content: string;
  relativePath: string;
}

export interface SkillTemplateFile {
  directoryName: string;
  files: SkillTemplateEntry[];
}

export function getSkillTemplateFiles(agent: SupportedAgent): SkillTemplateFile[] {
  return [
    {
      directoryName: 'chronicle-memory',
      files: [
        {
          content: renderChronicleMemorySkill(agent),
          relativePath: 'SKILL.md',
        },
        {
          content: renderChronicleMemoryTemplateReference(),
          relativePath: 'references/memory-template.md',
        },
      ],
    },
  ];
}
