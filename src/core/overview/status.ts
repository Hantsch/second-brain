/**
 * Status und naechster Schritt eines Projekts — als **Vorschlag**.
 *
 * Der Weg ist derselbe wie beim Einordnen eines Dumps (`capture/classify`):
 * 1. Die Heuristik entscheidet zuerst. Sie ist das Fundament, nicht der Notfall.
 * 2. Steht ein Modell, wird es gefragt und seine Antwort geprueft: ein Status, den
 *    es nicht gibt, oder eine Begruendung, die fehlt, macht die ganze Antwort
 *    unbrauchbar — dann behaelt die Heuristik das Wort.
 * 3. Faellt das Modell aus, ist das Ergebnis die Heuristik. Nie ein Fehler nach
 *    oben (Guardrail 1), nie eine stille Aenderung an der Datei (Guardrail 2):
 *    geschrieben wird hier nichts, das tut `projects:patch` nach Bestaetigung.
 *
 * `heuristic: true` sagt der Oberflaeche, dass kein Modell beteiligt war.
 */

import type {
  ClaudeSession,
  DocLanguage,
  Project,
  ProjectStatus,
  Todo,
  WaitingOn,
} from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import {
  PROJECT_STATUS_SCHEMA,
  isAbortError,
  parseJsonLoose,
  projectStatusPrompt,
} from '@core/llm';
import type { LlmGateway } from '@core/llm';
import type { ProjectStatusMention, ProjectStatusTrace } from '@core/llm';
import { daysBetween } from '@core/index/dates';
import { fold } from '@core/index/text';
import type { IndexedDoc } from '@core/index/types';
import { excerpt, extractSections } from '@core/vault/doc';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { sectionKindOf } from '@core/vault/section-names';
import { limits } from './types';
import type { OverviewIndex, OverviewLimits } from './types';

/** So viele Tageseintraege und Sitzungen gehen als Kontext mit. */
const MAX_CONTEXT_ENTRIES = 3;

/** Laenge eines Kontext-Ausschnitts in Zeichen. */
const CONTEXT_CHARS = 400;

/** Hoechstlaenge der Antwortfelder. */
const MAX_NEXT_STEP = 200;
const MAX_REASON = 300;

export interface ProjectStatusSuggestion {
  status: ProjectStatus;
  /** Der eine naechste Schritt. Leer, wenn keiner belegt ist. */
  nextStep: string;
  /** Ein Satz mit dem Beleg. Immer gesetzt — ein Vorschlag ohne Grund ist keiner. */
  reason: string;
  /**
   * Ohne Modell erzeugt. Dass es so ist, sagt die Oberflaeche in ihrer Sprache —
   * `reason` traegt nur den Beleg, nicht die Aussage ueber das Verfahren.
   */
  heuristic: boolean;
}

export interface SuggestStatusDeps {
  index: OverviewIndex;
  gateway: LlmGateway;
  /** Arbeitsspuren, schon den Projekten zugeordnet (`claude/link`). */
  sessions?: readonly ClaudeSession[];
  /** Sprache, in der der Vorschlag geschrieben wird. */
  docLanguage?: DocLanguage;
  /** Das „heute". Tests geben eine feste Zeit. */
  today?: DateLike;
  settings?: OverviewLimits;
  signal?: AbortSignal;
}

/** Offene Warte-auf eines Projekts. */
function openWaiting(project: Project): WaitingOn[] {
  return project.waitingOn.filter((entry) => entry.resolved !== true);
}

/** Offene Todos des Projekts: naechste Frist zuerst, dann Prioritaet. */
function openTodosOf(todos: readonly Todo[], slug: string): Todo[] {
  const open = todos.filter((todo) => todo.state === 'open' && todo.project === slug);
  open.sort((a, b) => {
    const dueA = a.due ?? a.neededBy;
    const dueB = b.due ?? b.neededBy;
    if (dueA !== dueB) {
      if (dueA === null) return 1;
      if (dueB === null) return -1;
      return dueA < dueB ? -1 : 1;
    }
    return b.priority - a.priority || a.line - b.line;
  });
  return open;
}

/** Tage seit der juengsten Spur. */
function ageOf(project: Project, today: string): number {
  if (project.lastTouch.length === 0) return project.ageDays;
  const days = daysBetween(isoDay(new Date(project.lastTouch)), today);
  return days === null ? project.ageDays : Math.max(0, days);
}

/**
 * Der Abschnitt „Stand" — der Wiedereinstiegspunkt in Prosa; ohne ihn der ganze
 * Rumpf. Exportiert, weil die Verdichtung eines Projekts (044, D16) denselben
 * Abschnitt liest und eine zweite Fassung auseinanderlaufen wuerde, sobald
 * `sectionKindOf` einen Alias dazulernt.
 */
export function stateSection(body: string): string {
  for (const [heading, text] of extractSections(body)) {
    if (sectionKindOf(heading) === 'state') return text.trim();
  }
  return body.trim();
}

/** Was der Treffer-Test von einem Projekt braucht. `Project` erfuellt das strukturell. */
export interface MentionableProject {
  slug: string;
  title: string;
}

/**
 * Der Test „nennt dieser Tageseintrag dieses Projekt": der Slug steht in der
 * `projects:`-Liste des Frontmatters, oder der Titel steht im Text (erst ab vier
 * Zeichen — kuerzere treffen zu viel). Nur Tageseintraege kommen in Frage.
 *
 * Eine Fabrik, damit die gefalteten Vergleichsformen einmal pro Projekt
 * entstehen und nicht einmal pro Dokument. Exportiert, weil die Verdichtung
 * eines Projekts (044, D15) **denselben** Test braucht, aber mit eigenem Fenster
 * und ohne die Grenzen unten: `mentions()` liefert drei Eintraege à 400 Zeichen
 * fuer den Statusvorschlag, die Verdichtung braucht die vollen Texte. Ein
 * zweiter Test wuerde stillschweigend andere Tage finden.
 */
export function projectMentionTest(project: MentionableProject): (doc: IndexedDoc) => boolean {
  const needleSlug = fold(project.slug);
  const needleTitle = fold(project.title);
  return (doc) => {
    if (doc.docType !== 'journal') return false;
    const listed = Array.isArray(doc.frontmatter['projects'])
      ? (doc.frontmatter['projects'] as unknown[]).some(
          (entry) => typeof entry === 'string' && fold(entry) === needleSlug,
        )
      : false;
    if (listed) return true;
    return needleTitle.length > 3 && fold(doc.body).includes(needleTitle);
  };
}

/** Tageseintraege, die dieses Projekt nennen — per Frontmatter oder im Text. */
function mentions(docs: readonly IndexedDoc[], project: Project): ProjectStatusMention[] {
  const isMention = projectMentionTest(project);
  const found: { date: string; text: string }[] = [];
  for (const doc of docs) {
    if (!isMention(doc)) continue;
    const date =
      typeof doc.frontmatter['date'] === 'string' ? doc.frontmatter['date'] : doc.updated;
    found.push({ date, text: excerpt(doc.body, CONTEXT_CHARS) });
  }
  found.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  return found.slice(0, MAX_CONTEXT_ENTRIES);
}

/** Arbeitsspuren dieses Projekts, juengste zuerst. */
function traces(sessions: readonly ClaudeSession[], slug: string): ProjectStatusTrace[] {
  return sessions
    .filter((session) => session.vaultProject === slug)
    .sort((a, b) =>
      a.lastActivity === b.lastActivity ? 0 : a.lastActivity < b.lastActivity ? 1 : -1,
    )
    .slice(0, MAX_CONTEXT_ENTRIES)
    .map((session) => ({
      at: session.lastActivity,
      text: session.summary ?? session.firstPrompt,
      branch: session.gitBranch,
    }));
}

/**
 * Der Vorschlag ohne Modell. Er erklaert sich aus Zahlen, die in den Dateien
 * stehen — Tage seit der letzten Spur, offene Todos, offene Warte-auf.
 */
export function heuristicStatus(
  project: Project,
  todos: readonly Todo[],
  today: string,
  staleAfterDays: number,
): ProjectStatusSuggestion {
  const open = openTodosOf(todos, project.slug);
  const waiting = openWaiting(project);
  const age = ageOf(project, today);
  const nextStep = open[0]?.text ?? project.nextStep ?? '';
  const closed = project.status === 'done' || project.status === 'dropped';

  if (waiting.length > 0) {
    const first = waiting[0]!;
    return {
      status: 'waiting',
      nextStep: nextStep.length > 0 ? nextStep : `Bei ${first.who} nachfassen`,
      reason: `Offenes Warte-auf: ${first.who} seit ${first.since} (${first.what}).`,
      heuristic: true,
    };
  }
  if (age >= staleAfterDays && !closed) {
    return {
      status: open.length > 0 ? 'paused' : project.status,
      nextStep,
      reason:
        open.length > 0
          ? `Seit ${age} Tagen keine Spur, aber ${open.length} offene Todos.`
          : `Seit ${age} Tagen keine Spur und kein offenes Todo — der Status bleibt ${project.status}.`,
      heuristic: true,
    };
  }
  return {
    status: closed ? project.status : 'active',
    nextStep,
    reason: `Spur von vor ${age} Tagen, ${open.length} offene Todos.`,
    heuristic: true,
  };
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

/**
 * Modellantwort pruefen. Ein Status, den es nicht gibt, oder eine fehlende
 * Begruendung machen die Antwort unbrauchbar — dann `null`, und die Heuristik gilt.
 */
function readVerdict(
  raw: Record<string, unknown>,
): { status: ProjectStatus; nextStep: string | null; reason: string } | null {
  const status = PROJECT_STATUSES.find((candidate) => candidate === raw['status']) ?? null;
  const reason = asText(raw['reason'], MAX_REASON);
  if (status === null || reason === null) return null;
  return { status, nextStep: asText(raw['nextStep'], MAX_NEXT_STEP), reason };
}

/**
 * Vorschlag fuer Status und naechsten Schritt. `null`, wenn es das Projekt nicht
 * gibt — der Aufrufer meldet dann `not-found`, statt etwas zu erfinden.
 */
export async function suggestProjectStatus(
  deps: SuggestStatusDeps,
  slug: string,
): Promise<ProjectStatusSuggestion | null> {
  const project = deps.index.projects().find((candidate) => candidate.slug === slug);
  if (project === undefined) return null;

  const today = isoDay(deps.today ?? new Date());
  const { staleAfterDays } = limits(deps.settings);
  const todos = deps.index.todos();
  const base = heuristicStatus(project, todos, today, staleAfterDays);
  if (!deps.gateway.isAvailable('project-status')) return base;

  const docs = deps.index.index().docs;
  const doc = docs.find((candidate) => candidate.path === project.path);
  const open = openTodosOf(todos, slug);

  try {
    const result = await deps.gateway.complete({
      task: 'project-status',
      messages: projectStatusPrompt(
        {
          title: project.title,
          slug: project.slug,
          today,
          currentStatus: project.status,
          statuses: PROJECT_STATUSES,
          deadline: project.deadline,
          nextStep: project.nextStep,
          state: doc === undefined ? project.excerpt : stateSection(doc.body),
          openTodos: open.map((todo) => ({ text: todo.text, due: todo.due })),
          waitingOn: openWaiting(project).map((entry) => ({
            who: entry.who,
            what: entry.what,
            since: entry.since,
            ...(entry.due === undefined ? {} : { due: entry.due }),
          })),
          lastTouch: project.lastTouch.length > 0 ? project.lastTouch : null,
          ageDays: ageOf(project, today),
          journal: mentions(docs, project),
          sessions: traces(deps.sessions ?? [], slug),
        },
        deps.docLanguage ?? 'de',
      ),
      schema: PROJECT_STATUS_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    const verdict = readVerdict(parseJsonLoose<Record<string, unknown>>(result.text));
    if (verdict === null) return base;
    return {
      status: verdict.status,
      // Ein leerer naechster Schritt ist erlaubt — dann traegt das erste offene Todo.
      nextStep: verdict.nextStep ?? base.nextStep,
      reason: verdict.reason,
      heuristic: false,
    };
  } catch (error) {
    // Kein Netz, kaputtes JSON, kein Modell: die Heuristik traegt. Nur ein Abbruch
    // des Aufrufers ist ein echter Abbruch.
    if (isAbortError(error)) throw error;
    return base;
  }
}
