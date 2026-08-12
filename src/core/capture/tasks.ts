/**
 * Todos, Fristen und Warte-auf aus Text ziehen — mit Modell, wenn eines steht,
 * sonst deterministisch.
 *
 * Die API ist bewusst neutral: Text rein, `ProposedTodo[]` und `WaitingOn[]`
 * heraus. Nichts hier weiss von Dumps oder Tageseintraegen, damit auch der
 * Tagesabschluss (`core/journal`) diesen Weg nimmt und nicht seinen eigenen baut.
 *
 * Der Modellpfad ist eine Verbesserung, kein Fundament: faellt er aus, greift die
 * Heuristik, und der Aufrufer merkt es nur an `heuristic: true`.
 */

import type { DocLanguage, ProposedTodo, Scope, WaitingOn } from '@shared/types';
import { EXTRACT_TASKS_SCHEMA, extractTasksPrompt, isAbortError, parseJsonLoose } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { findDates, isCalendarDay, primaryDate } from './dates';
import { findWaitingOn, isTask, sentences, taskText } from './signals';

/** Mehr Aufgaben aus einem Dump sind kein Vorschlag mehr, sondern eine Zumutung. */
const MAX_TODOS = 12;
/** Mehr Wartende als das erkennt kein Text zuverlaessig. */
const MAX_WAITING = 6;

export interface ExtractedTasks {
  todos: ProposedTodo[];
  waitingOn: WaitingOn[];
  /** Ohne Modell entstanden. */
  heuristic: boolean;
}

export interface TaskOptions {
  /** Das „jetzt" — Grundlage jeder relativen Frist. */
  now?: DateLike;
  /** Scope, den die Aufgaben erben. */
  scope?: Scope;
  /** Projekt-Slug, in dessen Datei die Aufgaben sollen. */
  project?: string | null;
}

export interface ExtractTasksDeps extends TaskOptions {
  gateway: LlmGateway;
  docLanguage?: DocLanguage;
  /** Projekte, die zugeordnet werden duerfen. Alles andere ist erfunden. */
  projects?: readonly { slug: string; title: string }[];
  signal?: AbortSignal;
}

function todo(
  text: string,
  options: Required<Pick<TaskOptions, 'scope' | 'project'>>,
): ProposedTodo {
  return {
    text,
    scope: options.scope,
    due: null,
    waitingFor: null,
    priority: 0,
    project: options.project,
  };
}

/**
 * Aufgaben ohne Modell: Listenpunkte, Absichtswoerter, Infinitiv am Satzende.
 * Fristen kommen aus demselben Satz, Wartende ebenso — ein Datum drei Saetze
 * weiter gehoert nicht zur Aufgabe.
 */
export function heuristicTasks(text: string, options: TaskOptions = {}): ExtractedTasks {
  const today = isoDay(options.now ?? new Date());
  const scope = options.scope ?? 'private';
  const project = options.project ?? null;
  const todos: ProposedTodo[] = [];
  const waiting: WaitingOn[] = [];
  const seenTodo = new Set<string>();
  const seenWaiting = new Set<string>();

  for (const sentence of sentences(text)) {
    for (const hit of findWaitingOn(sentence.text)) {
      const key = hit.who.toLowerCase();
      if (seenWaiting.has(key) || waiting.length >= MAX_WAITING) continue;
      seenWaiting.add(key);
      const due = primaryDate(findDates(sentence.text, today), today);
      waiting.push({
        who: hit.who,
        what: hit.what,
        since: today,
        ...(due === null ? {} : { due: due.iso }),
      });
    }

    if (!isTask(sentence) || todos.length >= MAX_TODOS) continue;
    const entry = todo(taskText(sentence.text), { scope, project });
    const key = entry.text.toLowerCase();
    if (key.length === 0 || seenTodo.has(key)) continue;
    seenTodo.add(key);
    const due = primaryDate(findDates(sentence.text, today), today);
    if (due !== null) entry.due = due.iso;
    const waitFor = findWaitingOn(sentence.text)[0];
    if (waitFor !== undefined) entry.waitingFor = waitFor.who;
    todos.push(entry);
  }

  return { todos, waitingOn: waiting, heuristic: true };
}

interface RawTodo {
  text?: unknown;
  due?: unknown;
  waitingFor?: unknown;
  priority?: unknown;
  project?: unknown;
}

interface RawWaiting {
  who?: unknown;
  what?: unknown;
  due?: unknown;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asDay(value: unknown): string | null {
  return isCalendarDay(value) ? value.trim() : null;
}

/** Antwortliste absichern: nur was Text hat, nur bekannte Projekte, nur echte Tage. */
export function sanitizeTodos(
  value: unknown,
  options: Required<Pick<TaskOptions, 'scope' | 'project'>>,
  allowed: ReadonlySet<string>,
): ProposedTodo[] {
  if (!Array.isArray(value)) return [];
  const todos: ProposedTodo[] = [];
  for (const raw of value.slice(0, MAX_TODOS)) {
    if (raw === null || typeof raw !== 'object') continue;
    const entry = raw as RawTodo;
    const text = asText(entry.text);
    if (text === null) continue;
    const slug = asText(entry.project);
    const priority = typeof entry.priority === 'number' ? Math.trunc(entry.priority) : 0;
    todos.push({
      text,
      scope: options.scope,
      due: asDay(entry.due),
      waitingFor: asText(entry.waitingFor),
      priority: Math.min(3, Math.max(0, priority)),
      project: slug !== null && allowed.has(slug) ? slug : options.project,
    });
  }
  return todos;
}

/** Warte-auf absichern: ohne Person und Sache gibt es keinen Eintrag. */
export function sanitizeWaiting(value: unknown, today: string): WaitingOn[] {
  if (!Array.isArray(value)) return [];
  const entries: WaitingOn[] = [];
  for (const raw of value.slice(0, MAX_WAITING)) {
    if (raw === null || typeof raw !== 'object') continue;
    const entry = raw as RawWaiting;
    const who = asText(entry.who);
    const what = asText(entry.what);
    if (who === null || what === null) continue;
    const due = asDay(entry.due);
    entries.push({ who, what, since: today, ...(due === null ? {} : { due }) });
  }
  return entries;
}

/**
 * Aufgaben herausziehen. Steht kein Modell (oder antwortet es unbrauchbar),
 * kommt das Heuristik-Ergebnis zurueck — nie ein Fehler.
 */
export async function extractTasks(deps: ExtractTasksDeps, text: string): Promise<ExtractedTasks> {
  const today = isoDay(deps.now ?? new Date());
  const fallback = heuristicTasks(text, deps);
  const trimmed = text.trim();
  if (trimmed.length === 0 || !deps.gateway.isAvailable('extract-tasks')) return fallback;

  const projects = deps.projects ?? [];
  try {
    const result = await deps.gateway.complete({
      task: 'extract-tasks',
      messages: extractTasksPrompt({ text: trimmed, today, projects }, deps.docLanguage ?? 'de'),
      schema: EXTRACT_TASKS_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    const parsed = parseJsonLoose<{ todos?: unknown; waitingOn?: unknown }>(result.text);
    const place = { scope: deps.scope ?? 'private', project: deps.project ?? null };
    const allowed = new Set(projects.map((project) => project.slug));
    return {
      todos: sanitizeTodos(parsed.todos, place, allowed),
      waitingOn: sanitizeWaiting(parsed.waitingOn, today),
      heuristic: false,
    };
  } catch (error) {
    // Kein Modell, kein Netz, kaputtes JSON: die Heuristik traegt weiter. Nur ein
    // Abbruch des Aufrufers ist ein echter Abbruch und geht nach oben.
    if (isAbortError(error)) throw error;
    return fallback;
  }
}
