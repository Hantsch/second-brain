/**
 * Geteilte Formen fuer die read-only Plaene von Modul-Umbenennung und -Loeschung
 * (Story 063, D1). Die Schreibvorgaenge selbst (D2/D3) leben in eigenen Dateien;
 * hier steht nur, wie ihre Vorschau aussieht.
 *
 * Der Zuschnitt folgt `DiscardPlan` (`@core/gardener/discard.ts`): eine flache
 * Liste von Aenderungen plus ein paar benannte Sonderfaelle (Quellen, Projekte,
 * kaputte Links), damit die Oberflaeche daraus eine Vorschau bauen kann, ohne
 * selbst zu wissen, was ein Modul alles beruehrt.
 */

import type { KnowledgeModule, Project, RawSource, WikiPage } from '@shared/types';
import type { IndexedDoc } from '@core/index/types';
import type { VaultStore } from '@core/vault/types';

/** Warum ein Plan nicht angewendet werden kann. Weitere Gruende (`digestion-pending`)
 * kommen aus der Ingest-Warteschlange und werden erst am IPC-Handler geprueft (D4) —
 * hier gibt es nur den einen Grund, den der Vaultinhalt selbst schon verraet. */
export type LifecycleBlockReason = 'target-exists';

/**
 * Was die Plaene vom Index brauchen — eine schmale, strukturell erfuellte Sicht,
 * genau wie `WikiIndexView`. `IndexService` erfuellt sie ohne Anpassung; Tests
 * reichen dasselbe Fixture herein, das die uebrigen Wiki-Tests schon benutzen.
 *
 * Bewusst nur Kandidaten-Quellen: die eigentlichen Inhalte liest jede Planfunktion
 * danach frisch ueber den Store — der Index darf zwischen zwei Aufrufen veraltet
 * sein, ohne dass der Plan das mitschleppt.
 */
export interface ModuleLifecycleIndexView {
  index(): { docs: readonly IndexedDoc[]; byPath: ReadonlyMap<string, IndexedDoc> };
  pages(): readonly WikiPage[];
  sources(): readonly RawSource[];
  projects(): readonly Project[];
  modules(): readonly KnowledgeModule[];
}

export interface ModuleLifecycleDeps {
  store: VaultStore;
  index: ModuleLifecycleIndexView;
}

/** Die Art der Aenderung, grob genug fuer eine gruppierte Vorschau in der Oberflaeche. */
export type LifecycleChangeKind =
  | 'module-file'
  | 'page'
  | 'agents-md'
  | 'catalog'
  | 'ingest-protocol'
  | 'project'
  | 'dump'
  | 'wikilink';

/** Eine Datei, die der Vorgang umschreiben wuerde — nie eine Loeschung, nie `log.md`. */
export interface LifecycleChange {
  path: string;
  kind: LifecycleChangeKind;
  /** Ein Satz, was sich aendert. Kein Diff — der ist bei Bedarf `refs.ts` zu entnehmen. */
  summary: string;
}

export interface RenamePlanInput {
  /** Slug des bestehenden Moduls. */
  slug: string;
  /** Neuer Titel. Der neue Slug ist `slugify(title)`, wie bei `createModule`. */
  title: string;
}

export interface RenamePlan {
  slug: string;
  newSlug: string;
  /** Der Titel, den `module.md` beim Planen trug (oder der Slug, wenn er fehlt) — die
   * Titelzeilen werden nur umgeschrieben, wo noch genau dieser steht. */
  oldTitle: string;
  title: string;
  /** `newSlug === slug`: nur Titelzeilen aendern sich, der Ordner bleibt stehen. */
  titleOnly: boolean;
  changes: LifecycleChange[];
  pages: readonly WikiPage[];
  blocked: LifecycleBlockReason | null;
  /** sha256 ueber sortierte `pfad:hash`-Paare — siehe Modul-Doku oben. */
  fingerprint: string;
}

export interface DeletePlanInput {
  slug: string;
}

/** Wie eine Rohquelle nach der Loeschung dasteht. */
export interface AffectedSource {
  path: string;
  protocolPath: string;
  /** `undigested`: ihre `modules`-Liste wird leer. `stays-digested`: ein anderes Modul bleibt. */
  outcome: 'undigested' | 'stays-digested';
  /** Bei `stays-digested` das verbleibende Modul, sonst `null`. */
  remainingModule: string | null;
}

/** Ein eingehender Wikilink, der nach der Loeschung ins Leere zeigt. Wird nicht
 * umgebogen — es gibt kein Ziel, auf das er zeigen koennte. */
export interface BrokenInboundLink {
  path: string;
  /** Das Linkziel, wie es in der Datei steht (`slug/seite`). */
  target: string;
  line: string;
}

export interface AffectedProject {
  path: string;
  slug: string;
}

export interface DeletePlan {
  slug: string;
  /** Protokoll- und Projekt-Schreibvorgaenge — nie die Modul-Seiten selbst, die
   * gehen als Ganzes in den Papierkorb statt umgeschrieben zu werden. */
  changes: LifecycleChange[];
  pages: readonly WikiPage[];
  sources: AffectedSource[];
  brokenLinks: BrokenInboundLink[];
  projects: AffectedProject[];
  /** Immer `null` in D1: `digestion-pending` kennt erst der IPC-Handler (D4). */
  blocked: LifecycleBlockReason | null;
  fingerprint: string;
}
