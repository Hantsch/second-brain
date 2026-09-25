/**
 * Den Index aus den Dateien bauen. Der Index ist abgeleitet — dieser Lauf ist die
 * einzige Wahrheit darueber, was im Vault steht.
 *
 * **Inkrementell:** Wer einen vorhandenen Index mitgibt, bekommt nur die geaenderten
 * Dateien neu gelesen. Erkannt wird das an mtime und Groesse aus dem Verzeichnis;
 * erst wenn die abweichen, wird die Datei geoeffnet und ihr Hash verglichen. Bleibt
 * der Hash gleich (Datei nur angefasst), bleibt die Ableitung stehen.
 *
 * Die Ableitungen (Todos, Projekte, Seiten) laufen bei jedem Lauf frisch ueber die
 * Rumpftexte im Speicher — ohne Dateizugriff. Damit stimmen Fristen und Graph immer
 * zum uebergebenen „heute", auch fuer Dokumente, die nicht neu gelesen wurden.
 */

import { ALL_DOC_TYPES } from '@shared/types';
import type { DocType, RawSource, Todo } from '@shared/types';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { titleFor, wordCount } from '@core/vault/doc';
import { baseName, dirName, extName, isInside } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import type { VaultStat, VaultStore } from '@core/vault/types';
import { deriveAreas } from './areas';
import { derivePages, deriveSources, moduleOfPath } from './pages';
import type { IngestEntry } from './pages';
import { deriveProjects, projectTitles } from './projects';
import {
  applyProjectTitles,
  parseTodos,
  projectOfPath,
  refreshDueInDays,
  scopeHint,
} from './todos';
import { asStringList, asText } from './text';
import { YIELD_EVERY, yieldToEventLoop } from './yield';
import type {
  ExternalTouches,
  IndexProgress,
  IndexedDoc,
  ModulePageCounts,
  VaultIndex,
} from './types';

const DOC_TYPES = new Set<string>(ALL_DOC_TYPES);

/**
 * Protokoll einer Rohquelle. Zwei Varianten stehen in docs/VAULT-FORMAT.md:
 * `<ordner>/.ingest.json` (der Ordner ist die Quelle) und
 * `<datum>-<slug>.ingest.json` als Geschwisterdatei (der Stamm ist die Quelle).
 */
const INGEST_SUFFIX = '.ingest.json';

/** Hoechstzahl an Fortschrittsmeldungen eines Laufs — der Renderer braucht keine 5000. */
const PROGRESS_STEPS = 50;

/**
 * Groessengrenze fuer gelesene Dateien. Darueber liegende Dateien werden nie
 * geoeffnet, nur als Stub mit Namen gefuehrt — ein einzelnes pathologisch grosses
 * Dokument soll weder den Speicher noch die Suche eines ganzen Laufs sprengen.
 */
export const MAX_INDEXED_BYTES = 2 * 1024 * 1024;

/**
 * So viele Dateien werden gleichzeitig gelesen. Ein Vault auf einem USB-Stick lebt
 * von parallelen Zugriffen; unbegrenzt viele wuerden dagegen die Handles sprengen.
 */
const READ_BATCH = 24;

export interface DerivationOptions {
  /** Das „jetzt" fuer Fristen und Stagnation. */
  now?: DateLike;
  staleAfterDays?: number;
  externalTouches?: ExternalTouches;
  /** Rohquellen; sie kommen aus dem Verzeichnislauf, nicht aus den Dokumenten. */
  sources?: RawSource[];
  builtAt?: string;
  durationMs?: number;
}

export interface BuildOptions extends DerivationOptions {
  /** Vorhandener Index. Unveraenderte Dateien werden daraus uebernommen. */
  previous?: VaultIndex | null;
  onProgress?: IndexProgress;
  /** Wer den Event-Loop zwischendurch bedienen will — Tests zaehlen die Aufrufe. */
  yieldControl?: () => Promise<void>;
}

/** Dokumenttyp aus dem Pfad, wenn das Frontmatter keinen nennt. */
export function docTypeFromPath(path: string): DocType {
  if (isInside('inbox', path)) return 'dump';
  if (isInside('journal', path)) return 'journal';
  if (/^projects\/[^/]+\/[^/]+\/condensed\.md$/.test(path)) return 'condensed';
  if (/^projects\/[^/]+\/[^/]+\/project\.md$/.test(path)) return 'project';
  if (/^areas\/[^/]+\.condensed\.md$/.test(path)) return 'condensed';
  if (isInside('areas', path)) return 'area';
  const wiki = /^modules\/[^/]+\/wiki\/(sources|entities|concepts)\//.exec(path);
  if (wiki !== null) {
    if (wiki[1] === 'sources') return 'source';
    return wiki[1] === 'entities' ? 'entity' : 'concept';
  }
  if (/^modules\/[^/]+\/wiki\/overview\.md$/.test(path)) return 'overview';
  return 'note';
}

function docTypeOf(path: string, frontmatter: Record<string, unknown>): DocType {
  const declared = frontmatter['type'];
  if (typeof declared === 'string' && DOC_TYPES.has(declared)) return declared as DocType;
  return docTypeFromPath(path);
}

/** Zeilennummer der ersten Rumpfzeile: so viele Zeilen, wie das Frontmatter belegt. */
function bodyLineOf(content: string, body: string): number {
  const prefixLength = content.length - body.length;
  if (prefixLength <= 0) return 1;
  let line = 1;
  for (let index = 0; index < prefixLength; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

/** Rohtext einer Datei zu einem indizierten Dokument machen. */
export function toIndexedDoc(path: string, content: string, stat: VaultStat): IndexedDoc {
  const parsed = parse(content);
  const frontmatter = parsed.frontmatter;
  return {
    path,
    docType: docTypeOf(path, frontmatter),
    title: titleFor(path, frontmatter),
    tags: asStringList(frontmatter['tags']),
    lang: asText(frontmatter['lang']),
    updated: stat.modified,
    hash: sha256(content),
    size: stat.size,
    body: parsed.body,
    text: parsed.body.toLowerCase(),
    words: wordCount(parsed.body),
    bodyLine: bodyLineOf(content, parsed.body),
    frontmatter,
    module: moduleOfPath(path),
    scope: scopeHint(path, frontmatter),
    project: projectOfPath(path),
  };
}

/**
 * Stub fuer eine Datei jenseits von `MAX_INDEXED_BYTES`: nie gelesen, deshalb ohne
 * Rumpf, Todos oder Suchtext — nur ueber den Titel aus dem Pfad auffindbar.
 */
function oversizedDoc(stat: VaultStat): IndexedDoc {
  return {
    path: stat.path,
    docType: docTypeFromPath(stat.path),
    title: titleFor(stat.path, {}),
    tags: [],
    lang: null,
    updated: stat.modified,
    hash: '',
    size: stat.size,
    body: '',
    text: '',
    words: 0,
    bodyLine: 1,
    frontmatter: {},
    module: moduleOfPath(stat.path),
    scope: scopeHint(stat.path, {}),
    project: projectOfPath(stat.path),
    oversized: true,
  };
}

/**
 * Alle Ableitungen aus den Dokumenten — ohne Dateizugriff, damit sie einzeln
 * testbar bleiben und ein Neuaufbau nichts zweimal liest.
 */
export function deriveIndex(docs: IndexedDoc[], options: DerivationOptions = {}): VaultIndex {
  const now = options.now ?? new Date();
  /* A condensed artifact (story 044/037) is machine-owned prose, not a place a
     human writes todos — and, since a project's `condensed.md` sits inside
     `projects/<scope>/<slug>/`, `projectOfPath()` would otherwise attach any
     "- [ ]"-looking line the model writes (e.g. quoting an existing todo as
     evidence) to that project's own open-todo count, a duplicate the run's own
     input selector already refuses to read back (`inputs-project.ts`). */
  const todos = docs
    .filter((doc) => doc.docType !== 'condensed')
    .flatMap((doc) => todosOf(doc, now));
  return aggregateIndex(docs, todos, now, options);
}

/** Todos einer Datei, mit dem gemeinsamen Vokabular aus `parseTodos`. */
function todosOf(doc: IndexedDoc, today: DateLike): Todo[] {
  return parseTodos(doc.body, {
    path: doc.path,
    frontmatter: doc.frontmatter,
    lineOffset: doc.bodyLine,
    today,
  });
}

export interface IncrementalDerivationOptions extends DerivationOptions {
  /** Wer den Event-Loop zwischendurch bedienen will — Tests zaehlen die Aufrufe. */
  yieldControl?: () => Promise<void>;
}

/**
 * Dieselbe Ableitung wie `deriveIndex`, aber inkrementell und dem Event-Loop
 * gegenueber hoeflich: Todos eines Dokuments, dessen Hash sich gegenueber `previous`
 * nicht geaendert hat, werden aus dem alten Index uebernommen statt neu geparst —
 * nur ihre Fristen ziehen am Ende auf das uebergebene „heute" nach, damit auch
 * unveraenderte Dokumente korrekte `dueInDays` zeigen. Zwischen Haeppchen von
 * `YIELD_EVERY` Dokumenten gibt der Lauf den Event-Loop einmal frei, damit ein
 * grosser Vault die Shell nicht fuer die ganze Laufzeit einfriert.
 */
export async function deriveIndexIncremental(
  docs: IndexedDoc[],
  previous: VaultIndex | null,
  options: IncrementalDerivationOptions = {},
): Promise<VaultIndex> {
  const now = options.now ?? new Date();
  const yieldControl = options.yieldControl ?? yieldToEventLoop;
  const previousTodosByPath = new Map<string, Todo[]>();
  for (const todo of previous?.todos ?? []) {
    const list = previousTodosByPath.get(todo.path);
    if (list === undefined) previousTodosByPath.set(todo.path, [todo]);
    else list.push(todo);
  }

  const todos: Todo[] = [];
  let sinceYield = 0;
  for (const doc of docs) {
    if (doc.docType !== 'condensed') {
      const known = previous?.byPath.get(doc.path);
      if (known !== undefined && known.hash === doc.hash) {
        for (const todo of previousTodosByPath.get(doc.path) ?? []) todos.push({ ...todo });
      } else {
        todos.push(...todosOf(doc, now));
      }
    }
    sinceYield += 1;
    if (sinceYield >= YIELD_EVERY) {
      sinceYield = 0;
      await yieldControl();
    }
  }
  refreshDueInDays(todos, now);

  return aggregateIndex(docs, todos, now, options);
}

/**
 * Alles, was aus Dokumenten und ihren Todos folgt — Projekte, Bereiche, der
 * Wiki-Graph. Eine Stelle fuer beide Ableitungswege (`deriveIndex` und
 * `deriveIndexIncremental`), damit sie nie auseinanderlaufen.
 */
function aggregateIndex(
  docs: IndexedDoc[],
  todos: Todo[],
  now: DateLike,
  options: DerivationOptions,
): VaultIndex {
  const projects = deriveProjects(docs, todos, {
    now,
    staleAfterDays: options.staleAfterDays,
    externalTouches: options.externalTouches,
  });
  applyProjectTitles(todos, projectTitles(projects));
  const graph = derivePages(docs);

  return {
    docs,
    todos,
    projects,
    areas: deriveAreas(docs, todos),
    pages: graph.pages,
    sources: options.sources ?? [],
    counts: withModuleCounts(docs, graph.counts),
    brokenLinks: graph.brokenLinks,
    builtAt: options.builtAt ?? new Date().toISOString(),
    durationMs: options.durationMs ?? 0,
    byPath: new Map(docs.map((doc) => [doc.path, doc])),
  };
}

/** Auch Module ohne Seiten sollen in den Zaehlungen auftauchen. */
function withModuleCounts(
  docs: readonly IndexedDoc[],
  counts: Map<string, ModulePageCounts>,
): Map<string, ModulePageCounts> {
  for (const doc of docs) {
    if (doc.module === null || counts.has(doc.module)) continue;
    counts.set(doc.module, { sources: 0, entities: 0, concepts: 0 });
  }
  return counts;
}

/** Eine gefundene Rohquelle samt dem Ort ihres Protokolls. */
export interface IngestScan extends IngestEntry {
  /** Pfad der `.ingest.json` selbst — bei beiden Varianten ein anderer. */
  protocol: string;
}

/**
 * Rohquellen einsammeln: Groessen und juengste Aenderung je Quelle.
 *
 * Beide in VAULT-FORMAT.md dokumentierten Varianten zaehlen. Wer nur die
 * Ordner-Variante erkennt, unterschlaegt genau die Quellen, die als
 * Geschwisterdatei neben ihrem Markdown liegen — und meldet dem Nutzer eine
 * Zahl ueber seinen Vault, die kleiner ist als der Vault.
 */
export function collectIngest(files: readonly VaultStat[]): Map<string, IngestScan> {
  const entries = new Map<string, IngestScan>();
  const siblings: IngestScan[] = [];
  for (const file of files) {
    const name = baseName(file.path);
    if (!name.endsWith(INGEST_SUFFIX)) continue;
    const wholeFolder = name === INGEST_SUFFIX;
    const dir = dirName(file.path);
    const stem = name.slice(0, name.length - INGEST_SUFFIX.length);
    const path = wholeFolder ? dir : dir.length > 0 ? `${dir}/${stem}` : stem;
    if (path.length === 0) continue;
    const entry: IngestScan = {
      path,
      protocol: file.path,
      json: null,
      bytes: 0,
      modified: file.modified,
    };
    entries.set(path, entry);
    if (!wholeFolder) siblings.push(entry);
  }
  if (entries.size === 0) return entries;
  for (const file of files) {
    if (!isInside('raw', file.path)) continue;
    const entry = siblingOf(siblings, file.path) ?? folderOf(entries, file.path);
    if (entry === undefined) continue;
    entry.bytes += file.size;
    if (file.modified > entry.modified) entry.modified = file.modified;
  }
  return entries;
}

/** Gehoert die Datei zum Stamm einer Geschwister-Quelle (`<stamm>.md`, `<stamm>.ingest.json`)? */
function siblingOf(siblings: readonly IngestScan[], path: string): IngestScan | undefined {
  return siblings.find((entry) => path.startsWith(`${entry.path}.`));
}

/** Liegt die Datei in einem Quellen-Ordner? Der naechstgelegene gewinnt. */
function folderOf(entries: Map<string, IngestScan>, path: string): IngestScan | undefined {
  for (let dir = dirName(path); dir.length > 0; dir = dirName(dir)) {
    const entry = entries.get(dir);
    if (entry !== undefined) return entry;
  }
  return undefined;
}

/** What a tree walk finds, before any derivation runs over it. */
export interface ScanResult {
  docs: IndexedDoc[];
  sources: RawSource[];
}

/**
 * Den Vault durchlaufen: stat alles, lies nur, was sich gegenueber `previous`
 * geaendert hat. Reine Sammlung — keine Ableitung, damit ein Aufrufer, der nur
 * wissen will *ob* sich etwas geaendert hat, dafuer nicht auch die teuren
 * Ableitungen (Projekte, Seiten, Todos) mitbezahlt.
 */
export async function scanVault(
  store: VaultStore,
  options: BuildOptions = {},
): Promise<ScanResult> {
  const previous = options.previous ?? null;
  const files: VaultStat[] = [];
  for await (const entry of store.walk()) files.push(entry);

  const markdown = files.filter((file) => extName(file.path) === '.md');
  const total = markdown.length;
  const step = Math.max(1, Math.ceil(total / PROGRESS_STEPS));
  options.onProgress?.(0, total);

  const docs: IndexedDoc[] = [];
  let done = 0;
  let reported = 0;
  for (let start = 0; start < total; start += READ_BATCH) {
    const batch = markdown.slice(start, start + READ_BATCH);
    const read = await Promise.all(batch.map((file) => indexOne(store, file, previous)));
    for (const doc of read) if (doc !== null) docs.push(doc);
    done += batch.length;
    if (done - reported >= step || done === total) {
      reported = done;
      options.onProgress?.(done, total);
    }
  }

  const ingest = collectIngest(files);
  await Promise.all(
    [...ingest.values()].map(async (entry) => {
      entry.json = await store.readText(entry.protocol);
    }),
  );

  return { docs, sources: deriveSources([...ingest.values()]) };
}

/**
 * Den Vault durchlaufen und den Index bauen. `.secondbrain/` bleibt aussen vor,
 * Binaerdateien unter `raw/` ebenso — indiziert wird, was Markdown ist.
 */
export async function buildIndex(
  store: VaultStore,
  options: BuildOptions = {},
): Promise<VaultIndex> {
  const startedAt = Date.now();
  const { docs, sources } = await scanVault(store, options);
  return deriveIndexIncremental(docs, options.previous ?? null, {
    ...options,
    sources,
    builtAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  });
}

/**
 * Ein Dokument holen — aus dem alten Index, wenn die Datei unberuehrt ist.
 * `null`, wenn die Datei zwischen Verzeichnislauf und Lesen verschwunden ist.
 */
export async function indexOne(
  store: VaultStore,
  file: VaultStat,
  previous: VaultIndex | null,
): Promise<IndexedDoc | null> {
  const known = previous?.byPath.get(file.path);
  if (known !== undefined && known.updated === file.modified && known.size === file.size) {
    return known;
  }
  if (file.size > MAX_INDEXED_BYTES) return oversizedDoc(file);
  const content = await store.readText(file.path);
  if (content === null) return null;
  if (known !== undefined && known.hash === sha256(content)) {
    // Nur angefasst, nicht geaendert: Ableitung behalten, Zeitstempel nachziehen.
    return { ...known, updated: file.modified, size: file.size };
  }
  return toIndexedDoc(file.path, content, file);
}
