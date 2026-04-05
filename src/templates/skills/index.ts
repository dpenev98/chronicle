import type { SupportedAgent } from '../shared';
import { renderCreateMemoryFromSkill } from './create-memory-from';
import { renderCreateMemorySkill } from './create-memory';
import { renderListMemoriesSkill } from './list-memories';
import { renderRecallSkill } from './recall';
import { renderUpdateMemorySkill } from './update-memory';

export interface SkillTemplateFile {
  content: string;
  directoryName: string;
}

export function getSkillTemplateFiles(agent: SupportedAgent): SkillTemplateFile[] {
  return [
    {
      content: renderCreateMemorySkill(agent),
      directoryName: 'create-memory',
    },
    {
      content: renderCreateMemoryFromSkill(agent),
      directoryName: 'create-memory-from',
    },
    {
      content: renderUpdateMemorySkill(agent),
      directoryName: 'update-memory',
    },
    {
      content: renderListMemoriesSkill(agent),
      directoryName: 'list-memories',
    },
    {
      content: renderRecallSkill(agent),
      directoryName: 'recall',
    },
  ];
}
