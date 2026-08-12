/* System channels: open a file in its default program, reveal a folder, open
   a link in the browser. Only http, https, and mailto leave the app. */

import { isAbsolute, join } from 'node:path';
import { shell } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import type { Services } from '../services';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Vault-relative paths are resolved against the vault root. */
function resolvePath(services: Services, path: string): string {
  if (isAbsolute(path)) return path;
  const root = services.vaultRoot();
  if (!root) throw fail('no-vault', 'kein Vault geöffnet');
  if (path.split(/[\\/]/).includes('..')) throw fail('invalid', 'Pfad liegt außerhalb des Vaults');
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
      if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        throw fail('invalid', 'dieses Protokoll wird nicht geöffnet');
      }
      await shell.openExternal(parsed.toString());
    },

    'shell:showInFolder': ({ path }) => {
      shell.showItemInFolder(resolvePath(services, path));
    },
  });
}
