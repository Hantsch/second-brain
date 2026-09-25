/**
 * Path-scoped refresh: for a handful of touched paths, stat and read exactly
 * those files — never walk the whole vault. `IndexService.refresh(paths)` uses
 * this for the common case (a save, a delete, a folder rename); it still falls
 * back to the full reconcile in `build.ts` when the paths hint is missing or
 * too large to trust.
 */

import type { RawSource } from '@shared/types';
import { extName, isInside } from '@core/vault/paths';
import type { VaultStat, VaultStore } from '@core/vault/types';
import { collectIngest, indexOne } from './build';
import { deriveSources } from './pages';
import type { IndexedDoc, VaultIndex } from './types';

/** What a scoped refresh found — never more than the paths it was given. */
export interface PathRefreshResult {
  /** Whether any document or source actually changed. `false` means: do nothing else. */
  changed: boolean;
  /** The full document list, ready for `deriveIndexIncremental`. */
  docs: IndexedDoc[];
  /** Paths whose body bucket must be rewritten — changed or removed documents. */
  touchedPaths: string[];
  /** Recomputed sources, or `null` when nothing touched `raw/` or a protocol file. */
  sources: RawSource[] | null;
}

/** Re-collect every raw source from the files under `raw/` — never the whole vault. */
async function collectSources(store: VaultStore): Promise<RawSource[]> {
  const files: VaultStat[] = [];
  for await (const entry of store.walk({ dir: 'raw' })) files.push(entry);
  const ingest = collectIngest(files);
  await Promise.all(
    [...ingest.values()].map(async (entry) => {
      entry.json = await store.readText(entry.protocol);
    }),
  );
  return deriveSources([...ingest.values()]);
}

/** Records the document at `path` as changed or removed in `docsByPath`/`touched`. */
function applyDoc(
  path: string,
  doc: IndexedDoc | null,
  previous: VaultIndex,
  docsByPath: Map<string, IndexedDoc>,
  touched: Set<string>,
): void {
  if (doc === null) {
    if (docsByPath.delete(path)) touched.add(path);
    return;
  }
  docsByPath.set(path, doc);
  const before = previous.byPath.get(path);
  if (before === undefined || before.hash !== doc.hash) touched.add(path);
}

/** One `.md` path: read it if changed, drop it from the map if it is gone. */
async function refreshFile(
  store: VaultStore,
  path: string,
  previous: VaultIndex,
  docsByPath: Map<string, IndexedDoc>,
  touched: Set<string>,
): Promise<void> {
  const stat = await store.stat(path);
  if (stat === null) {
    if (docsByPath.delete(path)) touched.add(path);
    return;
  }
  // A document can disappear between the stat and the read (`indexOne` returns
  // null then, same handling as a plain deletion).
  applyDoc(path, await indexOne(store, stat, previous), previous, docsByPath, touched);
}

/**
 * A path with no extension: might be a directory (folder rename or delete).
 * Walk only that subtree and diff it against the documents already known to
 * live under the prefix — that is what catches a rename or a whole-folder
 * delete without a tree walk of the rest of the vault.
 */
async function refreshDirectory(
  store: VaultStore,
  dir: string,
  previous: VaultIndex,
  docsByPath: Map<string, IndexedDoc>,
  touched: Set<string>,
): Promise<void> {
  const known = [...previous.byPath.keys()].filter((path) => isInside(dir, path));
  const files: VaultStat[] = [];
  for await (const entry of store.walk({ dir, ext: '.md' })) files.push(entry);
  if (known.length === 0 && files.length === 0) return; // not a directory at all

  const found = new Set<string>();
  for (const file of files) {
    found.add(file.path);
    applyDoc(file.path, await indexOne(store, file, previous), previous, docsByPath, touched);
  }
  for (const path of known) {
    if (found.has(path)) continue;
    docsByPath.delete(path);
    touched.add(path);
  }
}

/** Does this path touch the raw sources, directly or as a protocol file? */
function touchesSources(path: string): boolean {
  return isInside('raw', path) || path.endsWith('.ingest.json');
}

/**
 * Refresh exactly the given paths: stat and read only what they name, never
 * the whole tree. `changed: false` means every hash still matched — the
 * caller then skips derive, save and the generation bump entirely.
 */
export async function refreshPaths(
  store: VaultStore,
  paths: readonly string[],
  previous: VaultIndex,
): Promise<PathRefreshResult> {
  const docsByPath = new Map(previous.byPath);
  const touched = new Set<string>();
  let sourcesChanged = false;

  for (const path of new Set(paths)) {
    const ext = extName(path);
    if (ext === '.md') {
      await refreshFile(store, path, previous, docsByPath, touched);
    } else if (ext === '') {
      await refreshDirectory(store, path, previous, docsByPath, touched);
    }
    if (touchesSources(path)) sourcesChanged = true;
  }

  const sources = sourcesChanged ? await collectSources(store) : null;
  return {
    changed: touched.size > 0 || sourcesChanged,
    docs: [...docsByPath.values()],
    touchedPaths: [...touched],
    sources,
  };
}
