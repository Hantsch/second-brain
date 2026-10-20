/* Detecting and creating a vault — the shell uses exclusively
   `core/vault/layout` for this. This file only bundles what main needs from
   it, so the rest of main doesn't import core internals. */

import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { ensureStructure, isVault, readVaultMarker } from '@core/vault';

export { ensureStructure, isVault, readVaultMarker };

/** Name of a vault: from the marker, otherwise the folder name. */
export async function vaultName(root: string): Promise<string> {
  const marker = await readVaultMarker(root);
  return marker?.name ?? basename(root);
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
