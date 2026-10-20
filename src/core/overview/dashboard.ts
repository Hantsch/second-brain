/**
 * Das Dashboard in einem Rutsch: was war, was ansteht, worauf gewartet wird.
 *
 * Eine Rechnung, keine Abfrage — alles kommt aus dem Index und der Sitzungsliste.
 * Zwei Dinge sind ausdrueckliche Anforderungen und deshalb hier festgeschrieben:
 * **Todos sind nach Arbeit und Privat getrennt**, und **`waitingOn` traegt immer
 * seinen Projektbezug** (wer wartet worauf, in welchem Projekt, in welcher Datei).
 *
 * Der Pflegewert wird nicht erfunden: solange kein Pflegelauf vorliegt, ist
 * `healthKnown: false`. Eine 100 zu behaupten waere gelogen, eine 0 auch.
 */

import type {
  AgentWorkSession,
  DashboardData,
  JournalDay,
  Project,
  Scope,
  Todo,
  WaitingOn,
} from '@shared/types';
import { daysBetween } from '@core/index/dates';
import { deriveJournalDays } from '@core/index/journal';
import type { IndexedDoc } from '@core/index/types';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { shiftDay, windowStart } from './dates';
import type { RecentWorkLabels } from './labels';
import { recentWork } from './recent';
import { closedProjects, reminders } from './reminders';
import { DEFAULT_TODO_LIMIT, MOOD_TREND_DAYS, limits } from './types';
import type { OverviewIndex, OverviewLimits } from './types';

/** Projekte in diesen Zustaenden stagnieren nicht — sie sind fertig. */
const CLOSED: readonly Project['status'][] = ['done', 'dropped'];

/** Dumps in diesen Zustaenden liegen noch unsortiert in der Inbox. */
const OPEN_DUMPS = new Set(['raw', 'proposed']);

export interface DashboardOptions {
  /** Hoechstzahl an Todos je Bereich. Standard: `DEFAULT_TODO_LIMIT`. */
  todoLimit?: number;
  /** Hoechstzahl an Zeilen in „zuletzt gearbeitet". */
  recentLimit?: number;
  /** Beschriftungen fuer „zuletzt gearbeitet"; Vorgabe ist Deutsch. */
  labels?: RecentWorkLabels;
  /**
   * Ergebnis des letzten Pflegelaufs. Fehlt es, sagt das Dashboard das ehrlich
   * (`healthKnown: false`), statt eine Zahl zu behaupten.
   */
  gardener?: { health: number; findingCount: number } | null;
}

/**
 * Offene Todos eines Bereichs: naechste Frist zuerst, dann Prioritaet.
 * `exclude` haelt Projekte heraus, die abgeschlossen sind — deren Checkboxen
 * bleiben in der Datei, gehoeren aber nicht mehr auf „was ansteht".
 */
export function openTodos(
  todos: readonly Todo[],
  scope: Scope,
  limit: number,
  exclude: ReadonlySet<string> = new Set(),
): Todo[] {
  const open = todos.filter(
    (todo) =>
      todo.state === 'open' &&
      todo.scope === scope &&
      !(todo.project !== null && exclude.has(todo.project)),
  );
  open.sort((a, b) => {
    const dueA = a.due ?? a.neededBy;
    const dueB = b.due ?? b.neededBy;
    if (dueA !== dueB) {
      if (dueA === null) return 1;
      if (dueB === null) return -1;
      return dueA < dueB ? -1 : 1;
    }
    return b.priority - a.priority || a.text.localeCompare(b.text);
  });
  return limit > 0 ? open.slice(0, limit) : open;
}

/** Offene Warte-auf aller Projekte, aeltestes zuerst — mit Projektbezug. */
export function waitingList(
  projects: readonly Project[],
): (WaitingOn & { project: string; projectTitle: string; path: string })[] {
  const entries: (WaitingOn & { project: string; projectTitle: string; path: string })[] = [];
  for (const project of projects) {
    if (CLOSED.includes(project.status)) continue;
    for (const entry of project.waitingOn) {
      if (entry.resolved === true) continue;
      entries.push({
        ...entry,
        project: project.slug,
        projectTitle: project.title,
        path: project.path,
      });
    }
  }
  entries.sort((a, b) =>
    a.since === b.since ? a.who.localeCompare(b.who) : a.since < b.since ? -1 : 1,
  );
  return entries;
}

/**
 * Projekte ohne Spur, die noch nicht abgeschlossen sind — laengste Pause zuerst.
 *
 * Weiter gefasst als die Erinnerung `stale-project`: hier steht auch, was pausiert
 * oder Idee ist. Die Liste zeigt, die Erinnerung mahnt — und mahnen soll nur, was
 * laufen soll.
 */
export function staleProjects(
  projects: readonly Project[],
  today: string,
  staleAfterDays: number,
): Project[] {
  const stale = projects.filter(
    (project) => !CLOSED.includes(project.status) && ageOf(project, today) >= staleAfterDays,
  );
  stale.sort((a, b) => ageOf(b, today) - ageOf(a, today) || a.title.localeCompare(b.title));
  return stale;
}

/** Tage seit der letzten Spur, in Kalendertagen zum uebergebenen „heute". */
function ageOf(project: Project, today: string): number {
  if (project.lastTouch.length === 0) return 0;
  const days = daysBetween(isoDay(new Date(project.lastTouch)), today);
  return days === null ? 0 : Math.max(0, days);
}

/** Unsortierte Dumps in der Inbox. */
export function inboxCount(docs: readonly IndexedDoc[]): number {
  let count = 0;
  for (const doc of docs) {
    if (doc.docType !== 'dump') continue;
    const status = doc.frontmatter['status'];
    if (typeof status !== 'string' || OPEN_DUMPS.has(status)) count += 1;
  }
  return count;
}

/**
 * Die Journal-Serie: aufeinanderfolgende Tage mit Eintrag bis heute oder gestern.
 * Gestern zaehlt mit, weil der heutige Eintrag meist erst abends entsteht — sonst
 * waere die Serie jeden Morgen kaputt.
 */
export function journalStreak(days: readonly JournalDay[], today: string): number {
  const dates = new Set(days.map((day) => day.date).filter((date) => date.length > 0));
  let cursor = dates.has(today) ? today : shiftDay(today, -1);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Stimmungen der letzten Tage, aeltester zuerst. Tage ohne Angabe fehlen. */
export function moodTrend(days: readonly JournalDay[], today: string, span: number): number[] {
  const from = windowStart(today, span);
  return days
    .filter((day) => day.date >= from && day.date <= today && day.mood !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((day) => day.mood!);
}

/**
 * Alles, was das Dashboard braucht. `today` und `snoozes` kommen von aussen; der
 * Kern kennt weder Uhr noch Einstellungsdatei.
 */
export function dashboardData(
  index: OverviewIndex,
  sessions: readonly AgentWorkSession[],
  settings: OverviewLimits | undefined,
  today: DateLike,
  snoozes?: ReadonlyMap<string, string>,
  options: DashboardOptions = {},
): DashboardData {
  const day = isoDay(today);
  const { staleAfterDays } = limits(settings);
  const docs = index.index().docs;
  const projects = index.projects();
  const todos = index.todos();
  const journal = deriveJournalDays(docs);
  const todoLimit = options.todoLimit ?? DEFAULT_TODO_LIMIT;
  const gardener = options.gardener ?? null;
  const closed = closedProjects(projects);

  return {
    reminders: reminders(index, settings, today, snoozes),
    recentWork: recentWork(index, sessions, {
      now: today,
      ...(options.recentLimit === undefined ? {} : { limit: options.recentLimit }),
      ...(options.labels === undefined ? {} : { labels: options.labels }),
    }),
    staleProjects: staleProjects(projects, day, staleAfterDays).map((project) => project.slug),
    todos: {
      work: openTodos(todos, 'work', todoLimit, closed),
      private: openTodos(todos, 'private', todoLimit, closed),
    },
    waitingOn: waitingList(projects),
    inboxCount: inboxCount(docs),
    journal: {
      streak: journalStreak(journal, day),
      lastEntry: journal.find((entry) => entry.date.length > 0)?.date ?? null,
      moodTrend: moodTrend(journal, day, MOOD_TREND_DAYS),
    },
    health: gardener?.health ?? 0,
    findingCount: gardener?.findingCount ?? 0,
    healthKnown: gardener !== null,
    sessions: [...sessions],
  };
}
