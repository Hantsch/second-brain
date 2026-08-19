/**
 * Vault-Watcher. Der Nutzer darf die Dateien direkt bearbeiten — dieser Wachhund
 * merkt es und meldet gebuendelte Pfadlisten.
 *
 * Ausgewiesener Adapter: benutzt `chokidar`. 250 ms trailing debounce, damit ein
 * Speichervorgang aus Obsidian (Datei schreiben, umbenennen, Index anfassen) genau
 * eine Meldung erzeugt und nicht fuenf.
 */

import { watch } from 'chokidar';
import { toVaultPath } from './paths';

/** Trailing debounce in Millisekunden. */
export const WATCH_DEBOUNCE_MS = 250;

export interface WatchOptions {
  debounceMs?: number;
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
): Batcher {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const paths = [...pending].sort((a, b) => a.localeCompare(b));
    pending.clear();
    onFlush(paths);
  };

  return {
    add(path: string): void {
      pending.add(path);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(send, debounceMs);
    },
    flush(): void {
      if (timer !== null) clearTimeout(timer);
      send();
    },
    cancel(): void {
      if (timer !== null) clearTimeout(timer);
      timer = null;
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
  const batcher = createBatcher(onChange, options.debounceMs ?? WATCH_DEBOUNCE_MS);
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

  watcher.on('all', (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) return;
    const relative = toVaultPath(path);
    if (relative.length === 0 || isIgnoredPath(relative)) return;
    batcher.add(relative);
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
      batcher.cancel();
      await watcher.close();
    },
  };
}
