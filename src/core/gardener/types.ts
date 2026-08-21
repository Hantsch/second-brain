/**
 * Der Vertrag des Pflegelaufs.
 *
 * Der Gardener rechnet auf dem **schon gebauten Index** — er liest keine Datei.
 * Alles, was ein Check braucht (Dokumente, Seiten, Projekte, Rohquellen, Dumps und
 * die Katalogtexte der Module), steckt im Kontext, den `report.ts` einmal je Lauf
 * baut. Deshalb laeuft ein Lauf ueber 1000 Seiten in Millisekunden und nicht in
 * Sekunden: kein Check oeffnet eine Datei.
 *
 * Zwei Grundsaetze, die jeder Check einhaelt:
 * - **Nichts erfinden.** Ein Befund nennt die Datei, in der er steht, und die Zahl,
 *   aus der er folgt. Wo die Datenlage nicht reicht, entsteht kein Befund.
 * - **Melden, nicht korrigieren** (docs/MODULE-SCHEMA.md, Abschnitt „Pflege").
 *   Geschrieben wird erst, wenn ein Mensch einen Fix anklickt — und auch dann nur
 *   das, was der Fix ankuendigt.
 *
 * Das „heute" kommt immer von aussen; kein Modul hier ruft `Date.now()`.
 */

import type {
  DocLanguage,
  DumpItem,
  FindingSeverity,
  GardenerFinding,
  GardenerFindingKind,
  GardenerFix,
  GardenerSettings,
  OverviewSettings,
  Project,
  RawSource,
  UiLanguage,
  WikiPage,
} from '@shared/types';
import type { BrokenLink, IndexedDoc } from '@core/index/types';
import { sha256 } from '@core/vault/hash';
import type { GardenerLabels } from './labels';

/** Der abgeleitete Zustand, so weit der Pflegelauf ihn braucht. */
export interface GardenerIndexData {
  docs: readonly IndexedDoc[];
  byPath: ReadonlyMap<string, IndexedDoc>;
  /** Schon beim Indexlauf gefunden — der Gardener zaehlt sie nur aus. */
  brokenLinks: readonly BrokenLink[];
}

/**
 * Was der Pflegelauf am Index benutzt. `IndexService` erfuellt es strukturell
 * (wie `OverviewIndex` im Ueberblick), Tests reichen ein Objekt herein.
 */
export interface GardenerIndexView {
  index(): GardenerIndexData;
  pages(): readonly WikiPage[];
  projects(): readonly Project[];
  sources(): readonly RawSource[];
  dumps(): readonly DumpItem[];
}

/** Ein Modul mit seinen Seiten und seinem Katalog — einmal je Lauf gruppiert. */
export interface GardenerModuleView {
  slug: string;
  pages: readonly WikiPage[];
  /** `modules/<slug>/wiki/index.md` */
  catalogPath: string;
  /** Inhalt des Katalogs; `null`, wenn es die Datei nicht gibt. */
  catalog: string | null;
}

/** Die Schwellen, aus denen Befunde folgen. */
export interface GardenerLimits {
  /** Seiten, die laenger nicht geprueft wurden, gelten als angestaubt. */
  reviewAfterDays: number;
  /** Dumps, die laenger unsortiert liegen, gelten als liegengeblieben. */
  unfiledAfterDays: number;
}

/**
 * Einstellungen, so weit der Pflegelauf sie liest. `VaultSettings` erfuellt das —
 * Aufrufer duerfen die ganzen Einstellungen durchgeben.
 *
 * Die Frist fuer liegengebliebene Dumps ist **keine eigene Einstellung**: sie ist
 * dieselbe Schwelle, mit der der Ueberblick Projekte als stagnierend meldet
 * (`overview.staleAfterDays`). Eine zweite Zahl fuer dieselbe Frage waere eine
 * zweite Wahrheit.
 */
export interface GardenerSettingsLike {
  gardener?: Partial<GardenerSettings>;
  overview?: Partial<OverviewSettings>;
}

/** Vorgabe aus `src/main/settings-defaults.ts`. */
export const DEFAULT_REVIEW_AFTER_DAYS = 120;

/** Vorgabe aus `core/overview`: dieselbe Schwelle wie „stagnierend". */
export const DEFAULT_UNFILED_AFTER_DAYS = 14;

/** Vollstaendige Schwellen aus teilweisen Einstellungen. */
export function limits(settings?: GardenerSettingsLike): GardenerLimits {
  return {
    reviewAfterDays: settings?.gardener?.reviewAfterDays ?? DEFAULT_REVIEW_AFTER_DAYS,
    unfiledAfterDays: settings?.overview?.staleAfterDays ?? DEFAULT_UNFILED_AFTER_DAYS,
  };
}

/** Alles, was ein Check zum Rechnen braucht. */
export interface GardenerContext {
  index: GardenerIndexView;
  /** Module mit Seiten und Katalog, nach Slug sortiert. */
  modules: readonly GardenerModuleView[];
  limits: GardenerLimits;
  /** Kalendertag, auf den sich jede Altersrechnung bezieht. */
  today: string;
  /** Zeitpunkt des Laufs, ISO — landet als `foundAt` in jedem Befund. */
  ranAt: string;
  /** Beschriftungen in der Sprache der Oberflaeche; Vorgabe ist Deutsch. */
  labels: GardenerLabels;
  /** Sprache der Zeilen, die ein Fix in den Vault schreibt. */
  docLanguage: DocLanguage;
  /** Sprache, in der das Modell dem Nutzer raet. */
  replyLanguage: UiLanguage;
}

/**
 * Eine Pruefung. Klein, synchron, ohne Zustand — damit sie einzeln testbar ist
 * und die Reihenfolge der Checks nichts aendert.
 */
export interface Check {
  kind: GardenerFindingKind;
  run(ctx: GardenerContext): GardenerFinding[];
}

/**
 * Gewicht je Schwere. Grundlage des Gesundheitswerts und der Sortierung.
 * `high` ist rund achtmal so schwer wie `info`: ein Widerspruch im Wissen kostet
 * Vertrauen, eine fehlende Katalogzeile kostet einen Klick.
 */
export const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { info: 1, warn: 3, high: 8 };

/** Reihenfolge der Schwere, schwerste zuerst. */
export const SEVERITY_ORDER: readonly FindingSeverity[] = ['high', 'warn', 'info'];

/**
 * Stabile Kennung eines Befunds. Haengt an Art und Sache, nicht am Datum: wer
 * einen Befund als „passt so" markiert, hat ihn beim naechsten Lauf weiterhin
 * ausgeblendet (dieselbe Zusage wie bei den Erinnerungen).
 */
export function findingId(kind: GardenerFindingKind, ...parts: readonly string[]): string {
  return `${kind}:${sha256(parts.join('\n')).slice(0, 12)}`;
}

/**
 * Die Art, die in einer Kennung steckt — der Teil vor dem ersten `:`. Damit
 * laesst sich ueber einen gespeicherten Befund reden, von dem nur noch die
 * Kennung da ist: eine abgelegte Entscheidung („passt so") ueberlebt den Lauf,
 * der sie ausgeloest hat. Rueckgabe ist absichtlich `string` und keine
 * Befundart: was in einer Datei steht, ist nicht typgeprueft.
 */
export function kindOf(id: string): string {
  const cut = id.indexOf(':');
  return cut < 0 ? id : id.slice(0, cut);
}

/**
 * Befundarten, die ein Lauf **ohne Modell** nicht hervorbringen kann.
 *
 * Wer aus „der Lauf hat den Befund nicht wiedergefunden" schliessen will „die
 * Sache ist erledigt", braucht diese Liste: nach diesen Arten hat ein Lauf ohne
 * Modell nie gesucht, sein Schweigen sagt zu ihnen also nichts.
 *
 * Eine benannte Liste und kein Vergleich auf eine einzelne Art: die naechste
 * modellgebundene Befundart haengt sich hier mit einer Zeile an.
 */
export const LLM_ONLY_KINDS: readonly GardenerFindingKind[] = ['contradiction'];

/** Ein Befund, wie die Checks ihn bauen. `id` und `foundAt` kommen von hier. */
export interface FindingInput {
  kind: GardenerFindingKind;
  severity: FindingSeverity;
  title: string;
  detail: string;
  paths: readonly string[];
  module: string | null;
  /** Teile, aus denen die stabile Kennung entsteht. */
  key: readonly string[];
  fix?: GardenerFix | null;
}

/**
 * Die Hashes der genannten Dateien, wie der Index sie zum Laufzeitpunkt kennt —
 * dieselbe Quelle, aus der die Checks rechnen (`IndexedDoc.hash`, sha256 des
 * ganzen Dateiinhalts). Kein zweites Hash-Verfahren: wer spaeter fragt „ist die
 * Datei seit dem Lauf bearbeitet worden?", vergleicht `store.hash(path)` damit.
 *
 * Pfade ohne Eintrag im Index (Verzeichnisse, Rohquellen ohne Datei) bekommen
 * keinen Hash — dann ist die Frage unbeantwortbar und wird nicht beantwortet.
 */
function hashesOf(ctx: GardenerContext, paths: readonly string[]): Record<string, string> {
  const { byPath } = ctx.index.index();
  const hashes: Record<string, string> = {};
  for (const path of paths) {
    const hash = byPath.get(path)?.hash;
    if (hash !== undefined && hash.length > 0) hashes[path] = hash;
  }
  return hashes;
}

export function buildFinding(ctx: GardenerContext, input: FindingInput): GardenerFinding {
  const hashes = hashesOf(ctx, input.paths);
  return {
    id: findingId(input.kind, ...input.key),
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    paths: [...input.paths],
    module: input.module,
    foundAt: ctx.ranAt,
    ...(Object.keys(hashes).length > 0 ? { hashes } : {}),
    fix: input.fix ?? null,
  };
}

/**
 * Ein Fix-Vorschlag. `label` kommt aus den einsetzbaren Beschriftungen, `preview`
 * ist die Zeile, die geschrieben wuerde — beides darf nichts versprechen, was
 * `applyFix` nicht tut. `kind` geht mit, weil dieselbe Aktion je Befundart etwas
 * anderes bedeutet (ein Verweis oder ein benannter Widerspruch).
 */
export function buildFix(
  ctx: GardenerContext,
  action: GardenerFix['action'],
  preview: string | null = null,
  kind?: GardenerFindingKind,
): GardenerFix {
  return { action, label: ctx.labels.fix(action, kind), preview };
}

/** Fehler des Pflegelaufs. `code` entspricht `IpcError.code`. */
export class GardenerError extends Error {
  readonly code: 'not-found' | 'invalid' | 'conflict';

  constructor(code: 'not-found' | 'invalid' | 'conflict', message: string) {
    super(message);
    this.name = 'GardenerError';
    this.code = code;
  }
}
