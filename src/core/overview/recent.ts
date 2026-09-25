/**
 * „Woran habe ich zuletzt gearbeitet?" — die erste der drei Fragen der App.
 *
 * Vier Spuren laufen hier zusammen: Dateiaenderungen aus dem Index,
 * Claude-Sitzungen, Tageseintraege und aufgenommene Quellen. Neueste zuerst.
 *
 * **Gruppiert, nicht aufgezaehlt.** Zwanzig Zeilen fuer dasselbe Projekt sind
 * keine Antwort, sondern ein Protokoll. Dateiaenderungen werden deshalb je
 * Projekt und Kalendertag zu einer Zeile mit Anzahl zusammengefasst; die Zeile
 * zeigt auf die juengste beruehrte Datei, damit ein Klick dort landet, wo zuletzt
 * gearbeitet wurde.
 *
 * Zeitangaben bleiben ISO. „heute", „gestern", „vor 3 Tagen" ist Sache des
 * Renderers — er kennt die Sprache des Nutzers, der Kern nicht.
 */

import type { AgentWorkSession, RecentWorkItem, Scope } from '@shared/types';
import { countTurns } from '@core/index/journal';
import type { IndexedDoc } from '@core/index/types';
import { isInternalPath, isInside, isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { windowStart } from './dates';
import { GERMAN_RECENT_LABELS } from './labels';
import type { RecentWorkLabels } from './labels';
import { DEFAULT_RECENT_DAYS, DEFAULT_RECENT_LIMIT } from './types';
import type { OverviewIndex } from './types';

export interface RecentWorkOptions {
  /** Das „jetzt". Bestimmt, wie weit zurueck geschaut wird. */
  now?: DateLike;
  /** Fenster in Tagen. Standard: `DEFAULT_RECENT_DAYS`. */
  days?: number;
  /** Hoechstzahl an Zeilen. Standard: `DEFAULT_RECENT_LIMIT`. */
  limit?: number;
  /** Beschriftungen; Vorgabe ist Deutsch. */
  labels?: RecentWorkLabels;
}

/** Eine Gruppe von Dateiaenderungen: ein Projekt (oder Ordner), ein Tag. */
interface FileGroup {
  count: number;
  /** Juengste Datei der Gruppe — sie traegt Zeitpunkt und Pfad. */
  newest: IndexedDoc;
  title: string;
  project: string | null;
  scope: Scope | null;
}

/** Titel der Modul-Beschreibungsdateien, fuer die Gruppentitel. */
function moduleTitles(docs: readonly IndexedDoc[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const doc of docs) {
    const match = /^modules\/([^/]+)\/module\.md$/.exec(doc.path);
    if (match?.[1] !== undefined) titles.set(match[1], doc.title);
  }
  return titles;
}

/** Der Ordner erster Ordnung eines Pfades — die Sammelschublade ohne Projekt. */
function topLevelOf(path: string): string {
  const first = path.split('/')[0] ?? path;
  return first.length > 0 ? first : path;
}

/**
 * Zaehlt fuer eine Dateiaenderung nicht mit: der abgeleitete Index, Rohquellen
 * (die kommen als Ingest-Vorgang) und Tageseintraege (die kommen als Journal).
 */
function countsAsFileChange(doc: IndexedDoc): boolean {
  if (isInternalPath(doc.path)) return false;
  if (isInside('raw', doc.path)) return false;
  return doc.docType !== 'journal';
}

function groupFiles(
  docs: readonly IndexedDoc[],
  since: string,
  projectTitles: ReadonlyMap<string, string>,
  modules: ReadonlyMap<string, string>,
): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  for (const doc of docs) {
    if (!countsAsFileChange(doc)) continue;
    if (isoDay(doc.updated) < since) continue;
    const bucket =
      doc.project !== null
        ? `project:${doc.project}`
        : doc.module !== null
          ? `module:${doc.module}`
          : `dir:${topLevelOf(doc.path)}`;
    const key = `${bucket}|${isoDay(doc.updated)}`;
    const known = groups.get(key);
    if (known === undefined) {
      groups.set(key, {
        count: 1,
        newest: doc,
        title: groupTitle(doc, projectTitles, modules),
        project: doc.project,
        scope: doc.scope,
      });
      continue;
    }
    known.count += 1;
    if (doc.updated > known.newest.updated) known.newest = doc;
    known.scope ??= doc.scope;
  }
  // Ein Titel, der auf die juengste Datei zeigt, wenn die Gruppe keinen eigenen hat.
  for (const group of groups.values()) {
    if (group.title.length === 0) group.title = group.newest.title;
  }
  return [...groups.values()];
}

function groupTitle(
  doc: IndexedDoc,
  projectTitles: ReadonlyMap<string, string>,
  modules: ReadonlyMap<string, string>,
): string {
  if (doc.project !== null) return projectTitles.get(doc.project) ?? doc.project;
  if (doc.module !== null) return modules.get(doc.module) ?? doc.module;
  return '';
}

/** Die Zeile, die ein Trupp Dateiaenderungen im Dashboard bekommt. */
function fileItem(group: FileGroup, labels: RecentWorkLabels): RecentWorkItem {
  const single = group.count === 1;
  return {
    at: group.newest.updated,
    kind: 'file',
    title: single ? group.newest.title : group.title,
    detail: labels.filesChanged(group.count),
    path: group.newest.path,
    project: group.project,
    scope: group.scope,
  };
}

function sessionItem(
  session: AgentWorkSession,
  labels: RecentWorkLabels,
  scopes: ReadonlyMap<string, Scope>,
): RecentWorkItem {
  const title =
    session.summary ?? (session.firstPrompt.length > 0 ? session.firstPrompt : session.projectName);
  return {
    at: session.lastActivity,
    kind: session.agent === 'codex' ? 'codex-session' : 'claude-session',
    title,
    detail: labels.session(session.agent, session.messageCount, session.gitBranch),
    // Die Verlaufsdatei liegt ausserhalb des Vaults; hier steht nur, was im Vault liegt.
    path: null,
    project: session.vaultProject,
    /* Der Bereich kommt vom zugeordneten Projekt. Ohne Zuordnung bleibt er
       `null` — ein Verzeichnis auf der Platte sagt nichts ueber Arbeit oder
       Privat, und geraten wird hier nicht. */
    scope: session.vaultProject === null ? null : (scopes.get(session.vaultProject) ?? null),
  };
}

function journalItem(doc: IndexedDoc, labels: RecentWorkLabels): RecentWorkItem {
  return {
    at: doc.updated,
    kind: 'journal',
    title: doc.title,
    detail: labels.journalEntry(doc.words, countTurns(doc.body)),
    path: doc.path,
    project: null,
    scope: doc.scope,
  };
}

/**
 * Die Arbeit der letzten Tage, neueste zuerst. Alles ISO, alles gezaehlt.
 */
export function recentWork(
  index: OverviewIndex,
  sessions: readonly AgentWorkSession[],
  options: RecentWorkOptions = {},
): RecentWorkItem[] {
  const now = options.now ?? new Date();
  const days = options.days ?? DEFAULT_RECENT_DAYS;
  const limit = options.limit ?? DEFAULT_RECENT_LIMIT;
  const labels = options.labels ?? GERMAN_RECENT_LABELS;
  const since = windowStart(now, days);

  const docs = index.index().docs;
  const projects = index.projects();
  const projectTitles = new Map(projects.map((project) => [project.slug, project.title]));
  const projectScopes = new Map(projects.map((project) => [project.slug, project.scope]));
  const items: RecentWorkItem[] = [];

  for (const group of groupFiles(docs, since, projectTitles, moduleTitles(docs))) {
    items.push(fileItem(group, labels));
  }
  for (const doc of docs) {
    if (doc.docType === 'journal' && isoDay(doc.updated) >= since) {
      items.push(journalItem(doc, labels));
    }
  }
  for (const session of sessions) {
    if (isoDay(session.lastActivity) >= since) {
      items.push(sessionItem(session, labels, projectScopes));
    }
  }
  for (const source of index.sources()) {
    if (source.ingestedAt.length === 0 || isoDay(source.ingestedAt) < since) continue;
    items.push({
      at: source.ingestedAt,
      kind: 'ingest',
      title: source.title,
      detail: labels.ingested(source.kind, source.sourcePage !== null),
      path: source.path,
      project: null,
      scope: null,
    });
  }

  items.sort((a, b) => (a.at === b.at ? a.title.localeCompare(b.title) : a.at < b.at ? 1 : -1));
  return limit > 0 ? items.slice(0, limit) : items;
}
