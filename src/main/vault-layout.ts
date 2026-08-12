/* Vault erkennen und anlegen — die Shell benutzt dafür ausschließlich
   `core/vault/layout`. Diese Datei bündelt nur, was der Main davon braucht,
   damit der Rest des Mains keine Kern-Interna importiert. */

import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { ensureStructure, isVault, readVaultMarker } from '@core/vault';

export { ensureStructure, isVault, readVaultMarker };

/** Name eines Vaults: aus dem Marker, sonst der Ordnername. */
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
