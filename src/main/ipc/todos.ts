/* Todos: read, check off, create, change.

   A todo is a checkbox in a file the user also edits in Obsidian. That's why
   the strictest version of the write rule from docs/VAULT-FORMAT.md applies
   here: edits rewrite exactly one line; reordering only permutes the existing
   checkbox lines. Everything else goes back to disk verbatim (`todo-lines.ts`).

   What counts as "changed externally" is decided by comparing against the
   version the UI has seen: if the line can no longer be found, or it now
   carries a different state, a different due date, or a different priority,
   nothing is written — there's a conflict. A checkmark that overwrites a
   change made elsewhere would be worse than a refusal. */

import { SECTION_FACTS, SECTION_TODOS, todoLine } from '@core/capture';
import { parseTodos, scopeFor } from '@core/index';
import { ensureDay } from '@core/journal';
import { isoDay, projectPath } from '@core/vault/paths';
import type { DocLanguage, Scope, Todo, VaultDoc } from '@shared/types';
import { SCOPES } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { journalStore } from './journal-day';
import { requireLists } from './lists';
import {
  formatCheckboxLine,
  parseCheckboxLine,
  replaceTodoText,
  setDayMarker,
  setPriority,
} from './todo-lines';
import type { CheckboxLine } from './todo-lines';
import { settle } from './wiki-bridge';
import type { VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/** Day without frontmatter interpretation: the body starts at line 1. */
const BODY_OFFSET = 1;

function store(services: Services): VaultStoreLike {
  return services.requireStore();
}

function docLanguage(services: Services): DocLanguage {
  return services.settings.vault()?.languages.documents ?? 'de';
}

/** A file's todos, in the order the parser sees them. */
function todosOf(path: string, doc: VaultDoc, now: Date): Todo[] {
  return parseTodos(doc.body, {
    path,
    frontmatter: doc.frontmatter,
    lineOffset: BODY_OFFSET,
    today: now,
  });
}

/** Does the line still carry what the UI showed? */
function sameTodo(a: Todo, b: Todo): boolean {
  return (
    a.state === b.state &&
    a.due === b.due &&
    a.priority === b.priority &&
    a.doneAt === b.doneAt &&
    a.waitingFor === b.waitingFor &&
    a.neededBy === b.neededBy
  );
}

interface Located {
  todo: Todo;
  doc: VaultDoc;
  lines: string[];
  /** 0-based index in the body. */
  at: number;
  parts: CheckboxLine;
  /** Position in the order of this file's todos. */
  ordinal: number;
}

/**
 * The line for a todo id — in the file, not in the index. The index only
 * says where to look; the actual finding has to happen in the file itself.
 */
async function locate(services: Services, id: string, now: Date): Promise<Located> {
  const wanted = requireLists(services)
    .todos()
    .find((todo) => todo.id === id);
  if (wanted === undefined) throw fail('not-found', 'dieses Todo gibt es nicht');
  const doc = await store(services).read(wanted.path);
  if (doc === null) throw fail('not-found', `diese Datei gibt es nicht: ${wanted.path}`);

  const fresh = todosOf(wanted.path, doc, now);
  const ordinal = fresh.findIndex((todo) => todo.id === id);
  const found = fresh[ordinal];
  if (found === undefined) {
    throw fail('conflict', `Die Zeile steht so nicht mehr in ${wanted.path}.`);
  }
  if (!sameTodo(found, wanted)) {
    throw fail('conflict', `Diese Zeile wurde in ${wanted.path} zwischenzeitlich geändert.`);
  }
  const lines = doc.body.split('\n');
  const at = found.line - BODY_OFFSET;
  const parts = parseCheckboxLine(lines[at] ?? '');
  if (parts === null) throw fail('conflict', `In ${wanted.path} steht dort keine Checkbox mehr.`);
  return { todo: wanted, doc, lines, at, parts, ordinal };
}

/** Replace exactly one line and write the file back. */
async function writeLine(
  services: Services,
  found: Located,
  rest: string,
  checked = found.parts.checked,
): Promise<void> {
  const next = [...found.lines];
  next[found.at] = formatCheckboxLine({ ...found.parts, checked, rest });
  await store(services).write({
    path: found.todo.path,
    body: next.join('\n'),
    expectedHash: found.doc.hash,
  });
  await settle(services, [found.todo.path], 'todos');
}

/**
 * The todo as it stands after writing: from the index, so that project title
 * and due-date calculation are correct. If the index doesn't know the file
 * yet, the version comes from the file — it's true, just without a project
 * title.
 */
async function reread(services: Services, path: string, ordinal: number, now: Date): Promise<Todo> {
  const indexed = (services.index()?.todos?.() ?? []).filter((todo) => todo.path === path);
  const fromIndex = indexed[ordinal];
  if (fromIndex !== undefined) return fromIndex;
  const doc = await store(services).read(path);
  const parsed = doc === null ? [] : todosOf(path, doc, now);
  const found = parsed[ordinal];
  if (found === undefined) throw fail('io', `das Todo ließ sich in ${path} nicht wiederfinden`);
  return found;
}

/** Where a new todo goes: into the project file, otherwise into today's day. */
async function targetFor(
  services: Services,
  project: string | null | undefined,
  scope: Scope,
  now: Date,
): Promise<{ path: string; section: string }> {
  const slug = typeof project === 'string' ? project.trim() : '';
  if (slug.length > 0) {
    const known = (services.index()?.projects?.() ?? []).find((entry) => entry.slug === slug);
    if (known !== undefined) {
      if (known.scope !== scope) {
        throw fail('invalid', `dieses Projekt liegt im Bereich ${known.scope}`);
      }
      return { path: known.path, section: SECTION_TODOS };
    }
    for (const where of SCOPES) {
      const path = projectPath(where, slug);
      if (await store(services).exists(path)) return { path, section: SECTION_TODOS };
    }
    throw fail('not-found', `dieses Projekt gibt es nicht: ${slug}`);
  }
  return { path: await ensureJournal(services, now), section: SECTION_FACTS };
}

/**
 * Today's daily entry — home for a todo without a project. If the file is
 * missing, **the journal core** creates it (`ensureDay`), not this module:
 * there used to be a second version of the day format here (title via
 * `Intl`, body just "## Day"), and two versions drift apart at the first
 * language change. `ensureDay` is idempotent — if the file exists, it's left
 * untouched.
 */
async function ensureJournal(services: Services, now: Date): Promise<string> {
  const { path } = await ensureDay(journalStore(services), now, docLanguage(services));
  return path;
}

/**
 * A todo's scope comes from the file (VAULT-FORMAT.md). If the file already
 * says what's wanted, the line stays plain; otherwise it carries the scope as
 * a tag. If the frontmatter fixes the scope differently, nothing is written:
 * a returned scope that the file doesn't back up would be a false claim.
 */
function scopeTag(path: string, frontmatter: Record<string, unknown>, wanted: Scope): string {
  if (scopeFor(path, frontmatter) === wanted) return '';
  const tag = wanted === 'work' ? 'work' : 'privat';
  if (scopeFor(path, frontmatter, [tag]) !== wanted) {
    throw fail('invalid', `${path} legt den Bereich selbst fest`);
  }
  return ` #${tag}`;
}

export function todoHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'todos:list': ({ scope, project, open, dueBefore }) =>
      requireLists(services)
        .todos()
        .filter(
          (todo) =>
            (scope === undefined || todo.scope === scope) &&
            (project === undefined || todo.project === project) &&
            (open === undefined || (open ? todo.state === 'open' : todo.state === 'done')) &&
            (dueBefore === undefined || (todo.due !== null && todo.due < dueBefore)),
        ),

    /* Checking off sets `@done:` with today's date, unchecking removes the
       marker again. Nothing else about the line is touched. */
    'todos:toggle': async ({ id }) => {
      const now = new Date();
      const found = await locate(services, id, now);
      const checked = !found.parts.checked;
      const rest = setDayMarker(found.parts.rest, 'done', checked ? isoDay(now) : null);
      await writeLine(services, found, rest, checked);
      return reread(services, found.todo.path, found.ordinal, now);
    },

    'todos:create': async ({ text, scope, project, due, priority = 2 }) => {
      const body = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
      if (body.length === 0) throw fail('invalid', 'text: darf nicht leer sein');
      if (scope !== 'work' && scope !== 'private') {
        throw fail('invalid', 'scope: erwartet work oder private');
      }
      const day = typeof due === 'string' && due.length > 0 ? due : null;
      if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw fail('invalid', 'due: erwartet ein Datum YYYY-MM-DD');
      }
      if (priority !== 1 && priority !== 2 && priority !== 3) {
        throw fail('invalid', 'priority: erwartet 1, 2 oder 3');
      }
      const now = new Date();
      const target = await targetFor(services, project, scope, now);
      const doc = await store(services).read(target.path);
      if (doc === null) throw fail('not-found', `diese Datei gibt es nicht: ${target.path}`);
      const tag = scopeTag(target.path, doc.frontmatter, scope);
      const line = todoLine({
        text: `${body}${tag}`,
        scope,
        due: day,
        waitingFor: null,
        priority,
        project: null,
      });

      await store(services).append(target.path, target.section, line, {
        expectedHash: doc.hash,
      });
      await settle(services, [target.path], 'todos');

      const written = await store(services).read(target.path);
      const parsed = written === null ? [] : todosOf(target.path, written, now);
      const ordinal = parsed.findLastIndex((todo) => todo.text === body);
      if (ordinal < 0) throw fail('io', `das neue Todo ließ sich in ${target.path} nicht finden`);
      return reread(services, target.path, ordinal, now);
    },

    /* Change text, due date and priority, keep all other markers — including
       the ones the app doesn't set itself. */
    'todos:update': async ({ id, text, due, priority }) => {
      const now = new Date();
      const found = await locate(services, id, now);
      let rest = found.parts.rest;
      if (text !== undefined) {
        const next = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
        if (next.length === 0) throw fail('invalid', 'text: darf nicht leer sein');
        rest = replaceTodoText(rest, next);
      }
      if (due !== undefined) {
        if (due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
          throw fail('invalid', 'due: erwartet ein Datum YYYY-MM-DD');
        }
        rest = setDayMarker(rest, 'due', due);
      }
      if (priority !== undefined) {
        if (priority !== 1 && priority !== 2 && priority !== 3) {
          throw fail('invalid', 'priority: erwartet 1, 2 oder 3');
        }
        rest = setPriority(rest, priority);
      }
      if (rest === found.parts.rest) return found.todo;
      await writeLine(services, found, rest);
      return reread(services, found.todo.path, found.ordinal, now);
    },

    'todos:reorder': async ({ ids }) => {
      if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
        throw fail('invalid', 'ids: erwartet alle Todo-IDs genau einmal');
      }
      const now = new Date();
      const indexed = requireLists(services).todos();
      const first = indexed.find((todo) => todo.id === ids[0]);
      if (first === undefined) throw fail('not-found', 'dieses Todo gibt es nicht');
      if (first.project === null)
        throw fail('invalid', 'nur Projekt-Todos lassen sich umsortieren');

      const expected = indexed.filter((todo) => todo.path === first.path);
      if (
        expected.length !== ids.length ||
        expected.some((todo) => !ids.includes(todo.id)) ||
        expected.some((todo) => todo.project !== first.project)
      ) {
        throw fail('conflict', 'Die Todo-Liste hat sich zwischenzeitlich geändert.');
      }

      const doc = await store(services).read(first.path);
      if (doc === null) throw fail('not-found', `diese Datei gibt es nicht: ${first.path}`);
      const fresh = todosOf(first.path, doc, now);
      if (
        fresh.length !== expected.length ||
        fresh.some((todo) => {
          const before = expected.find((entry) => entry.id === todo.id);
          return before === undefined || !sameTodo(todo, before);
        })
      ) {
        throw fail('conflict', `Die Todo-Liste in ${first.path} wurde zwischenzeitlich geändert.`);
      }

      const byId = new Map(
        fresh.map(
          (todo) => [todo.id, doc.body.split('\n')[todo.line - BODY_OFFSET] ?? ''] as const,
        ),
      );
      const lines = doc.body.split('\n');
      const slots = fresh.map((todo) => todo.line - BODY_OFFSET).sort((a, b) => a - b);
      ids.forEach((id, index) => {
        const line = byId.get(id);
        if (line === undefined)
          throw fail('conflict', 'Die Todo-Liste ist nicht mehr vollständig.');
        const at = slots[index];
        if (at !== undefined) lines[at] = line;
      });

      await store(services).write({
        path: first.path,
        body: lines.join('\n'),
        expectedHash: doc.hash,
      });
      await settle(services, [first.path], 'todos');
      const written = await store(services).read(first.path);
      if (written === null)
        throw fail('io', `die Datei ließ sich nicht wieder einlesen: ${first.path}`);
      return todosOf(first.path, written, now);
    },
  });
}
