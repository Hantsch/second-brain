/**
 * Kennzahlen des Index, in der Form, die `IpcRoutes['index:stats']` verlangt.
 *
 * Ohne Index sind alle Zahlen 0 und die Zeitstempel null — das ist ein ehrlicher
 * Leerzustand, kein Fehler. Der Renderer zeigt darauf seine Leerkarte.
 */

import type { IndexStats } from '@shared/ipc';
import type { VaultIndex } from './types';

/** Was die Shell zeigt, solange kein Index gebaut wurde. */
export function emptyStats(): IndexStats {
  return {
    docs: 0,
    todos: 0,
    projects: 0,
    modules: 0,
    pages: 0,
    words: 0,
    builtAt: null,
    durationMs: null,
  };
}

/** Kennzahlen aus einem Index. */
export function indexStats(index: VaultIndex | null): IndexStats {
  if (index === null) return emptyStats();
  let words = 0;
  for (const doc of index.docs) words += doc.words;
  return {
    docs: index.docs.length,
    todos: index.todos.length,
    projects: index.projects.length,
    modules: index.counts.size,
    pages: index.pages.length,
    words,
    builtAt: index.builtAt.length > 0 ? index.builtAt : null,
    durationMs: index.durationMs,
  };
}
