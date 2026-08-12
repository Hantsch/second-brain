/**
 * „Was muss ich noch tun, bis wann, und auf wen warte ich?" — Teil zwei der drei
 * Fragen, als Liste von Erinnerungen.
 *
 * Vier Quellen, jede mit einem eigenen `source`, damit die Oberflaeche sagen kann,
 * **warum** etwas mahnt:
 *   `todo-due`          eine Checkbox mit Frist (`@due:`, ersatzweise `@needed:`)
 *   `project-deadline`  die harte Frist eines Projekts
 *   `waiting-overdue`   eine Antwort, die ueberfaellig ist
 *   `stale-project`     ein Projekt ohne Spur, das noch laeuft
 *
 * Zwei Grundsaetze:
 * - **Nichts erfinden.** Ohne Datum keine Frist. `waiting-overdue` erscheint nur,
 *   wenn die Frist wirklich vorbei ist (oder ohne Frist lange genug gewartet wird) —
 *   eine Erinnerung, die „ueberfaellig" heisst und es nicht ist, waere eine Luege.
 * - **Stabile IDs.** Sie haengen an Datei und Sache, nicht am Datum. Wer eine
 *   Erinnerung ruhen stellt und danach die Frist verschiebt, hat sie weiterhin
 *   ruhen — bis das Ruhen ablaeuft.
 */

import type { Project, Reminder, ReminderUrgency, Todo, WaitingOn } from '@shared/types';
import { daysBetween } from '@core/index/dates';
import { sha256 } from '@core/vault/hash';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { SOON_DAYS, limits } from './types';
import type { OverviewIndex, OverviewLimits } from './types';

/** Projekte in diesen Zustaenden mahnen nicht mehr. */
const CLOSED: readonly Project['status'][] = ['done', 'dropped'];

/** Nur diese Zustaende koennen stagnieren — eine Idee darf liegen. */
const RUNNING: readonly Project['status'][] = ['active', 'waiting'];

/** Kurze, stabile Kennung aus Bestandteilen. */
function idFor(source: Reminder['source'], ...parts: string[]): string {
  return `${source}:${sha256(parts.join('\n')).slice(0, 12)}`;
}

/**
 * Dringlichkeit aus dem Abstand in Tagen. `null` heisst: liegt jenseits des
 * Horizonts und gehoert nicht in die Liste.
 */
export function urgencyFor(daysOut: number, horizonDays: number): ReminderUrgency | null {
  if (daysOut < 0) return 'overdue';
  if (daysOut === 0) return 'today';
  if (daysOut <= SOON_DAYS) return 'soon';
  return daysOut <= horizonDays ? 'upcoming' : null;
}

function rank(urgency: ReminderUrgency): number {
  return urgency === 'overdue' ? 0 : urgency === 'today' ? 1 : urgency === 'soon' ? 2 : 3;
}

/**
 * Slugs abgeschlossener und aufgegebener Projekte.
 *
 * Sie mahnen nicht mehr: wer ein Projekt auf `done` setzt und eine Checkbox
 * offen laesst, will keine Frist mehr hoeren. Die Datei bleibt unangetastet —
 * `todos:list` zeigt die Zeile weiterhin.
 */
export function closedProjects(projects: readonly Project[]): Set<string> {
  return new Set(
    projects.filter((project) => CLOSED.includes(project.status)).map((project) => project.slug),
  );
}

/** Erinnerungen aus Todo-Fristen. `@needed:` zaehlt, wenn kein `@due:` steht. */
function fromTodos(
  todos: readonly Todo[],
  today: string,
  horizon: number,
  closed: ReadonlySet<string>,
): Reminder[] {
  const reminders: Reminder[] = [];
  for (const todo of todos) {
    if (todo.state !== 'open') continue;
    if (todo.project !== null && closed.has(todo.project)) continue;
    const date = todo.due ?? todo.neededBy;
    if (date === null) continue;
    const daysOut = daysBetween(today, date);
    if (daysOut === null) continue;
    const urgency = urgencyFor(daysOut, horizon);
    if (urgency === null) continue;
    reminders.push({
      id: idFor('todo-due', todo.id),
      source: 'todo-due',
      urgency,
      title: todo.text,
      date,
      daysOut,
      scope: todo.scope,
      path: todo.path,
      project: todo.project,
      who: todo.waitingFor,
    });
  }
  return reminders;
}

/** Erinnerungen aus Projekt-Deadlines. */
function fromDeadlines(projects: readonly Project[], today: string, horizon: number): Reminder[] {
  const reminders: Reminder[] = [];
  for (const project of projects) {
    if (project.deadline === null || CLOSED.includes(project.status)) continue;
    const daysOut = daysBetween(today, project.deadline);
    if (daysOut === null) continue;
    const urgency = urgencyFor(daysOut, horizon);
    if (urgency === null) continue;
    reminders.push({
      id: idFor('project-deadline', project.slug),
      source: 'project-deadline',
      urgency,
      title: project.title,
      date: project.deadline,
      daysOut,
      scope: project.scope,
      path: project.path,
      project: project.slug,
      who: null,
    });
  }
  return reminders;
}

/** Titel eines Warte-auf: „Stefan: Freigabe des Rollenkonzepts". */
function waitingTitle(entry: WaitingOn): string {
  const what = entry.what.trim();
  return what.length > 0 ? `${entry.who}: ${what}` : entry.who;
}

/**
 * Ueberfaellige Warte-auf. Zwei Faelle, beide wirklich vorbei:
 * `due` liegt hinter uns — oder es gibt keine Frist und gewartet wird laenger als
 * `waitingNudgeDays`.
 */
function fromWaiting(projects: readonly Project[], today: string, nudgeDays: number): Reminder[] {
  const reminders: Reminder[] = [];
  for (const project of projects) {
    if (CLOSED.includes(project.status)) continue;
    for (const entry of project.waitingOn) {
      if (entry.resolved === true) continue;
      const due = entry.due ?? null;
      const date = due ?? (entry.since.length > 0 ? entry.since : null);
      if (date === null) continue;
      const daysOut = daysBetween(today, date);
      if (daysOut === null) continue;
      if (due !== null ? daysOut >= 0 : -daysOut < nudgeDays) continue;
      reminders.push({
        id: idFor('waiting-overdue', project.slug, entry.who, entry.what),
        source: 'waiting-overdue',
        urgency: 'overdue',
        title: waitingTitle(entry),
        date,
        daysOut,
        scope: project.scope,
        path: project.path,
        project: project.slug,
        who: entry.who,
      });
    }
  }
  return reminders;
}

/**
 * Stagnierende Projekte: laenger als die Schwelle ohne Spur und noch im Lauf.
 * `date` ist der Tag der letzten Spur — die Erinnerung sagt damit, seit wann
 * nichts passiert ist, statt eine Frist zu behaupten, die es nicht gibt.
 */
function fromStale(projects: readonly Project[], today: string, staleDays: number): Reminder[] {
  const reminders: Reminder[] = [];
  for (const project of projects) {
    if (!RUNNING.includes(project.status)) continue;
    const date = project.lastTouch.length > 0 ? isoDay(new Date(project.lastTouch)) : null;
    if (date === null) continue;
    const daysOut = daysBetween(today, date);
    if (daysOut === null || -daysOut < staleDays) continue;
    reminders.push({
      id: idFor('stale-project', project.slug),
      source: 'stale-project',
      urgency: 'overdue',
      title: project.title,
      date,
      daysOut,
      scope: project.scope,
      path: project.path,
      project: project.slug,
      who: null,
    });
  }
  return reminders;
}

/** Ruht diese Erinnerung noch? `until` ist der Tag, ab dem sie wieder mahnt. */
function snoozed(
  id: string,
  today: string,
  snoozes: ReadonlyMap<string, string> | undefined,
): boolean {
  const until = snoozes?.get(id);
  if (until === undefined) return false;
  const days = daysBetween(today, until);
  return days !== null && days > 0;
}

/**
 * Alle Erinnerungen: overdue zuerst (die aeltesten oben), dann nach Datum.
 *
 * `snoozes` ist der eingespeiste Ruhezustand (Erinnerungs-ID → Tag, ab dem sie
 * wieder mahnt). Er filtert, er verschiebt nichts — die Sache selbst bleibt in
 * der Datei, wie sie ist.
 */
export function reminders(
  index: OverviewIndex,
  settings: OverviewLimits | undefined,
  today: DateLike,
  snoozes?: ReadonlyMap<string, string>,
): Reminder[] {
  const day = isoDay(today);
  const { staleAfterDays, deadlineHorizonDays, waitingNudgeDays } = limits(settings);
  const projects = index.projects();

  const all = [
    ...fromTodos(index.todos(), day, deadlineHorizonDays, closedProjects(projects)),
    ...fromDeadlines(projects, day, deadlineHorizonDays),
    ...fromWaiting(projects, day, waitingNudgeDays),
    ...fromStale(projects, day, staleAfterDays),
  ].filter((reminder) => !snoozed(reminder.id, day, snoozes));

  all.sort(
    (a, b) =>
      rank(a.urgency) - rank(b.urgency) ||
      (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? -1 : 1),
  );
  return all;
}
