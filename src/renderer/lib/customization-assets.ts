import type { AppBackground, AppIcon } from '@shared/types';

import thoughtCatcher from '../../../assets/concept-art/01-thought-catcher.png';
import knowledgeConstellation from '../../../assets/concept-art/02-knowledge-constellation.png';
import pocketVault from '../../../assets/concept-art/03-pocket-vault.png';
import threadOfReturn from '../../../assets/concept-art/04-thread-of-return.png';
import knowledgeGarden from '../../../assets/concept-art/05-knowledge-garden.png';
import knowledgeGardenIcon from '../../../assets/app-icons/knowledge-garden.png';
import neuralCoreIcon from '../../../assets/app-icons/neural-core.png';
import circuitCortexIcon from '../../../assets/app-icons/circuit-cortex.png';
import brainChipIcon from '../../../assets/app-icons/brain-chip.png';
import vaultBrainIcon from '../../../assets/app-icons/vault-brain.png';

export const BACKGROUND_ASSETS: Record<Exclude<AppBackground, 'none'>, string> = {
  'thought-catcher': thoughtCatcher,
  'knowledge-constellation': knowledgeConstellation,
  'pocket-vault': pocketVault,
  'thread-of-return': threadOfReturn,
  'knowledge-garden': knowledgeGarden,
};

export const ICON_ASSETS: Record<AppIcon, string> = {
  'knowledge-garden': knowledgeGardenIcon,
  'neural-core': neuralCoreIcon,
  'circuit-cortex': circuitCortexIcon,
  'brain-chip': brainChipIcon,
  'vault-brain': vaultBrainIcon,
};

export function backgroundImage(background: AppBackground): string | undefined {
  return background === 'none' ? undefined : `url("${BACKGROUND_ASSETS[background]}")`;
}
