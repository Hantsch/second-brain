/* The one place where shell and core come together.

   Whoever supplies a core module wires it in here — nowhere else. The
   container only knows the seams from `contracts.ts`, never a concrete
   class. */

import { FsVaultStore, watchVault } from '@core/vault';
import { IndexService } from '@core/index';
import { resetExternalTouches } from './claude-touches';
import { createLlmBridge } from './llm-bridge';
import type { Services } from './services';

export function attachCore(services: Services): void {
  /* Files: the core's real store, one per opened vault. */
  services.attachVaultStore((root) => new FsVaultStore(root));

  /* Index: loaded from `.secondbrain/index/index.json` on open and updated
     incrementally; if the file is missing or unusable, it's rebuilt.
     `IndexService` needs the full `VaultStore` (walk, readText, writeText) —
     the shell's seam isn't enough, so the bridge builds its own. `FsVaultStore`
     holds no state, so this costs nothing. */
  services.attachIndex(async (root) => {
    const staleAfterDays = services.settings.vault()?.overview.staleAfterDays;
    /* The same map for the lifetime of this vault: the first session run
       fills it, every index run after that reads it (see claude-touches.ts). */
    return IndexService.open(new FsVaultStore(root), {
      ...(staleAfterDays === undefined ? {} : { staleAfterDays }),
      externalTouches: resetExternalTouches(),
    });
  });

  /* External changes: chokidar with a 250ms debounce, reported as `external`. */
  services.attachWatcher(async (root, onChange) => {
    const watcher = watchVault(root, (paths) => onChange(paths, true), {
      onError: (error) => console.warn('[watch]', error),
    });
    /* Chokidar only reports changes after the initial scan. Returning before
       that would silently lose anything written during this gap — hence the
       wait here. */
    await watcher.whenReady();
    return watcher;
  });

  /* Language models: provider inventory and routing come from settings. */
  services.attachLlm(createLlmBridge(services));
}
