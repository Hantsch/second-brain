/**
 * Der Index auf der Platte: `.secondbrain/index/index.json`, geschrieben ueber den
 * `VaultStore` und damit atomar (tmp + rename).
 *
 * Der Index ist **abgeleitet**. Deshalb gilt hier durchgehend: im Zweifel `null`
 * zurueckgeben und neu bauen. Eine unlesbare, halb geschriebene oder aeltere Datei
 * ist kein Fehlerfall, den der Nutzer sehen muesste — sie kostet einen Neuaufbau.
 *
 * Mitgespeichert wird der MiniSearch-Zustand: ohne ihn muesste jeder Start den
 * ganzen Vault neu tokenisieren.
 */

import type { Project, RawSource, Todo, WikiPage } from '@shared/types';
import { indexPath } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import type {
  BrokenLink,
  IndexStore,
  IndexedDoc,
  ModulePageCounts,
  SerializedSearch,
  StoredIndex,
  VaultIndex,
} from './types';

/** Erhoehen, sobald sich die Form aendert. Aeltere Dateien werden verworfen. */
export const INDEX_SCHEMA_VERSION = 1;

/** Neutraler Inhalt fuer `clear()`: wird beim Laden als „nichts da" gedeutet. */
const CLEARED = '{"schema":0}\n';

/** Gespeicherte Form eines Dokuments — `text` faellt weg, es folgt aus `body`. */
type PersistedDoc = Omit<IndexedDoc, 'text'>;

interface PersistedIndex {
  schema: number;
  builtAt: string;
  durationMs: number;
  docs: PersistedDoc[];
  todos: Todo[];
  projects: Project[];
  pages: WikiPage[];
  sources: RawSource[];
  counts: [string, ModulePageCounts][];
  brokenLinks: BrokenLink[];
  search: SerializedSearch | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Ein gespeichertes Dokument zuruecklesen. `null` heisst: Datei nicht vertrauenswuerdig. */
function reviveDoc(value: unknown): IndexedDoc | null {
  if (!isRecord(value)) return null;
  const path = value['path'];
  const body = value['body'];
  if (typeof path !== 'string' || typeof body !== 'string') return null;
  const doc = value as unknown as PersistedDoc;
  return { ...doc, text: body.toLowerCase() };
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

function toPersisted(index: VaultIndex, search: SerializedSearch | null): PersistedIndex {
  return {
    schema: INDEX_SCHEMA_VERSION,
    builtAt: index.builtAt,
    durationMs: index.durationMs,
    docs: index.docs.map(({ text: _text, ...rest }) => rest),
    todos: index.todos,
    projects: index.projects,
    pages: index.pages,
    sources: index.sources,
    counts: [...index.counts],
    brokenLinks: index.brokenLinks,
    search,
  };
}

/**
 * Ablage des Index im Vault. Wer `null` bekommt, baut neu — jede andere Reaktion
 * waere ein Fehler, den es nicht braucht.
 */
export class VaultIndexStore implements IndexStore {
  private readonly store: VaultStore;
  private readonly path: string;

  constructor(store: VaultStore, path: string = indexPath()) {
    this.store = store;
    this.path = path;
  }

  async load(): Promise<StoredIndex | null> {
    const raw = await this.store.readText(this.path);
    if (raw === null || raw.trim().length === 0) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Halb geschriebene oder von Hand verhunzte Datei: neu bauen.
      return null;
    }
    if (!isRecord(parsed) || parsed['schema'] !== INDEX_SCHEMA_VERSION) return null;

    const docs: IndexedDoc[] = [];
    for (const entry of asArray<unknown>(parsed['docs'])) {
      const doc = reviveDoc(entry);
      if (doc === null) return null;
      docs.push(doc);
    }

    const index: VaultIndex = {
      docs,
      todos: asArray<Todo>(parsed['todos']),
      projects: asArray<Project>(parsed['projects']),
      pages: asArray<WikiPage>(parsed['pages']),
      sources: asArray<RawSource>(parsed['sources']),
      counts: reviveCounts(parsed['counts']),
      brokenLinks: asArray<BrokenLink>(parsed['brokenLinks']),
      builtAt: typeof parsed['builtAt'] === 'string' ? parsed['builtAt'] : '',
      durationMs: typeof parsed['durationMs'] === 'number' ? parsed['durationMs'] : 0,
      byPath: new Map(docs.map((doc) => [doc.path, doc])),
    };
    const search = isRecord(parsed['search']) ? (parsed['search'] as SerializedSearch) : null;
    return { index, search };
  }

  async save(index: VaultIndex, search: SerializedSearch | null = null): Promise<void> {
    await this.store.writeText(this.path, `${JSON.stringify(toPersisted(index, search))}\n`);
  }

  /**
   * Index verwerfen. Statt die Datei in den Papierkorb zu verschieben — dort gehoert
   * Nutzerinhalt hin, nicht Abgeleitetes — wird sie neutralisiert.
   */
  async clear(): Promise<void> {
    if (!(await this.store.exists(this.path))) return;
    await this.store.writeText(this.path, CLEARED);
  }
}
