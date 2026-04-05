import type { ChronicleConfig } from '../../config/config';
import { buildChronicleInstructionBody, renderInstructionBlock } from '../shared';

export function renderClaudeMdInstructions(config: ChronicleConfig): string {
  return renderInstructionBlock(buildChronicleInstructionBody(config));
}
