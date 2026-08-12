/* Kanäle rund um den Vault: öffnen, anlegen, schließen, lesen, schreiben.
   Gelesen und geschrieben wird ausschließlich über den `VaultStore` des Kerns —
   der prüft Hashes, mergt Frontmatter und legt Gelöschtes in den Papierkorb. */

import { basename } from 'node:path';
import { dialog } from 'electron';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import type { Services } from '../services';
import { directoryExists, isVault, vaultName } from '../vault-layout';

/** Ordner-Dialog; leerer Rückgabewert heißt abgebrochen. */
async function pickDirectory(services: Services): Promise<string> {
  const parent = services.mainWindow();
  const properties = ['openDirectory', 'createDirectory'] as const;
  const result = await (parent
    ? dialog.showOpenDialog(parent, { properties: [...properties] })
    : dialog.showOpenDialog({ properties: [...properties] }));
  return result.canceled ? '' : (result.filePaths[0] ?? '');
}

export function vaultHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'vault:status': () => services.status(),

    'vault:choose': async () => {
      const picked = await pickDirectory(services);
      if (!picked) return null;
      return services.openVault(picked);
    },

    'vault:open': ({ path }) => services.openVault(path),

    /* Konvention: leerer `path` heißt „frag den Nutzer nach dem Ordner", leerer
       `name` heißt „nimm den Ordnernamen". So braucht das Onboarding keinen
       zweiten Kanal, nur um einen Ordner auszuwählen. */
    'vault:create': async ({ path, name }) => {
      const target = path.trim() || (await pickDirectory(services));
      if (!target) throw fail('cancelled', 'abgebrochen');
      return services.createVault(target, name.trim() || basename(target));
    },

    'vault:close': () => services.closeVault(),

    'vault:recent': async () => {
      const out: { path: string; name: string; exists: boolean }[] = [];
      for (const path of services.settings.app().recentVaults) {
        const exists = (await directoryExists(path)) && (await isVault(path));
        out.push({ path, name: exists ? await vaultName(path) : basename(path), exists });
      }
      return out;
    },

    'vault:read': ({ path }) => services.requireStore().read(path),

    'vault:write': (request) => services.requireStore().write(request),

    'vault:delete': async ({ path }) => {
      const result = await services.requireStore().delete(path);
      return { undoToken: result.undoToken };
    },

    'vault:tree': async ({ dir }) => {
      const store = services.requireStore();
      const out: { path: string; dir: boolean; size: number }[] = [];
      for await (const entry of store.walk({
        ...(dir ? { dir } : {}),
        recursive: false,
        includeDirs: true,
      })) {
        out.push({ path: entry.path, dir: entry.dir, size: entry.size });
      }
      return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.path.localeCompare(b.path));
    },
  });
}
