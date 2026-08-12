/* Die eine Stelle, an der Shell und Kern zusammenkommen.

   Wer ein Kernmodul liefert, hängt es hier ein — sonst nirgends. Der Container
   kennt nur die Nahtstellen aus `contracts.ts`, nie eine konkrete Klasse. */

import { FsVaultStore, watchVault } from '@core/vault';
import { IndexService } from '@core/index';
import { resetExternalTouches } from './claude-touches';
import { createLlmBridge } from './llm-bridge';
import type { Services } from './services';

export function attachCore(services: Services): void {
  /* Dateien: der echte Store des Kerns, pro geöffnetem Vault einer. */
  services.attachVaultStore((root) => new FsVaultStore(root));

  /* Index: beim Öffnen aus `.secondbrain/index/index.json` geladen und
     inkrementell nachgezogen; fehlt oder taugt die Datei nicht, wird neu
     gebaut. `IndexService` braucht den vollen `VaultStore` (walk, readText,
     writeText) — die Nahtstelle der Shell reicht nicht, also baut die Brücke
     ihren eigenen. `FsVaultStore` hält keinen Zustand, das kostet nichts. */
  services.attachIndex(async (root) => {
    const staleAfterDays = services.settings.vault()?.overview.staleAfterDays;
    /* Dieselbe Karte über die Lebenszeit dieses Vaults: der erste Sitzungslauf
       füllt sie, jeder Indexlauf danach liest sie (siehe claude-touches.ts). */
    return IndexService.open(new FsVaultStore(root), {
      ...(staleAfterDays === undefined ? {} : { staleAfterDays }),
      externalTouches: resetExternalTouches(),
    });
  });

  /* Externe Änderungen: chokidar mit 250 ms Nachlauf, gemeldet als `external`. */
  services.attachWatcher(async (root, onChange) => {
    const watcher = watchVault(root, (paths) => onChange(paths, true), {
      onError: (error) => console.warn('[watch]', error),
    });
    /* Erst nach dem ersten Durchlauf meldet chokidar Änderungen. Wer vorher
       zurückkehrt, verliert stillschweigend alles, was in dieser Lücke
       geschrieben wird — deshalb wird hier gewartet. */
    await watcher.whenReady();
    return watcher;
  });

  /* Sprachmodelle: Provider-Bestand und Routing kommen aus den Einstellungen. */
  services.attachLlm(createLlmBridge(services));
}
