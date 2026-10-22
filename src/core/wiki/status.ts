/**
 * Status questions — "what is open at work?", "what do I still need to do?" — are
 * answered from the todos, not from full text.
 *
 * Full-text search cannot answer them: a todo reads `- [ ] Send the offer to Miller`,
 * and none of the question's words ('open', 'work', 'take care') stand in it. The
 * index already knows every open checkbox with its scope, due date and file line, so
 * the evidence is the checkbox line itself — verbatim, with path and line, as
 * Guardrail 3 requires.
 *
 * Recognised without a model: a question is a status question when it carries a
 * status word and, beyond status and scope words, at most words that narrow it down
 * ("todos for the raised bed"). Those must then match a todo, or there is no status
 * evidence at all — "what can I do against back pain" is not a todo question.
 */

import type { Scope, Todo } from '@shared/types';
import { contentTerms } from '@core/index/stopwords';
import { fold } from '@core/index/text';
import { closedProjects, openTodos } from '@core/overview';
import type { WikiExcerpt, WikiIndexView } from './types';

/** So many todo lines go into one answer — next due first. */
export const STATUS_LIMIT = 12;

/** Words that ask for open work, folded. Whole words only: 'open' must not meet 'openai'. */
const STATUS_WORDS = new Set([
  'offen',
  'offene',
  'offenen',
  'offenes',
  'todo',
  'todos',
  'aufgabe',
  'aufgaben',
  'erledigen',
  'kuemmern',
  'tun',
  'ansteht',
  'anstehen',
  // "Was steht an?" — the 'an' is a stopword, 'steht' is what is left of it.
  'steht',
  'faellig',
  'faellige',
  'faelligen',
  'frist',
  'fristen',
  'deadline',
  'deadlines',
  'warte',
  'warten',
  'wartet',
  'ausstehend',
  'ausstehende',
  'open',
  'task',
  'tasks',
  'due',
  'pending',
  'waiting',
  'wait',
  'outstanding',
]);

const SCOPE_WORDS: ReadonlyMap<string, Scope> = new Map([
  ['arbeit', 'work'],
  ['beruflich', 'work'],
  ['job', 'work'],
  ['buero', 'work'],
  ['work', 'work'],
  ['office', 'work'],
  ['privat', 'private'],
  ['private', 'private'],
  ['personal', 'private'],
  ['zuhause', 'private'],
  ['home', 'private'],
]);

/* Question words the stopword list keeps because they carry meaning elsewhere — in a
   status question they narrow nothing down. */
const FILLER_WORDS = new Set([
  'wen',
  'wem',
  'habe',
  'haben',
  'noch',
  'gerade',
  'aktuell',
  'heute',
  'morgen',
  'woche',
  'week',
  'today',
  'tomorrow',
  'now',
  'currently',
  'still',
]);

export interface StatusQuestion {
  /** Named in the question ('work', 'privat'); null asks about both. */
  scope: Scope | null;
  /** The words left over, folded: they must match a todo. */
  narrowing: string[];
}

/** The status question behind a question, or null if it asks for something else. */
export function statusQuestion(question: string): StatusQuestion | null {
  const terms = contentTerms(question).map(fold);
  if (!terms.some((term) => STATUS_WORDS.has(term))) return null;
  let scope: Scope | null = null;
  const narrowing: string[] = [];
  for (const term of terms) {
    const named = SCOPE_WORDS.get(term);
    if (named !== undefined) scope = named;
    else if (!STATUS_WORDS.has(term) && !FILLER_WORDS.has(term)) narrowing.push(term);
  }
  return { scope, narrowing };
}

/** Whether every narrowing word starts a word of the todo, its project or its tags. */
function matches(todo: Todo, narrowing: readonly string[]): boolean {
  const haystack = [todo.text, todo.project ?? '', todo.projectTitle ?? '', ...todo.tags].join(' ');
  const words = fold(haystack).split(/[^a-z0-9]+/);
  return narrowing.every((term) => words.some((word) => word.startsWith(term)));
}

export interface StatusOptions {
  /** A scope chosen in the chat wins over one named in the question. */
  scope?: Scope | null;
  project?: string | null;
}

/**
 * Open todos as evidence for a status question: each excerpt is the checkbox line
 * as it stands in the file. Empty when the question is no status question, or when
 * nothing open matches it.
 */
export function statusExcerpts(
  index: WikiIndexView,
  question: string,
  options: StatusOptions = {},
): WikiExcerpt[] {
  const status = statusQuestion(question);
  if (status === null) return [];
  const scope = options.scope ?? status.scope;
  const closed = closedProjects(index.projects());
  const scopes: Scope[] = scope === null ? ['work', 'private'] : [scope];
  const project = options.project ?? null;
  const todos = scopes
    .flatMap((each) => openTodos(index.todos(), each, 0, closed))
    .filter((todo) => project === null || todo.project === project)
    .filter((todo) => matches(todo, status.narrowing));

  const byPath = index.index().byPath;
  const excerpts: WikiExcerpt[] = [];
  for (const todo of todos) {
    if (excerpts.length >= STATUS_LIMIT) break;
    const doc = byPath.get(todo.path);
    if (doc === undefined) continue;
    const quote = doc.body.replace(/\r\n/g, '\n').split('\n')[todo.line - doc.bodyLine];
    if (quote === undefined) continue;
    excerpts.push({
      path: todo.path,
      title: todo.text,
      module: doc.module,
      quote: quote.trim(),
      line: todo.line,
      score: 1,
    });
  }
  return excerpts;
}
