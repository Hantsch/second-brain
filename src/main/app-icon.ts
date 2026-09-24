/* Where the app's icon files live and how to resolve one. Split out of
   `window.ts` (058, D2) because the tray needs the same icon path but must
   not import the window module for it. */

import { join, resolve } from 'node:path';
import type { AppIcon } from '@shared/types';
import { isDev } from './renderer-entry';

export const ICON_FILES: Record<AppIcon, string> = {
  'knowledge-garden': 'knowledge-garden.ico',
  'neural-core': 'neural-core.ico',
  'circuit-cortex': 'circuit-cortex.ico',
  'brain-chip': 'brain-chip.ico',
  'vault-brain': 'vault-brain.ico',
};

export function appIconPath(icon: AppIcon): string {
  const root = isDev()
    ? resolve('assets', 'app-icons')
    : join(process.resourcesPath, 'assets/app-icons');
  return join(root, ICON_FILES[icon]);
}
