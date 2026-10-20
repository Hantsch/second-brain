/**
 * The index on disk, written through the `VaultStore` and therefore atomically
 * (tmp + rename) file by file. Three kinds of files, all derived from the manifest
 * path (`indexFiles` in `@core/vault/paths`):
 *
 * - the **manifest** `<stem>.json`: every document without its body, plus todos,
 *   projects, areas, pages, sources, counts and broken links;
 * - 256 **body buckets** `<stem>.bodies/<xx>.json`, `xx` = first two hex chars of
 *   `sha256(path)`, each `{path, hash, body}` per document;
 * - the **search file** `<stem>.search.json`: MiniSearch state plus the path → hash
 *   pairs it was built from.
 *
 * Splitting them means a save only rewrites the buckets of the documents that
 * changed, not the text of the whole vault.
 *
 * The index is **derived**, so the rule throughout is: when in doubt, return less
 * and rebuild. A bucket entry is only trusted when its hash equals the manifest's;
 * anything else drops that document (and marks the load `partial`) instead of
 * answering from a stale body.
 */

import type { Area, Project, RawSource, Todo, WikiPage } from '@shared/types';
import { sha256 } from '@core/vault/hash';
import { baseName, indexBucketPath, indexFiles, indexPath } from '@core/vault/paths';
import type { IndexFiles } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import { splitPassages } from './passages';
import type {
  BrokenLink,
  IndexDerivedFor,
  IndexStore,
  IndexedDoc,
  ModulePageCounts,
  SerializedSearch,
  StoredIndex,
  VaultIndex,
} from './types';

/**
 * Bump whenever the shape changes. Older files are discarded.
 *
 * 2: `areas` was added.
 * 3: split into manifest, body buckets and search file. A schema-2 `index.json`
 * carries bodies in the manifest slot and no buckets — it is discarded whole, never
 * half-read.
 * 4: search entries are passages (`<path>#<n>`), no longer whole documents (053).
 */
export const INDEX_SCHEMA_VERSION = 4;

/** Neutral content for `clear()`: read back as "nothing there". */
const CLEARED = '{"schema":0}\n';

/**
 * A document as the manifest holds it: no body, no search field. `passages` is
 * derived from `body` and `bodyLine` alone (see `passages.ts`), so it is dropped
 * here too and recomputed on load once the body is back from its bucket — storing
 * it would just be the body text again under another name.
 */
type ManifestDoc = Omit<IndexedDoc, 'text' | 'body' | 'passages'>;

interface Manifest {
  schema: number;
  builtAt: string;
  durationMs: number;
  derivedFor: IndexDerivedFor | null;
  docs: ManifestDoc[];
  todos: Todo[];
  projects: Project[];
  areas: Area[];
  pages: WikiPage[];
  sources: RawSource[];
  counts: [string, ModulePageCounts][];
  brokenLinks: BrokenLink[];
}

interface BodyEntry {
  path: string;
  hash: string;
  body: string;
}

/** The bucket a document's body lives in: first two hex chars of `sha256(path)`. */
export function bodyBucket(path: string): string {
  return sha256(path).slice(0, 2);
}

const BUCKET_NAME = /^([0-9a-f]{2})\.json$/;

/** Bucket files written at once during a save. */
const BUCKET_WRITE_BATCH = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Parsed JSON of a file, or `undefined` when it is missing, empty or unreadable. */
function parseJson(raw: string | null): unknown {
  if (raw === null || raw.trim().length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // Half-written or hand-mangled file: treat as absent.
    return undefined;
  }
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/** A manifest document. `null` means the manifest itself cannot be trusted. */
function reviveManifestDoc(value: unknown): ManifestDoc | null {
  if (!isRecord(value)) return null;
  if (typeof value['path'] !== 'string' || typeof value['hash'] !== 'string') return null;
  // A body in the manifest is never read: bodies only come from the buckets.
  // Passages are recomputed from the body once it is back, not carried here.
  const doc: Record<string, unknown> = { ...value };
  delete doc['body'];
  delete doc['text'];
  delete doc['passages'];
  return doc as unknown as ManifestDoc;
}

function reviveCounts(value: unknown): Map<string, ModulePageCounts> {
  const counts = new Map<string, ModulePageCounts>();
  for (const entry of asArray<unknown>(value)) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, numbers] = entry as [unknown, unknown];
    if (typeof key !== 'string' || !isRecord(numbers)) continue;
    counts.set(key, {
      sources: Number(numbers['sources'] ?? 0),
      entities: Number(numbers['entities'] ?? 0),
      concepts: Number(numbers['concepts'] ?? 0),
    });
  }
  return counts;
}

function reviveDerivedFor(value: unknown): IndexDerivedFor | null {
  if (!isRecord(value)) return null;
  const { day, staleAfterDays } = value;
  if (typeof day !== 'string' || typeof staleAfterDays !== 'number') return null;
  return { day, staleAfterDays };
}

/** Entries of a bucket file by path; `null` when the bucket is missing or broken. */
function reviveBucket(value: unknown): Map<string, BodyEntry> | null {
  if (!isRecord(value) || value['schema'] !== INDEX_SCHEMA_VERSION) return null;
  if (!Array.isArray(value['entries'])) return null;
  const entries = new Map<string, BodyEntry>();
  for (const entry of value['entries'] as unknown[]) {
    if (!isRecord(entry)) continue;
    const { path, hash, body } = entry;
    if (typeof path !== 'string' || typeof hash !== 'string' || typeof body !== 'string') continue;
    entries.set(path, { path, hash, body });
  }
  return entries;
}

/** Search state and its covers; both empty when the file is missing or broken. */
function reviveSearch(value: unknown): {
  search: SerializedSearch | null;
  covers: Map<string, string>;
} {
  const none = { search: null, covers: new Map<string, string>() };
  if (!isRecord(value) || value['schema'] !== INDEX_SCHEMA_VERSION) return none;
  if (!isRecord(value['state']) || !Array.isArray(value['covers'])) return none;
  const covers = new Map<string, string>();
  for (const pair of value['covers'] as unknown[]) {
    // One unreadable pair makes the whole cover list unknowable — and with it the state.
    if (!Array.isArray(pair) || pair.length !== 2) return none;
    const [path, hash] = pair as [unknown, unknown];
    if (typeof path !== 'string' || typeof hash !== 'string') return none;
    covers.set(path, hash);
  }
  return { search: value['state'] as unknown as SerializedSearch, covers };
}

function toManifest(index: VaultIndex, derivedFor: IndexDerivedFor | null): Manifest {
  return {
    schema: INDEX_SCHEMA_VERSION,
    builtAt: index.builtAt,
    durationMs: index.durationMs,
    derivedFor,
    docs: index.docs.map(({ text: _text, body: _body, passages: _passages, ...rest }) => rest),
    todos: index.todos,
    projects: index.projects,
    areas: index.areas,
    pages: index.pages,
    sources: index.sources,
    counts: [...index.counts],
    brokenLinks: index.brokenLinks,
  };
}

/** Documents grouped by the bucket their body lives in. */
function groupByBucket<T extends { path: string }>(docs: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const doc of docs) {
    const bucket = bodyBucket(doc.path);
    const group = grouped.get(bucket);
    if (group === undefined) grouped.set(bucket, [doc]);
    else group.push(doc);
  }
  return grouped;
}

/**
 * Ablage des Index im Vault. Wer `null` bekommt, baut neu — jede andere Reaktion
 * waere ein Fehler, den es nicht braucht.
 */
export class VaultIndexStore implements IndexStore {
  private readonly store: VaultStore;
  private readonly files: IndexFiles;

  constructor(store: VaultStore, path: string = indexPath()) {
    this.store = store;
    this.files = indexFiles(path);
  }

  async load(): Promise<StoredIndex | null> {
    const manifest = parseJson(await this.store.readText(this.files.manifest));
    if (!isRecord(manifest) || manifest['schema'] !== INDEX_SCHEMA_VERSION) return null;

    const listed: ManifestDoc[] = [];
    for (const entry of asArray<unknown>(manifest['docs'])) {
      const doc = reviveManifestDoc(entry);
      if (doc === null) return null;
      listed.push(doc);
    }

    const buckets = new Map<string, Map<string, BodyEntry> | null>();
    for (const bucket of groupByBucket(listed).keys()) {
      const raw = await this.store.readText(indexBucketPath(this.files, bucket));
      buckets.set(bucket, reviveBucket(parseJson(raw)));
    }

    const docs: IndexedDoc[] = [];
    let partial = false;
    for (const doc of listed) {
      const entry = buckets.get(bodyBucket(doc.path))?.get(doc.path);
      // Missing bucket, missing entry or another hash: the body is not the one the
      // manifest describes. Dropping the document costs one read; trusting it
      // would answer from a stale body.
      if (entry === undefined || entry.hash !== doc.hash) {
        partial = true;
        continue;
      }
      docs.push({
        ...doc,
        body: entry.body,
        text: entry.body.toLowerCase(),
        passages: splitPassages(entry.body, doc.bodyLine),
      });
    }

    const index: VaultIndex = {
      docs,
      todos: asArray<Todo>(manifest['todos']),
      projects: asArray<Project>(manifest['projects']),
      areas: asArray<Area>(manifest['areas']),
      pages: asArray<WikiPage>(manifest['pages']),
      sources: asArray<RawSource>(manifest['sources']),
      counts: reviveCounts(manifest['counts']),
      brokenLinks: asArray<BrokenLink>(manifest['brokenLinks']),
      builtAt: typeof manifest['builtAt'] === 'string' ? manifest['builtAt'] : '',
      durationMs: typeof manifest['durationMs'] === 'number' ? manifest['durationMs'] : 0,
      byPath: new Map(docs.map((doc) => [doc.path, doc])),
    };
    const { search, covers } = reviveSearch(
      parseJson(await this.store.readText(this.files.search)),
    );
    return { index, search, covers, partial, derivedFor: reviveDerivedFor(manifest['derivedFor']) };
  }

  async save(
    index: VaultIndex,
    touched: readonly string[] | 'all',
    derivedFor?: IndexDerivedFor,
  ): Promise<void> {
    const grouped = groupByBucket(index.docs);
    const buckets = await this.bucketsToWrite(grouped, touched);
    // Every bucket is on disk before the manifest is written: should this stop
    // halfway, the old manifest still stands and every rewritten entry it disagrees
    // with fails the hash check on load instead of being trusted. Batches keep a
    // full save fast without opening hundreds of files at once.
    const order = [...buckets].sort();
    for (let start = 0; start < order.length; start += BUCKET_WRITE_BATCH) {
      const batch = order.slice(start, start + BUCKET_WRITE_BATCH);
      await Promise.all(batch.map((bucket) => this.writeBucket(bucket, grouped.get(bucket))));
    }
    await this.store.writeText(this.files.manifest, toJson(toManifest(index, derivedFor ?? null)));
  }

  async saveSearch(state: SerializedSearch, covers: ReadonlyMap<string, string>): Promise<void> {
    await this.store.writeText(
      this.files.search,
      toJson({ schema: INDEX_SCHEMA_VERSION, covers: [...covers], state }),
    );
  }

  /**
   * Index verwerfen. Statt die Datei in den Papierkorb zu verschieben — dort gehoert
   * Nutzerinhalt hin, nicht Abgeleitetes — wird das Manifest neutralisiert. Buckets
   * und Suchdatei ohne Manifest werden nie gelesen.
   */
  async clear(): Promise<void> {
    if (!(await this.store.exists(this.files.manifest))) return;
    await this.store.writeText(this.files.manifest, CLEARED);
  }

  private async writeBucket(bucket: string, docs: readonly IndexedDoc[] = []): Promise<void> {
    const entries: BodyEntry[] = docs.map(({ path, hash, body }) => ({ path, hash, body }));
    await this.store.writeText(
      indexBucketPath(this.files, bucket),
      toJson({ schema: INDEX_SCHEMA_VERSION, entries }),
    );
  }

  /**
   * The buckets of the touched paths. For `'all'` that is every bucket holding a
   * document plus every bucket file already on disk — one that no longer holds any
   * document would otherwise keep the bodies of deleted files around.
   */
  private async bucketsToWrite(
    grouped: ReadonlyMap<string, unknown>,
    touched: readonly string[] | 'all',
  ): Promise<Set<string>> {
    if (touched !== 'all') return new Set(touched.map(bodyBucket));
    const buckets = new Set(grouped.keys());
    if (await this.store.exists(this.files.bodiesDir)) {
      const existing = await this.store.list({
        dir: this.files.bodiesDir,
        includeInternal: true,
        recursive: false,
      });
      for (const path of existing) {
        const match = BUCKET_NAME.exec(baseName(path));
        if (match?.[1] !== undefined) buckets.add(match[1]);
      }
    }
    return buckets;
  }
}
