/**
 * Aus einer Entscheidung einen vollstaendigen `FilingProposal` bauen: Zieldatei,
 * Abschnitt und der Text, der wirklich geschrieben wird.
 *
 * Die eine Stelle, an der Pfade und Markdown entstehen — Heuristik und
 * Modellantwort liefern nur die Entscheidung, nie einen Dateinamen. Damit gilt
 * das Format aus docs/VAULT-FORMAT.md fuer beide Wege gleich: angehaengte Dumps
 * landen unter „Notizen", jeder mit seinem Datum als Unterueberschrift.
 */

import type {
  FilingAction,
  FilingProposal,
  FilingTarget,
  ProposedTodo,
  Scope,
  WaitingOn,
} from '@shared/types';
import { journalPath, modulePath, projectPath, slugify } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import type { FilingContext, ProjectCandidate } from './context';
import { findArea, findModule, findProject } from './context';
import { filingBlock } from './filing';

/** Abschnitt, unter dem eingeordnete Dumps landen. */
export const SECTION_NOTES = 'Notizen';
export const SECTION_TODOS = 'Todos';
export const SECTION_STATE = 'Stand';
/** Abschnitt des Tageseintrags fuer Erlebtes. */
export const SECTION_DAY = 'Tag';
/** Abschnitt des Tageseintrags fuer herausgezogene Fakten und Todos. */
export const SECTION_FACTS = 'Fakten';

/** Welche Abschnitte ein Ziel zulaesst. Der erste ist die Vorgabe. */
const SECTIONS: Record<FilingTarget, readonly string[]> = {
  project: [SECTION_NOTES, SECTION_STATE, SECTION_TODOS],
  area: [SECTION_NOTES, SECTION_TODOS],
  module: [SECTION_NOTES],
  journal: [SECTION_DAY, SECTION_FACTS],
  'new-project': [SECTION_STATE],
  inbox: [],
};

/** Ziele, deren Inhalt ein datierter Block ist. */
const DATED: readonly FilingTarget[] = ['project', 'area', 'module'];

/**
 * Die Entscheidung, aus der ein Vorschlag gebaut wird. Heuristik und Modell
 * fuellen dasselbe Formular — der Rest des Weges ist identisch.
 */
export interface ProposalDraft {
  dumpPath: string;
  /** Der Dumptext, wie er in der Datei steht. */
  text: string;
  title: string;
  scope: Scope;
  tags: string[];
  target: FilingTarget;
  /** Projekt-, Modul- oder Bereichs-Slug. Bei journal, inbox, new-project null. */
  targetKey: string | null;
  /** Nur bei `new-project`: Titel des vorgeschlagenen Projekts. */
  newProjectTitle: string | null;
  /** Gewuenschter Abschnitt, wenn abweichend von der Vorgabe. */
  section: string | null;
  todos: ProposedTodo[];
  waitingOn: WaitingOn[];
  entities: string[];
  reason: string;
  confidence: number;
  /** Ohne Modell entstanden. */
  heuristic: boolean;
}

function stamp(at: DateLike): string {
  return (at instanceof Date ? at : new Date(at)).toISOString();
}

function sectionFor(target: FilingTarget, wanted: string | null): string | null {
  const allowed = SECTIONS[target];
  if (allowed.length === 0) return null;
  const found =
    wanted === null
      ? undefined
      : allowed.find((entry) => entry.toLowerCase() === wanted.trim().toLowerCase());
  return found ?? allowed[0] ?? null;
}

/** Der Slug, unter dem ein neues Projekt angelegt wuerde. */
export function newProjectSlug(draft: Pick<ProposalDraft, 'newProjectTitle' | 'title'>): string {
  return slugify(draft.newProjectTitle ?? draft.title);
}

/** Zieldatei eines Ziels, oder `null`, wenn es sie nicht gibt. */
function pathFor(draft: ProposalDraft, context: FilingContext): string | null {
  switch (draft.target) {
    case 'project':
      return findProject(context, draft.targetKey)?.path ?? null;
    case 'area':
      return findArea(context, draft.targetKey)?.path ?? null;
    case 'module':
      return findModule(context, draft.targetKey) === null
        ? null
        : modulePath(draft.targetKey ?? '');
    case 'journal':
      return journalPath(context.today);
    case 'new-project':
      return projectPath(draft.scope, newProjectSlug(draft));
    case 'inbox':
      return draft.dumpPath;
  }
}

function contentFor(target: FilingTarget, text: string, at: DateLike): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  return DATED.includes(target) ? filingBlock(trimmed, at) : trimmed;
}

function actionFor(
  target: FilingTarget,
  path: string,
  section: string | null,
  content: string,
): FilingAction {
  return { target, path, section, content };
}

/**
 * Eine fertige Ablage-Aktion aus rohem Text: die eine Stelle, an der entschieden
 * wird, ob ein Ziel einen Datumskopf bekommt.
 *
 * Oeffentlich, weil die Shell dieselbe Entscheidung braucht, wenn sie dem
 * Vorschlag weitere Ziele beilegt. Zwei Fassungen davon waeren zwei Fassungen von
 * docs/VAULT-FORMAT.md.
 */
export function filingAction(
  target: FilingTarget,
  path: string,
  section: string | null,
  text: string,
  at: DateLike = new Date(),
): FilingAction {
  return actionFor(target, path, section, contentFor(target, text, at));
}

/** Eine Checkbox nach VAULT-FORMAT.md, mit den Markern, die belegt sind. */
export function todoLine(todo: ProposedTodo): string {
  const parts = [`- [ ] ${todo.text.trim()}`];
  if (todo.due !== null) parts.push(`@due:${todo.due}`);
  if (todo.waitingFor !== null) parts.push(`@wait:${todo.waitingFor.replace(/\s+/g, '-')}`);
  const priority = Math.min(3, Math.max(0, Math.trunc(todo.priority)));
  if (priority > 0) parts.push('!'.repeat(priority));
  return parts.join(' ');
}

/** Mehrere Todos als Block. */
export function todoBlock(todos: readonly ProposedTodo[]): string {
  return todos.map(todoLine).join('\n');
}

/** Wohin Todos gehen, wenn sie kein eigenes Projekt nennen. */
function todoHome(primary: FilingAction): { path: string; section: string } | null {
  if (primary.target === 'journal') return { path: primary.path, section: SECTION_FACTS };
  if (
    primary.target === 'project' ||
    primary.target === 'area' ||
    primary.target === 'new-project'
  ) {
    return { path: primary.path, section: SECTION_TODOS };
  }
  return null;
}

/**
 * Die Nebenschreibvorgaenge: erkannte Todos landen als Checkboxen in der Datei des
 * Projekts, zu dem sie gehoeren — sonst beim Hauptziel. Ein Todo, fuer das es
 * keinen Ort gibt (Modul, „bleibt liegen"), faellt weg; es steht ohnehin im Text.
 *
 * Oeffentlich, weil die Shell die Bloecke neu ableiten muss, nachdem der Nutzer
 * Todos abgewaehlt oder Fristen geaendert hat. `projectPathOf` loest einen
 * Projekt-Slug in einen Pfad auf — welche Liste dahinter steht, ist gleichgueltig.
 */
export function todoActions(
  primary: FilingAction,
  todos: readonly ProposedTodo[],
  projectPathOf: (slug: string) => string | null,
): FilingAction[] {
  if (todos.length === 0) return [];
  const home = todoHome(primary);
  const grouped = new Map<
    string,
    { target: FilingTarget; section: string; todos: ProposedTodo[] }
  >();

  for (const todo of todos) {
    const own = todo.project === null ? null : projectPathOf(todo.project);
    const place =
      own !== null && own !== primary.path
        ? { path: own, section: SECTION_TODOS, target: 'project' as FilingTarget }
        : home === null
          ? null
          : { ...home, target: primary.target };
    if (place === null) continue;
    const entry = grouped.get(place.path) ?? {
      target: place.target,
      section: place.section,
      todos: [],
    };
    entry.todos.push(todo);
    grouped.set(place.path, entry);
  }

  return [...grouped.entries()].map(([path, entry]) =>
    actionFor(entry.target, path, entry.section, todoBlock(entry.todos)),
  );
}

/** Das naechstbeste Projekt, das nicht schon das Hauptziel ist. */
function otherProject(draft: ProposalDraft, context: FilingContext): ProjectCandidate | null {
  return (
    context.projects.find(
      (project) => draft.target !== 'project' || project.slug !== draft.targetKey,
    ) ?? null
  );
}

/**
 * Andere sinnvolle Ziele, ein Klick entfernt. `inbox` ist immer dabei: „bleibt
 * liegen" muss ohne Umweg erreichbar sein (Guardrail 2).
 */
function alternativesFor(
  draft: ProposalDraft,
  context: FilingContext,
  primary: FilingAction,
  at: DateLike,
): FilingAction[] {
  const alternatives: FilingAction[] = [];
  const other = otherProject(draft, context);
  if (other !== null && primary.path !== other.path) {
    alternatives.push(
      actionFor('project', other.path, SECTION_NOTES, contentFor('project', draft.text, at)),
    );
  }
  if (primary.target !== 'journal') {
    alternatives.push(
      actionFor(
        'journal',
        journalPath(context.today),
        SECTION_DAY,
        contentFor('journal', draft.text, at),
      ),
    );
  }
  if (primary.target !== 'inbox') {
    alternatives.push(actionFor('inbox', draft.dumpPath, null, draft.text.trim()));
  }
  return alternatives.slice(0, 3);
}

/**
 * Der vollstaendige Vorschlag. Laesst sich das Ziel nicht aufloesen (ein Projekt
 * ist verschwunden, ein Bereich existiert nicht), bleibt der Dump liegen — die App
 * erfindet keine Datei.
 */
export function buildProposal(
  draft: ProposalDraft,
  context: FilingContext,
  now: DateLike = new Date(),
): FilingProposal {
  const path = pathFor(draft, context);
  const named: ProposalDraft =
    draft.target === 'new-project' && draft.newProjectTitle !== null
      ? // Bei einem neuen Projekt ist der Titel des Inhalts der Titel des Projekts;
        // nur so tragen Pfad und Frontmatter denselben Namen.
        { ...draft, title: draft.newProjectTitle }
      : draft;
  const resolved: ProposalDraft =
    path === null ? { ...named, target: 'inbox', targetKey: null, section: null } : named;
  const primaryPath = path ?? draft.dumpPath;
  const primary = actionFor(
    resolved.target,
    primaryPath,
    sectionFor(resolved.target, resolved.section),
    contentFor(resolved.target, resolved.text, now),
  );

  return {
    dumpPath: resolved.dumpPath,
    title: resolved.title,
    scope: resolved.scope,
    tags: resolved.tags,
    primary,
    extras: todoActions(
      primary,
      resolved.todos,
      (slug) => findProject(context, slug)?.path ?? null,
    ),
    alternatives: alternativesFor(resolved, context, primary, now),
    confidence: Math.min(1, Math.max(0, Number(resolved.confidence.toFixed(2)))),
    reason: resolved.reason,
    todos: resolved.todos,
    waitingOn: resolved.waitingOn,
    entities: resolved.entities,
    heuristic: resolved.heuristic,
    createdAt: stamp(now),
  };
}
