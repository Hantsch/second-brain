/**
 * Der Tagesabschluss: aus dem Tageseintrag wird ein Vorschlag.
 *
 * Nichts hier schreibt. Herauskommt dieselbe Karte, die die Inbox schon kennt
 * (`FilingProposal`) plus die Frontmatter-Felder des Tages — annehmen, aendern
 * oder verwerfen tut der Mensch (Guardrail 2).
 *
 * Drei Entscheidungen, die man nachlesen koennen soll:
 *
 * - **Gelesen wird nur der Abschnitt „Tag".** Im Gespraech stehen auch die Saetze
 *   des Coachs; aus denen ein Todo zu ziehen hiesse, die App schlaegt sich selbst
 *   vor. „Fakten" ist schon herausgezogen.
 * - **„Morgen" heisst der Tag nach dem Eintrag.** Fristen werden gegen das Datum
 *   des Eintrags gerechnet, nicht gegen den heutigen Tag — sonst wandert die
 *   Frist eines nachgetragenen Tages um Wochen.
 * - **Aufgaben zieht `core/capture/tasks`.** Derselbe Weg wie beim Einordnen,
 *   samt Heuristik-Fallback. Ein zweiter Extraktor waere eine zweite Wahrheit.
 */

import type { FilingAction, FilingProposal, ProposedTodo, Scope } from '@shared/types';
import {
  MAX_CONFIDENCE,
  MENTION_WEIGHT,
  SECTION_FACTS,
  buildFilingContext,
  extractTasks,
  findProject,
  findProjectMentions,
  scopeSignals,
  todoActions,
  todoBlock,
} from '@core/capture';
import type { ExtractedTasks, FilingContext } from '@core/capture';
import { scopeHint } from '@core/index/todos';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { dayOf, readDay } from './day';
import { dayFacts, knownPeople } from './facts';
import type { DayFacts } from './facts';
import { dayText, sectionIn } from './sections';
import type { CloseDayDeps, CloseFindings, CloseLabels, DayCloseSuggestion } from './types';

/** Zuversicht mit Modell. Ueber die Heuristik-Grenze, aber nie „sicher". */
const MODEL_CONFIDENCE = 0.75;

/** Scope aus den Signalwoertern: Mehrheit gewinnt, Gleichstand entscheidet nicht. */
function scopeFromSignals(text: string): Scope | null {
  const signals = scopeSignals(text);
  if (signals.work.length > signals.private.length) return 'work';
  if (signals.private.length > signals.work.length) return 'private';
  return null;
}

/** Deutsche Vorgabe der Begruendung. Sie nennt Zahlen, keine Stimmung. */
export const GERMAN_CLOSE_LABELS: CloseLabels = {
  reason(found: CloseFindings): string {
    const parts: string[] = [];
    if (found.todos > 0) parts.push(found.todos === 1 ? '1 Todo' : `${found.todos} Todos`);
    if (found.waitingOn > 0) {
      parts.push(found.waitingOn === 1 ? '1 Warte-auf' : `${found.waitingOn} Warte-auf`);
    }
    if (found.people > 0) parts.push(found.people === 1 ? '1 Person' : `${found.people} Personen`);
    if (found.projects > 0) {
      parts.push(found.projects === 1 ? '1 Projekt' : `${found.projects} Projekte`);
    }
    if (found.mood) parts.push('Stimmung');
    const prefix = found.usedLlm
      ? 'Im Tageseintrag erkannt'
      : 'Ohne Modell im Tageseintrag erkannt';
    if (parts.length === 0) return `${prefix}: nichts.`;
    const last = parts[parts.length - 1] ?? '';
    const list = parts.length === 1 ? last : `${parts.slice(0, -1).join(', ')} und ${last}`;
    return `${prefix}: ${list}.`;
  },
};

/**
 * Wohin ein Todo gehoert. Nennt es selbst ein Projekt, geht es in dessen Datei —
 * und traegt dann auch dessen Bereich (VAULT-FORMAT.md: der Scope kommt aus der
 * Datei). Ein Tag beruehrt mehrere Projekte; deshalb entscheidet der Text des
 * einzelnen Todos, nicht der des ganzen Tages.
 *
 * Ein Treffer, der nur auf einem gemeinsamen Tag beruht, zaehlt nicht: er sagt
 * „gleiches Themenfeld", nicht „dieses Projekt" (wie in `capture/heuristic`).
 */
function placeTodos(
  todos: readonly ProposedTodo[],
  context: FilingContext,
  fallback: Scope,
): ProposedTodo[] {
  return todos.map((todo) => {
    const named = todo.project === null ? null : findProject(context, todo.project);
    const mention = findProjectMentions(todo.text, context.projects).find(
      (hit) => hit.score > MENTION_WEIGHT.tag,
    );
    const project = named ?? mention?.project ?? null;
    return { ...todo, project: project?.slug ?? null, scope: project?.scope ?? fallback };
  });
}

/**
 * Die Schreibvorgaenge des Vorschlags: Todos mit Projekt in die Projektdatei,
 * alle anderen unter „Fakten" des Tages. Gebaut mit `todoActions` des Erfassens —
 * die eine Stelle, die Markdown und Pfade kennt.
 */
function actionsFor(
  todos: readonly ProposedTodo[],
  context: FilingContext,
  place: { path: string; section: string },
): { primary: FilingAction; extras: FilingAction[] } {
  const home: FilingAction = {
    target: 'journal',
    path: place.path,
    section: place.section,
    content: todoBlock([]),
  };
  const actions = todoActions(home, todos, (slug) => findProject(context, slug)?.path ?? null);
  const own = actions.find((action) => action.path === place.path);
  return {
    primary: own ?? home,
    extras: actions.filter((action) => action !== own),
  };
}

function findingsOf(tasks: ExtractedTasks, facts: DayFacts, usedLlm: boolean): CloseFindings {
  return {
    todos: tasks.todos.length,
    waitingOn: tasks.waitingOn.length,
    people: facts.people.length,
    projects: facts.projects.length,
    mood: facts.mood !== null || facts.energy !== null,
    usedLlm,
  };
}

function stampOf(now: DateLike): string {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Den Tag abschliessen. `null`, wenn es den Eintrag nicht gibt oder er keinen
 * Text hat — dann gibt es nichts abzuschliessen.
 *
 * Findet der Lauf nichts, kommt der Vorschlag trotzdem: leere Listen mit einer
 * Begruendung, die das sagt. Ein stiller `null` waere ein Knopf, der nichts tut.
 */
export async function closeDay(
  deps: CloseDayDeps,
  date: DateLike,
): Promise<DayCloseSuggestion | null> {
  const day = dayOf(date);
  const found = await readDay(deps.store, day);
  if (found === null) return null;
  const text = dayText(found.doc.body);
  if (text.length === 0) return null;

  const docLanguage = deps.docLanguage ?? 'de';
  /* Derselbe Ablage-Kontext wie beim Einordnen: Projekte, Bereiche, Tags — klein
     gehalten und thematisch vorsortiert. */
  const context = buildFilingContext(deps.index, { now: day, text });
  const scope =
    scopeHint(found.doc.path, found.doc.frontmatter) ?? scopeFromSignals(text) ?? 'private';

  /* Das „heute" der Extraktion ist der Tag des Eintrags: „morgen" in einem
     Eintrag von vorletzter Woche meint den Tag danach, nicht den Tag nach heute. */
  const tasks = await extractTasks(
    {
      gateway: deps.gateway,
      docLanguage,
      projects: context.projects.map((project) => ({
        slug: project.slug,
        title: project.title,
      })),
      now: day,
      scope,
      project: null,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    },
    text,
  );
  const todos = placeTodos(tasks.todos, context, scope);

  const facts = await dayFacts(
    {
      gateway: deps.gateway,
      docLanguage,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    },
    {
      text,
      date: day,
      projects: context.projects,
      areas: context.areas,
      people: knownPeople(deps.index),
      tags: context.tags,
      waitingOn: tasks.waitingOn,
    },
  );

  const heuristic = tasks.heuristic && facts.heuristic;
  const { primary, extras } = actionsFor(todos, context, {
    path: found.doc.path,
    section: sectionIn(found.doc.body, 'facts', docLanguage) || SECTION_FACTS,
  });
  const labels = deps.labels ?? GERMAN_CLOSE_LABELS;
  const proposal: FilingProposal = {
    dumpPath: found.doc.path,
    title: found.day.title,
    scope,
    tags: facts.tags,
    primary,
    extras,
    /* Der Tageseintrag ist kein Dump: es gibt kein anderes Ziel, das man mit
       einem Klick waehlen wuerde. Eine erfundene Alternative waere Zierrat. */
    alternatives: [],
    confidence: heuristic ? MAX_CONFIDENCE : MODEL_CONFIDENCE,
    reason: labels.reason(findingsOf(tasks, facts, !heuristic)),
    todos,
    waitingOn: [...tasks.waitingOn],
    entities: facts.people,
    heuristic,
    createdAt: stampOf(deps.now ?? new Date()),
  };

  return {
    date: isoDay(day),
    path: found.doc.path,
    proposal,
    frontmatter: {
      people: facts.people,
      projects: facts.projects,
      areas: facts.areas,
      mood: facts.mood,
      energy: facts.energy,
      tags: facts.tags,
    },
    heuristic,
  };
}
