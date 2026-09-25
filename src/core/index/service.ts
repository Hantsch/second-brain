/**
 * Der Index als Dienst: aufbauen, laden, suchen, nachziehen.
 *
 * Diese Datei ist die eine Stelle, an der Aufbau (`build`), Suche (`search`) und
 * Ablage (`persist`) zusammenkommen. Alles andere im Modul bleibt frei von
 * Zustand und damit einzeln testbar.
 *
 * Die Form passt auf `IndexLike` in `src/main/contracts.ts` — die Shell haengt den
 * Dienst dort ein, ohne eine Klasse aus dem Kern zu kennen.
 */

import type {
  Area,
  DumpItem,
  JournalDay,
  KnowledgeModule,
  Project,
  RawSource,
  SearchHit,
  SearchQuery,
  Todo,
  WikiPage,
} from '@shared/types';
import type { IndexStats } from '@shared/ipc';
import { extName, isoDay } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import { buildIndex, deriveIndexIncremental, scanVault } from './build';
import { deriveDumps } from './dumps';
import { deriveJournalDays } from './journal';
import { deriveModules } from './modules';
import { VaultIndexStore } from './persist';
import { refreshPaths } from './refresh';
import { SearchEngine } from './search';
import { indexStats } from './stats';
import { DEFAULT_STALE_AFTER_DAYS, emptyIndex } from './types';
import type {
  ExternalTouches,
  IndexDerivedFor,
  IndexProgress,
  IndexStore,
  StoredIndex,
  VaultIndex,
} from './types';
import { YIELD_EVERY, yieldToEventLoop } from './yield';

/** How long a deferred search-file save waits before it actually writes. */
const DEFAULT_SEARCH_PERSIST_DELAY_MS = 30_000;

/** Does the stored search state cover exactly these documents at these hashes? */
function coversExactly(covers: ReadonlyMap<string, string>, index: VaultIndex): boolean {
  if (covers.size !== index.docs.length) return false;
  return index.docs.every((doc) => covers.get(doc.path) === doc.hash);
}

/**
 * Erkennt, ob ein Lauf tatsaechlich etwas geaendert hat — Dokumente oder Quellen.
 * Nur dann lohnt sich, die abgeleiteten Listen (`derived()`) wegzuwerfen; ein
 * Lauf, der nichts Neues findet (z. B. eine nur angefasste Datei), soll die
 * Zwischenspeicher der teuren Ableitungen nicht unnoetig verwerfen.
 */
function indexChanged(previous: VaultIndex | null, next: VaultIndex): boolean {
  if (previous === null) return true;
  if (previous.docs.length !== next.docs.length) return true;
  if (JSON.stringify(previous.sources) !== JSON.stringify(next.sources)) return true;
  for (const doc of next.docs) {
    const before = previous.byPath.get(doc.path);
    if (before === undefined || before.hash !== doc.hash) return true;
  }
  return false;
}

/**
 * Which of `docs` (a fresh scan) differ from `previous` — added, removed or a
 * new hash. Used at startup to decide whether a re-derive is worth its cost
 * *before* paying for it, and to hand `IndexStore.save()` a precise `touched`
 * list instead of `'all'`.
 */
function changedPaths(
  previous: VaultIndex,
  docs: readonly { path: string; hash: string }[],
): string[] {
  const changed: string[] = [];
  const docPaths = new Set<string>();
  for (const doc of docs) {
    docPaths.add(doc.path);
    const before = previous.byPath.get(doc.path);
    if (before === undefined || before.hash !== doc.hash) changed.push(doc.path);
  }
  for (const path of previous.byPath.keys()) {
    if (!docPaths.has(path)) changed.push(path);
  }
  return changed;
}

/** Memoisierter Wert von `derived()`, gebunden an die Generation, in der er entstand. */
interface DerivedEntry<T> {
  generation: number;
  value: T;
}

/** Dateien, die den Index beruehren. Alles andere kann der Watcher fuer sich behalten. */
const RELEVANT_EXTENSIONS = new Set(['.md', '.json']);

/**
 * Ueber so vielen Pfaden lohnt sich das gezielte Nachziehen nicht mehr — dann
 * ist der volle Baumlauf verlaesslicher (und nicht langsamer) als 257 einzelne
 * `stat`-Aufrufe.
 */
const MAX_SCOPED_PATHS = 256;

/**
 * Ist der Pfad fuer den Index relevant? '.md' und '.json' wie bisher, dazu
 * Pfade ohne Endung — sie koennten ein Ordner sein (Umbenennung, Loeschung),
 * was `refreshPaths` gezielt erkennt.
 */
function isRelevantPath(path: string): boolean {
  const ext = extName(path);
  return ext === '' || RELEVANT_EXTENSIONS.has(ext);
}

export interface IndexServiceOptions {
  /** Uhr des Dienstes. Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: () => Date;
  /** Schwelle fuer stagnierende Projekte; kommt aus den Vault-Einstellungen. */
  staleAfterDays?: number;
  /** Arbeitsspuren von aussen (Claude-Sessions), Projekt-Slug → Zeitpunkt. */
  externalTouches?: ExternalTouches;
  /** Ablage. `null` heisst: der Index lebt nur im Speicher (Tests, Vorschau). */
  persistence?: IndexStore | null;
  /** Wer den Event-Loop zwischendurch bedienen will — Tests zaehlen die Aufrufe. */
  yieldControl?: () => Promise<void>;
  /**
   * Wartezeit, bevor eine durch einen gezielten Refresh faellige Suchdatei
   * tatsaechlich geschrieben wird (ms). Mehrere schnelle Aenderungen teilen
   * sich so einen Schreibvorgang statt jede ihren eigenen.
   */
  searchPersistDelayMs?: number;
}

export class IndexService {
  private readonly store: VaultStore;
  private readonly options: IndexServiceOptions;
  private readonly persistence: IndexStore | null;
  private current: VaultIndex;
  private engine: SearchEngine;
  private tail: Promise<unknown> = Promise.resolve();
  private derivedGeneration = 0;
  private derivedCache = new Map<string, DerivedEntry<unknown>>();
  private pendingSearchSave: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    store: VaultStore,
    options: IndexServiceOptions,
    index: VaultIndex,
    engine: SearchEngine,
  ) {
    this.store = store;
    this.options = options;
    this.persistence =
      options.persistence === undefined ? new VaultIndexStore(store) : options.persistence;
    this.current = index;
    this.engine = engine;
  }

  /**
   * Index oeffnen: gespeicherten Zustand laden, dann inkrementell nachziehen.
   * Ein unlesbarer oder veralteter Zustand kostet einen Neuaufbau — nichts weiter.
   */
  static async open(store: VaultStore, options: IndexServiceOptions = {}): Promise<IndexService> {
    const service = new IndexService(store, options, emptyIndex(''), SearchEngine.create());
    const persistence = service.persistence;
    const stored = persistence === null ? null : await persistence.load();
    if (stored === null) {
      await service.update(null);
      return service;
    }
    service.current = stored.index;
    const searchStale = await service.restoreEngine(stored);
    await service.openUpdate(stored, searchStale);
    return service;
  }

  /** Der aktuelle Index. Dieselben Objekte, keine Kopie — nicht veraendern. */
  index(): VaultIndex {
    return this.current;
  }

  stats(): IndexStats {
    return indexStats(this.current.builtAt.length === 0 ? null : this.current);
  }

  search(query: SearchQuery): SearchHit[] {
    return this.engine.search(query, this.current.byPath);
  }

  // ── Abgeleitete Listen ────────────────────────────────────────────────────
  // Dieselben Objekte wie im Index, keine Kopien — Aufrufer veraendern sie nicht.

  projects(): readonly Project[] {
    return this.current.projects;
  }

  todos(): readonly Todo[] {
    return this.current.todos;
  }

  areas(): readonly Area[] {
    return this.current.areas;
  }

  pages(): readonly WikiPage[] {
    return this.current.pages;
  }

  sources(): readonly RawSource[] {
    return this.current.sources;
  }

  dumps(): readonly DumpItem[] {
    return this.derived('dumps', (index) => deriveDumps(index.docs, { now: this.now() }));
  }

  journal(): readonly JournalDay[] {
    return this.derived('journal', (index) => deriveJournalDays(index.docs));
  }

  modules(): readonly KnowledgeModule[] {
    return this.derived('modules', (index) =>
      deriveModules(index.docs, { counts: index.counts, sources: index.sources }),
    );
  }

  /**
   * Die Generation des aktuellen Index: steigt genau dann, wenn ein Lauf Dokumente
   * oder Quellen geaendert hat (`indexChanged`) — nicht bei jedem Lauf, der nichts
   * Neues findet.
   */
  generation(): number {
    return this.derivedGeneration;
  }

  /**
   * Eine Ableitung, die teuer genug ist, um sie nicht bei jedem Aufruf neu zu
   * rechnen — aber billig genug, um sie im Speicher zu halten statt in der
   * Ablage. Memoisiert je Generation: aendert sich nichts am Index, bleibt der
   * zuletzt berechnete Wert stehen.
   */
  private derived<T>(key: string, compute: (index: VaultIndex) => T): T {
    const cached = this.derivedCache.get(key);
    if (cached !== undefined && cached.generation === this.derivedGeneration) {
      return cached.value as T;
    }
    const value = compute(this.current);
    this.derivedCache.set(key, { generation: this.derivedGeneration, value });
    return value;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Vollstaendiger Neuaufbau: alles lesen, Suchindex neu, Ablage neu. */
  async rebuild(onProgress?: IndexProgress): Promise<IndexStats> {
    await this.serialize(async () => {
      await this.update(null, onProgress);
    });
    return this.stats();
  }

  /**
   * Nach Aenderungen nachziehen. Ohne Pfade — oder mit mehr als
   * `MAX_SCOPED_PATHS` — laeuft der volle Baumlauf, der auch Umbenennungen und
   * Loeschungen jenseits der gemeldeten Pfade findet. Mit ein paar Pfaden wird
   * gezielt nachgezogen: nur diese Pfade werden gestattet und gelesen. Beruehrt
   * keine der Pfade eine indizierte Dateiart, bleibt alles, wie es ist.
   */
  async refresh(paths?: readonly string[]): Promise<void> {
    if (paths === undefined) {
      await this.serialize(async () => this.update(this.current));
      return;
    }
    if (!paths.some(isRelevantPath)) return;
    if (paths.length > MAX_SCOPED_PATHS) {
      await this.serialize(async () => this.update(this.current));
      return;
    }
    await this.serialize(async () => this.updateScoped(paths));
  }

  /** Voller Lauf: ganzer Baum, Suchindex nachziehen, Ablage komplett neu. */
  private async update(previous: VaultIndex | null, onProgress?: IndexProgress): Promise<void> {
    const now = this.options.now?.() ?? new Date();
    const next = await buildIndex(this.store, {
      previous,
      onProgress,
      now,
      staleAfterDays: this.options.staleAfterDays,
      externalTouches: this.options.externalTouches,
      yieldControl: this.options.yieldControl,
    });
    await this.applyToEngine(previous, next);
    this.current = next;
    if (indexChanged(previous, next)) this.derivedGeneration += 1;
    if (this.persistence !== null) {
      await this.persistence.save(next, 'all', {
        day: isoDay(now),
        staleAfterDays: this.options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS,
      });
      this.cancelPendingSearchSave();
      await this.saveSearchNow(next);
    }
  }

  /**
   * Gezielter Lauf: nur die gemeldeten Pfade werden gestattet und gelesen.
   * Stimmen alle Hashes noch, aendert sich nichts — keine Ableitung, keine
   * Ablage, keine neue Generation. Die Suchdatei wird nicht sofort
   * geschrieben, sondern gesammelt nachgezogen (`scheduleSearchSave`).
   */
  private async updateScoped(paths: readonly string[]): Promise<void> {
    const previous = this.current;
    const found = await refreshPaths(this.store, paths, previous);
    if (!found.changed) return;

    const now = this.options.now?.() ?? new Date();
    const next = await deriveIndexIncremental(found.docs, previous, {
      now,
      staleAfterDays: this.options.staleAfterDays,
      externalTouches: this.options.externalTouches,
      sources: found.sources ?? previous.sources,
      builtAt: new Date().toISOString(),
      durationMs: 0,
      yieldControl: this.options.yieldControl,
    });
    await this.applyToEngine(previous, next);
    this.current = next;
    if (indexChanged(previous, next)) this.derivedGeneration += 1;
    if (this.persistence !== null) {
      await this.persistence.save(next, found.touchedPaths, {
        day: isoDay(now),
        staleAfterDays: this.options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS,
      });
      this.scheduleSearchSave();
    }
  }

  /** Suchzustand sofort schreiben — fuer den vollen Lauf. */
  private async saveSearchNow(index: VaultIndex): Promise<void> {
    if (this.persistence === null) return;
    const covers = new Map(index.docs.map((doc) => [doc.path, doc.hash]));
    await this.persistence.saveSearch(this.engine.serialize(), covers);
  }

  /**
   * Suchzustand gesammelt nachziehen: liegt schon ein Schreibvorgang an, tut
   * dieser Aufruf nichts weiter — mehrere schnelle gezielte Refreshs teilen
   * sich einen Schreibvorgang, statt jeder seinen eigenen anzustossen.
   */
  private scheduleSearchSave(): void {
    if (this.persistence === null || this.pendingSearchSave !== null) return;
    const delay = this.options.searchPersistDelayMs ?? DEFAULT_SEARCH_PERSIST_DELAY_MS;
    const timer = setTimeout(() => {
      this.pendingSearchSave = null;
      void this.saveSearchNow(this.current);
    }, delay);
    // Keeps the timer from holding the process (or a test runner) open for the
    // whole delay — `tsconfig.node.json` types `setTimeout` as `NodeJS.Timeout`.
    timer.unref();
    this.pendingSearchSave = timer;
  }

  private cancelPendingSearchSave(): void {
    if (this.pendingSearchSave === null) return;
    clearTimeout(this.pendingSearchSave);
    this.pendingSearchSave = null;
  }

  /**
   * Suchindex nachziehen. Nur was einen neuen Hash hat, wird neu tokenisiert —
   * das ist der teuerste Teil eines Laufs. Bei einem vollen Aufbau laeuft das
   * Fuellen in Haeppchen mit Yields dazwischen; beim Nachziehen zaehlt nur die
   * Zahl ersetzter Dokumente, alle anderen Pfade kosten nichts.
   */
  private async applyToEngine(previous: VaultIndex | null, next: VaultIndex): Promise<void> {
    if (previous === null) {
      const yieldControl = this.options.yieldControl ?? yieldToEventLoop;
      this.engine = SearchEngine.create();
      await this.engine.addAllYielding(next.docs, yieldControl);
      return;
    }
    await this.reconcileEngine(
      (path) => previous.byPath.get(path)?.hash,
      previous.byPath.keys(),
      next,
    );
  }

  /**
   * Der eigentliche Abgleich hinter `applyToEngine`: nur, wessen Hash sich
   * gegenueber `hashOf` geaendert hat, wird neu tokenisiert; Pfade aus
   * `previousPaths`, die in `next` fehlen, werden entfernt. Getrennt von
   * `applyToEngine`, weil `restoreEngine` denselben Abgleich gegen die
   * Deckungsliste der Suchdatei braucht, nicht gegen einen vollen `VaultIndex`.
   */
  private async reconcileEngine(
    hashOf: (path: string) => string | undefined,
    previousPaths: Iterable<string>,
    next: VaultIndex,
  ): Promise<void> {
    const yieldControl = this.options.yieldControl ?? yieldToEventLoop;
    let sinceYield = 0;
    for (const doc of next.docs) {
      const before = hashOf(doc.path);
      if (before === undefined || before !== doc.hash || !this.engine.has(doc.path)) {
        this.engine.replace(doc);
        sinceYield += 1;
        if (sinceYield >= YIELD_EVERY) {
          sinceYield = 0;
          await yieldControl();
        }
      }
    }
    for (const path of previousPaths) {
      if (!next.byPath.has(path)) this.engine.remove(path);
    }
  }

  /**
   * Suchindex aus dem gespeicherten Zustand herstellen: restaurieren, wenn eine
   * Suchdatei da ist, sonst in Haeppchen aus den Dokumenten neu fuellen. Deckt
   * die Suchdatei nicht mehr genau die Dokumente des Manifests ab — ein Lauf
   * kann zwischen Manifest- und Suchdatei-Schreiben abgebrochen sein, oder ein
   * gezielter Refresh hat die Suchdatei-Ablage nur vorgemerkt —, wird gegen die
   * Deckungsliste (`covers`) abgeglichen. Gibt zurueck, ob die Suchdatei danach
   * neu geschrieben werden muss.
   */
  private async restoreEngine(stored: StoredIndex): Promise<boolean> {
    const yieldControl = this.options.yieldControl ?? yieldToEventLoop;
    if (stored.search === null) {
      this.engine = SearchEngine.create();
      await this.engine.addAllYielding(stored.index.docs, yieldControl);
      return true;
    }
    this.engine = SearchEngine.restore(stored.search) ?? SearchEngine.create();
    if (coversExactly(stored.covers, stored.index)) return false;
    await this.reconcileEngine(
      (path) => stored.covers.get(path),
      stored.covers.keys(),
      stored.index,
    );
    return true;
  }

  /**
   * Startup-Abgleich: derselbe Baumlauf wie ein voller `refresh()`, aber ohne
   * dessen "immer ableiten, immer ablegen" — ein unveraenderter Vault kostet
   * hier weder das eine noch das andere. Nur von `open()` aufgerufen; jeder
   * andere Lauf geht weiter ueber `update()`.
   */
  private async openUpdate(stored: StoredIndex, searchStaleFromCovers: boolean): Promise<void> {
    const now = this.now();
    const { docs, sources } = await scanVault(this.store, {
      previous: stored.index,
      staleAfterDays: this.options.staleAfterDays,
      externalTouches: this.options.externalTouches,
      yieldControl: this.options.yieldControl,
    });
    const touched = changedPaths(stored.index, docs);
    const docsChanged = touched.length > 0;
    const sourcesChanged = JSON.stringify(stored.index.sources) !== JSON.stringify(sources);
    const wantedDerivedFor: IndexDerivedFor = {
      day: isoDay(now),
      staleAfterDays: this.options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS,
    };
    const derivedForMatches =
      stored.derivedFor !== null &&
      stored.derivedFor.day === wantedDerivedFor.day &&
      stored.derivedFor.staleAfterDays === wantedDerivedFor.staleAfterDays;

    if (!docsChanged && !sourcesChanged && !stored.partial && derivedForMatches) {
      // Der Baumlauf allein hat schon beantwortet, dass sich nichts geaendert
      // hat — kein Grund, weder abzuleiten noch abzulegen.
      if (searchStaleFromCovers) this.scheduleSearchSave();
      return;
    }

    const dirty = docsChanged || sourcesChanged || stored.partial;
    const next = await deriveIndexIncremental(docs, stored.index, {
      now,
      staleAfterDays: this.options.staleAfterDays,
      externalTouches: this.options.externalTouches,
      sources,
      builtAt: dirty ? now.toISOString() : stored.index.builtAt,
      durationMs: 0,
      yieldControl: this.options.yieldControl,
    });

    if (dirty) await this.applyToEngine(stored.index, next);
    this.current = next;
    if (indexChanged(stored.index, next)) this.derivedGeneration += 1;
    if (this.persistence === null) return;

    if (dirty) {
      await this.persistence.save(next, touched, wantedDerivedFor);
      this.cancelPendingSearchSave();
      await this.saveSearchNow(next);
    } else {
      // Nur der Kalendertag oder `staleAfterDays` hat sich geaendert: die
      // Rumpftexte sind unberuehrt, also braucht nur das Manifest ein neues
      // `derivedFor` — keine Bucket-Schreibvorgaenge, keine neue Suchdatei.
      await this.persistence.save(next, [], wantedDerivedFor);
      if (searchStaleFromCovers) this.scheduleSearchSave();
    }
  }

  /** Laeufe hintereinander: zwei gleichzeitige Aufbauten wuerden sich ins Gehege kommen. */
  private async serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /**
   * Vor dem Beenden: eine noch anstehende, verzoegerte Suchdatei-Ablage sofort
   * schreiben statt sie mit dem Prozess zu verlieren.
   */
  async dispose(): Promise<void> {
    if (this.pendingSearchSave === null) return;
    this.cancelPendingSearchSave();
    await this.saveSearchNow(this.current);
  }
}
