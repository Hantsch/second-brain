/**
 * Vault-Watcher. Der Nutzer darf die Dateien direkt bearbeiten — dieser Wachhund
 * merkt es und meldet gebuendelte Pfadlisten.
 *
 * Ausgewiesener Adapter: benutzt `chokidar`. 250 ms trailing debounce, damit ein
 * Speichervorgang aus Obsidian (Datei schreiben, umbenennen, Index anfassen) genau
 * eine Meldung erzeugt und nicht fuenf.
 *
 * The batcher also carries a bounded max-wait timer (2 s by default). Without it, a
 * sustained stream of events — a sync client or a git checkout touching hundreds of
 * files — would keep resetting the trailing debounce indefinitely and the batch would
 * never flush. The max-wait timer starts once, on the first `add` into an empty batch,
 * and is not reset by later adds, so it guarantees a flush within `maxWaitMs`.
 *
 * `add`/`change` events pass through our own write-stability gate (`write-stability.ts`)
 * before they reach the batcher: it holds a file back until its size has been stable for
 * `writeStabilityMs`, so a still-growing file (OneDrive sync, bulk copy) is never reported
 * half-written. It replaces chokidar's `awaitWriteFinish` because a pure timer-driven gate
 * can be proven under fake timers; chokidar's internal clock cannot. Every other event
 * (unlink, addDir, ...) goes straight to the batcher, undelayed.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { watch } from 'chokidar';
import { toVaultPath } from './paths';
import { WATCH_WRITE_STABILITY_MS, createWriteStabilityGate } from './write-stability';

export { WATCH_WRITE_STABILITY_MS };

/** Trailing debounce in Millisekunden. */
export const WATCH_DEBOUNCE_MS = 250;

/** Obergrenze fuer die Wartezeit, siehe Kopfkommentar. */
export const WATCH_MAX_WAIT_MS = 2000;

export interface WatchOptions {
  debounceMs?: number;
  /** Obergrenze fuer die Wartezeit bis zum Flush; siehe `WATCH_MAX_WAIT_MS`. */
  maxWaitMs?: number;
  /** Wartezeit auf stabile Dateigroesse vor der Meldung; siehe `WATCH_WRITE_STABILITY_MS`. */
  writeStabilityMs?: number;
  /** Fehler des Watchers; ohne Angabe landen sie als Warnung im Log. */
  onError?: (error: unknown) => void;
}

export interface VaultWatcher {
  /** Erfuellt, sobald der erste Durchlauf fertig ist. */
  whenReady(): Promise<void>;
  /** Wartende Meldung sofort abschicken. */
  flush(): void;
  /** Watcher schliessen; danach kommt keine Meldung mehr. */
  dispose(): Promise<void>;
}

export interface Batcher {
  add(path: string): void;
  flush(): void;
  cancel(): void;
}

/*
 * Was nie eine Meldung wert ist:
 * - `.secondbrain/index` und `.secondbrain/trash` sind Ableitungen bzw. Papierkorb,
 * - `.tmp`-Dateien sind Zwischenstaende des atomaren Schreibens,
 * - `node_modules` und `.git` gehoeren nicht zum Inhalt.
 */
const IGNORED = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.secondbrain\/(index|trash)(\/|$)/,
  /\.tmp$/,
];

/** Gilt fuer absolute wie relative Pfade — Backslashes werden vorher vereinheitlicht. */
export function isIgnoredPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return IGNORED.some((pattern) => pattern.test(normalized));
}

/**
 * Sammelt Pfade und schickt sie erst ab, wenn `debounceMs` lang Ruhe war.
 * Ohne Dateisystem testbar — deshalb hier ausdruecklich exportiert.
 */
export function createBatcher(
  onFlush: (paths: string[]) => void,
  debounceMs = WATCH_DEBOUNCE_MS,
  maxWaitMs = WATCH_MAX_WAIT_MS,
): Batcher {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (maxWaitTimer !== null) clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  };

  const send = (): void => {
    clearTimers();
    if (pending.size === 0) return;
    const paths = [...pending].sort((a, b) => a.localeCompare(b));
    pending.clear();
    onFlush(paths);
  };

  return {
    add(path: string): void {
      const wasEmpty = pending.size === 0;
      pending.add(path);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(send, debounceMs);
      if (wasEmpty) {
        maxWaitTimer = setTimeout(send, maxWaitMs);
      }
    },
    flush(): void {
      send();
    },
    cancel(): void {
      clearTimers();
      pending.clear();
    },
  };
}

/**
 * Beobachtet den Vault und meldet vault-relative Pfade (immer mit '/').
 * Der Rueckgabewert muss beim Schliessen des Vaults `dispose()` bekommen.
 */
export function watchVault(
  root: string,
  onChange: (paths: string[]) => void,
  options: WatchOptions = {},
): VaultWatcher {
  const batcher = createBatcher(
    onChange,
    options.debounceMs ?? WATCH_DEBOUNCE_MS,
    options.maxWaitMs ?? WATCH_MAX_WAIT_MS,
  );
  const gate = createWriteStabilityGate(
    (path) => batcher.add(path),
    (path) =>
      stat(join(root, path)).then(
        (stats) => stats.size,
        () => null,
      ),
    options.writeStabilityMs ?? WATCH_WRITE_STABILITY_MS,
  );
  const watcher = watch(root, {
    cwd: root,
    ignoreInitial: true,
    persistent: true,
    ignored: (path: string) => isIgnoredPath(path),
  });

  const ready = new Promise<void>((resolve) => {
    watcher.on('ready', () => {
      resolve();
    });
  });

  watcher.on('all', (event, path) => {
    if (typeof path !== 'string' || path.length === 0) return;
    const relative = toVaultPath(path);
    if (relative.length === 0 || isIgnoredPath(relative)) return;
    if (event === 'add' || event === 'change') gate.touch(relative);
    else batcher.add(relative);
  });

  watcher.on('error', (error) => {
    if (options.onError) options.onError(error);
    // Ein Watcher-Fehler darf die App nicht beenden: der Vault bleibt lesbar.
    else console.warn('[vault/watch] Watcher-Fehler:', error);
  });

  return {
    whenReady: () => ready,
    flush: () => batcher.flush(),
    async dispose(): Promise<void> {
      // Gate first: a stable report fired during teardown would re-arm the batcher.
      gate.cancel();
      batcher.cancel();
      await watcher.close();
    },
  };
}
