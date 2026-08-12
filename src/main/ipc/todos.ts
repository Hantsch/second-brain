/* Todos: lesen, abhaken, anlegen, ändern.

   Ein Todo ist eine Checkbox in einer Datei, die der Nutzer auch in Obsidian
   bearbeitet. Deshalb gilt hier die härteste Fassung der Schreibregel aus
   docs/VAULT-FORMAT.md: **genau eine Zeile wird umgeschrieben**, der Rest der
   Datei geht wortwörtlich zurück auf die Platte (`todo-lines.ts`).

   Was „extern geändert" heißt, entscheidet der Vergleich mit dem Stand, den die
   Oberfläche gesehen hat: findet sich die Zeile nicht mehr, oder trägt sie
   inzwischen einen anderen Zustand, eine andere Frist oder eine andere
   Priorität, wird nicht geschrieben — es gibt einen Konflikt. Ein Häkchen, das
   die fremde Änderung überschreibt, wäre schlimmer als eine Absage. */

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
import { formatCheckboxLine, parseCheckboxLine, replaceTodoText, setDayMarker } from './todo-lines';
import type { CheckboxLine } from './todo-lines';
import { settle } from './wiki-bridge';
import type { VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/** Tag ohne Frontmatter-Deutung: der Rumpf beginnt bei Zeile 1. */
const BODY_OFFSET = 1;

function store(services: Services): VaultStoreLike {
  return services.requireStore();
}

function docLanguage(services: Services): DocLanguage {
  return services.settings.vault()?.languages.documents ?? 'de';
}

/** Todos einer Datei, wie der Parser sie in dieser Reihenfolge sieht. */
function todosOf(path: string, doc: VaultDoc, now: Date): Todo[] {
  return parseTodos(doc.body, {
    path,
    frontmatter: doc.frontmatter,
    lineOffset: BODY_OFFSET,
    today: now,
  });
}

/** Trägt die Zeile noch das, was die Oberfläche gezeigt hat? */
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
  /** 0-basierter Index im Rumpf. */
  at: number;
  parts: CheckboxLine;
  /** Stelle in der Reihenfolge der Todos dieser Datei. */
  ordinal: number;
}

/**
 * Die Zeile zu einer Todo-Kennung — in der Datei, nicht im Index. Der Index sagt
 * nur, wo gesucht wird; gefunden werden muss es in der Datei selbst.
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

/** Genau eine Zeile ersetzen und die Datei zurückschreiben. */
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
 * Das Todo, wie es nach dem Schreiben dasteht: aus dem Index, damit Projekttitel
 * und Fristberechnung stimmen. Kennt der Index die Datei noch nicht, kommt die
 * Fassung aus der Datei — sie ist wahr, nur ohne Projekttitel.
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

/** Wohin ein neues Todo geht: in die Projektdatei, sonst in den heutigen Tag. */
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
 * Der heutige Tageseintrag — die Heimat eines Todos ohne Projekt. Fehlt die
 * Datei, legt sie **der Tagebuch-Kern** an (`ensureDay`), nicht dieser Bereich:
 * es gab hier eine zweite Fassung des Tagesformats (Titel per `Intl`, Rumpf nur
 * „## Tag"), und zwei Fassungen laufen beim ersten Sprachwechsel auseinander.
 * `ensureDay` ist idempotent — liegt die Datei, wird sie nicht angefasst.
 */
async function ensureJournal(services: Services, now: Date): Promise<string> {
  const { path } = await ensureDay(journalStore(services), now, docLanguage(services));
  return path;
}

/**
 * Der Scope eines Todos kommt aus der Datei (VAULT-FORMAT.md). Sagt die Datei
 * schon das Gewünschte, bleibt die Zeile schmucklos; sonst trägt sie den Bereich
 * als Tag. Legt das Frontmatter den Bereich anders fest, wird nicht geschrieben:
 * ein zurückgegebener Scope, den die Datei nicht deckt, wäre eine Behauptung.
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

    /* Abhaken setzt `@done:` mit dem heutigen Tag, Zurücksetzen entfernt den
       Marker wieder. Nichts anderes an der Zeile wird angefasst. */
    'todos:toggle': async ({ id }) => {
      const now = new Date();
      const found = await locate(services, id, now);
      const checked = !found.parts.checked;
      const rest = setDayMarker(found.parts.rest, 'done', checked ? isoDay(now) : null);
      await writeLine(services, found, rest, checked);
      return reread(services, found.todo.path, found.ordinal, now);
    },

    'todos:create': async ({ text, scope, project, due }) => {
      const body = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
      if (body.length === 0) throw fail('invalid', 'text: darf nicht leer sein');
      if (scope !== 'work' && scope !== 'private') {
        throw fail('invalid', 'scope: erwartet work oder private');
      }
      const day = typeof due === 'string' && due.length > 0 ? due : null;
      if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw fail('invalid', 'due: erwartet ein Datum YYYY-MM-DD');
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
        priority: 0,
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

    /* Text und Frist ändern, alle übrigen Marker behalten — auch die, die die
       App nicht selbst setzt. */
    'todos:update': async ({ id, text, due }) => {
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
      if (rest === found.parts.rest) return found.todo;
      await writeLine(services, found, rest);
      return reread(services, found.todo.path, found.ordinal, now);
    },
  });
}
