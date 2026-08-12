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
import { extName } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import { buildIndex } from './build';
import { deriveDumps } from './dumps';
import { deriveJournalDays } from './journal';
import { deriveModules } from './modules';
import { VaultIndexStore } from './persist';
import { SearchEngine } from './search';
import { indexStats } from './stats';
import { emptyIndex } from './types';
import type { ExternalTouches, IndexProgress, IndexStore, VaultIndex } from './types';

/**
 * Ableitungen, die nicht im gespeicherten Index stehen, weil sie billig sind:
 * einmal je Lauf gerechnet, danach aus dem Zwischenspeicher.
 */
interface DerivedLists {
  dumps: DumpItem[] | null;
  journal: JournalDay[] | null;
  modules: KnowledgeModule[] | null;
}

/** Dateien, die den Index beruehren. Alles andere kann der Watcher fuer sich behalten. */
const RELEVANT_EXTENSIONS = new Set(['.md', '.json']);

export interface IndexServiceOptions {
  /** Uhr des Dienstes. Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: () => Date;
  /** Schwelle fuer stagnierende Projekte; kommt aus den Vault-Einstellungen. */
  staleAfterDays?: number;
  /** Arbeitsspuren von aussen (Claude-Sessions), Projekt-Slug → Zeitpunkt. */
  externalTouches?: ExternalTouches;
  /** Ablage. `null` heisst: der Index lebt nur im Speicher (Tests, Vorschau). */
  persistence?: IndexStore | null;
}

export class IndexService {
  private readonly store: VaultStore;
  private readonly options: IndexServiceOptions;
  private readonly persistence: IndexStore | null;
  private current: VaultIndex;
  private engine: SearchEngine;
  private tail: Promise<unknown> = Promise.resolve();
  private derived: DerivedLists = { dumps: null, journal: null, modules: null };

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
    if (stored !== null) {
      const restored = SearchEngine.restore(stored.search);
      service.current = stored.index;
      service.engine = restored ?? SearchEngine.from(stored.index.docs);
    }
    await service.update(stored === null ? null : stored.index);
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

  pages(): readonly WikiPage[] {
    return this.current.pages;
  }

  sources(): readonly RawSource[] {
    return this.current.sources;
  }

  dumps(): readonly DumpItem[] {
    this.derived.dumps ??= deriveDumps(this.current.docs, { now: this.now() });
    return this.derived.dumps;
  }

  journal(): readonly JournalDay[] {
    this.derived.journal ??= deriveJournalDays(this.current.docs);
    return this.derived.journal;
  }

  modules(): readonly KnowledgeModule[] {
    this.derived.modules ??= deriveModules(this.current.docs, {
      counts: this.current.counts,
      sources: this.current.sources,
    });
    return this.derived.modules;
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
   * Nach Aenderungen nachziehen. Die Pfade sind ein Hinweis: geprueft wird ohnehin
   * der ganze Baum, damit auch Umbenennungen und Loeschungen ankommen. Beruehrt
   * keine der Pfade eine indizierte Dateiart, bleibt alles, wie es ist.
   */
  async refresh(paths?: readonly string[]): Promise<void> {
    if (paths !== undefined && !paths.some((path) => RELEVANT_EXTENSIONS.has(extName(path)))) {
      return;
    }
    await this.serialize(async () => {
      await this.update(this.current);
    });
  }

  /** Ein Lauf: bauen, Suchindex nachziehen, speichern. */
  private async update(previous: VaultIndex | null, onProgress?: IndexProgress): Promise<void> {
    const next = await buildIndex(this.store, {
      previous,
      onProgress,
      now: this.options.now?.() ?? new Date(),
      staleAfterDays: this.options.staleAfterDays,
      externalTouches: this.options.externalTouches,
    });
    this.applyToEngine(previous, next);
    this.current = next;
    this.derived = { dumps: null, journal: null, modules: null };
    if (this.persistence !== null) await this.persistence.save(next, this.engine.serialize());
  }

  /**
   * Suchindex nachziehen. Nur was einen neuen Hash hat, wird neu tokenisiert —
   * das ist der teuerste Teil eines Laufs.
   */
  private applyToEngine(previous: VaultIndex | null, next: VaultIndex): void {
    if (previous === null) {
      this.engine = SearchEngine.from(next.docs);
      return;
    }
    for (const doc of next.docs) {
      const before = previous.byPath.get(doc.path);
      if (before === undefined || before.hash !== doc.hash || !this.engine.has(doc.path)) {
        this.engine.replace(doc);
      }
    }
    for (const path of previous.byPath.keys()) {
      if (!next.byPath.has(path)) this.engine.remove(path);
    }
  }

  /** Laeufe hintereinander: zwei gleichzeitige Aufbauten wuerden sich ins Gehege kommen. */
  private async serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
