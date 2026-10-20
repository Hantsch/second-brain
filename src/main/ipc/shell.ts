/* System channels: open a file in its default program, reveal a folder, open
   a link in the browser. Only http, https, and mailto leave the app. */

import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { platform } from 'node:process';
import { shell } from 'electron';
import { isSafeVaultPath } from '../../core/vault/paths';
import { EXTERNAL_PROTOCOLS } from '../navigation';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import type { Services } from '../services';

/** Whether `candidate` (already `path.resolve`d) is the vault root or lives
    inside it. Resolved-path based, not a string prefix check — a sibling
    folder like `C:\vault-evil` must not pass just because it starts with
    `C:\vault`. Case-insensitive on win32, where the filesystem is too. */
function isInsideVault(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const a = platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot;
  const b = platform === 'win32' ? resolvedCandidate.toLowerCase() : resolvedCandidate;
  if (a === b) return true;
  const rel = relative(a, b);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(`..${sep}`);
}

/** Vault-relative paths are resolved against the vault root; absolute paths
    must resolve into the open vault — anything else is refused before it
    ever reaches `shell.*`. */
function resolvePath(services: Services, path: string): string {
  const root = services.vaultRoot();
  if (!root) throw fail('no-vault', 'kein Vault geöffnet');
  if (isAbsolute(path)) {
    if (!isInsideVault(root, path)) {
      throw fail('invalid', 'Pfad liegt außerhalb des Vaults');
    }
    return path;
  }
  if (!isSafeVaultPath(path)) throw fail('invalid', 'Pfad liegt außerhalb des Vaults');
  return join(root, path);
}

export function shellHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'shell:openPath': async ({ path }) => {
      const error = await shell.openPath(resolvePath(services, path));
      if (error) throw fail('io', 'die Datei konnte nicht geöffnet werden');
    },

    'shell:openExternal': async ({ url }) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw fail('invalid', 'keine gültige Adresse');
      }
      if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        throw fail('invalid', 'dieses Protokoll wird nicht geöffnet');
      }
      await shell.openExternal(parsed.toString());
    },

    'shell:showInFolder': ({ path }) => {
      shell.showItemInFolder(resolvePath(services, path));
    },
  });
}
