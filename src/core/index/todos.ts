/**
 * Todos sind GFM-Checkboxen in beliebigen Vault-Dateien — kein eigenes Format,
 * damit Obsidian und jeder Editor damit arbeiten koennen (VAULT-FORMAT.md).
 *
 * Erkannt werden die dort festgelegten Inline-Marker: `@due:`, `@wait:`,
 * `@needed:`, `@done:`, `!` bis `!!!` und `#tag`. Die Marker werden aus dem
 * angezeigten Text entfernt — die Datei bleibt unangetastet.
 *
 * Die ID ist ein Hash aus Pfad und normalisiertem Text, **nicht** aus der
 * Zeilennummer: verschiebt der Nutzer eine Zeile oder hakt er sie ab, bleibt das
 * Todo dasselbe. Die Zeilennummer wird trotzdem mitgefuehrt, damit die App die
 * Stelle in der Datei findet.
 */

import type { Scope, Todo, TodoState } from '@shared/types';
import { sha256 } from '@core/vault/hash';
import type { DateLike } from '@core/vault/paths';
import { dueInDays as daysUntil } from './dates';
import { asDate, asStringList, collapse, contentLines, fold } from './text';

/** Checkbox in einem Listenpunkt, beliebig tief eingerueckt. */
const CHECKBOX = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/;

const DUE = /@due:(\d{4}-\d{2}-\d{2})/;
const NEEDED = /@needed:(\d{4}-\d{2}-\d{2})/;
const DONE = /@done:(\d{4}-\d{2}-\d{2})/;
/* Nicht in VAULT-FORMAT.md, aber schadlos: wer es schreibt, bekommt ein Anlagedatum. */
const CREATED = /@created:(\d{4}-\d{2}-\d{2})/;
/* Ein Name, notfalls in Anfuehrungszeichen: `@wait:"Stefan Meier"`. */
const WAIT = /@wait:(?:"([^"]+)"|([^\s,;]+))/;
/* Prioritaet steht allein — 'Achtung!' ist keine. */
const PRIORITY = /(?:^|\s)(!{1,3})(?=\s|$)/;
const TAG = /(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}/_-]*)/gu;
/* Alles, was nach dem Deuten aus dem Anzeigetext verschwindet. */
const MARKERS =
  /@(?:due|needed|done|created):\d{4}-\d{2}-\d{2}|@wait:(?:"[^"]+"|[^\s,;]+)|(?:^|\s)!{1,3}(?=\s|$)|(?:^|\s)#[\p{L}\p{N}][\p{L}\p{N}/_-]*/gu;

const WORK_TAGS = new Set(['work', 'arbeit', 'job', 'büro', 'buero']);
const PRIVATE_TAGS = new Set(['privat', 'private', 'personal']);

export interface TodoParseOptions {
  /** Datei, in der die Checkboxen stehen — Teil der ID und Quelle des Scopes. */
  path: string;
  /** Frontmatter der Datei; entscheidet den Scope, wenn der Pfad schweigt. */
  frontmatter?: Record<string, unknown>;
  /** 1-basierte Zeilennummer der ersten Rumpfzeile in der Datei. */
  lineOffset?: number;
  /** Das „heute", auf das sich `dueInDays` bezieht. */
  today?: DateLike;
}

/** Stabile ID eines Todos. `occurrence` unterscheidet gleichlautende Zeilen. */
export function todoId(path: string, text: string, occurrence = 1): string {
  const normalized = fold(collapse(text));
  const digest = sha256(`${path}\n${normalized}`).slice(0, 16);
  return occurrence <= 1 ? digest : `${digest}-${occurrence}`;
}

/** `projects/<scope>/<slug>/...` → Projekt-Slug, sonst null. */
export function projectOfPath(path: string): string | null {
  const match = /^projects\/(?:work|private|privat)\/([^/]+)\//.exec(path);
  return match ? (match[1] ?? null) : null;
}

/** `areas/<slug>.md` → Bereichs-Slug, sonst null. Areas sind flach, kein Unterordner. */
export function areaOfPath(path: string): string | null {
  const match = /^areas\/([^/]+)\.md$/.exec(path);
  return match ? (match[1] ?? null) : null;
}

/** Scope aus dem Pfad: nur Projektordner sind hier eindeutig. */
export function scopeFromPath(path: string): Scope | null {
  if (/^projects\/work\//.test(path)) return 'work';
  if (/^projects\/(?:private|privat)\//.test(path)) return 'private';
  return null;
}

function scopeFromValue(value: unknown): Scope | null {
  if (value === 'work') return 'work';
  if (value === 'private' || value === 'privat') return 'private';
  return null;
}

function scopeFromTags(tags: readonly string[]): Scope | null {
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (WORK_TAGS.has(key)) return 'work';
    if (PRIVATE_TAGS.has(key)) return 'private';
  }
  return null;
}

/**
 * Scope, soweit belegt: Pfad → Frontmatter → Tag (erst am Todo, dann an der
 * Datei). `null` heisst „nichts sagt es" — fuer Dokumente ist das die ehrliche
 * Antwort.
 */
export function scopeHint(
  path: string,
  frontmatter: Record<string, unknown> = {},
  todoTags: readonly string[] = [],
): Scope | null {
  return (
    scopeFromPath(path) ??
    scopeFromValue(frontmatter['scope']) ??
    scopeFromTags(todoTags) ??
    scopeFromTags(asStringList(frontmatter['tags']))
  );
}

/**
 * Scope eines Todos nach den Regeln aus VAULT-FORMAT.md, in genau dieser
 * Reihenfolge: Pfad → Frontmatter → Tag → privat.
 */
export function scopeFor(
  path: string,
  frontmatter: Record<string, unknown> = {},
  todoTags: readonly string[] = [],
): Scope {
  return scopeHint(path, frontmatter, todoTags) ?? 'private';
}

function firstGroup(pattern: RegExp, text: string): string | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

function tagsIn(text: string): string[] {
  const tags: string[] = [];
  TAG.lastIndex = 0;
  for (let match = TAG.exec(text); match !== null; match = TAG.exec(text)) {
    const tag = match[1];
    if (tag !== undefined && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function displayText(raw: string): string {
  return collapse(raw.replace(MARKERS, ' '));
}

/** Anlagedatum: Marker am Todo, sonst das Datum der Datei, sonst nichts. */
function createdFor(raw: string, frontmatter: Record<string, unknown>): string | null {
  const marker = firstGroup(CREATED, raw);
  if (marker !== null) return marker;
  return asDate(frontmatter['created']) ?? asDate(frontmatter['date']);
}

/**
 * Alle Checkboxen eines Rumpfs. Zeilen in Code-Zaeunen zaehlen nicht: dort steht
 * ein Beispiel, keine Aufgabe.
 */
export function parseTodos(body: string, options: TodoParseOptions): Todo[] {
  const frontmatter = options.frontmatter ?? {};
  const offset = options.lineOffset ?? 1;
  const today = options.today ?? new Date();
  const project = projectOfPath(options.path);
  const area = areaOfPath(options.path);
  const seen = new Map<string, number>();
  const todos: Todo[] = [];

  for (const { line, index } of contentLines(body)) {
    const match = CHECKBOX.exec(line);
    if (!match) continue;
    const marker = match[2] ?? ' ';
    const raw = match[3] ?? '';
    if (raw.trim().length === 0) continue;

    const tags = tagsIn(raw);
    const text = displayText(raw);
    const key = fold(collapse(text));
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    const due = firstGroup(DUE, raw);
    const state: TodoState = marker === ' ' ? 'open' : 'done';

    todos.push({
      id: todoId(options.path, text, occurrence),
      text,
      state,
      scope: scopeFor(options.path, frontmatter, tags),
      path: options.path,
      line: offset + index,
      project,
      projectTitle: null,
      area,
      due,
      waitingFor: firstGroup(WAIT, raw),
      neededBy: firstGroup(NEEDED, raw),
      priority: (firstGroup(PRIORITY, raw) ?? '').length,
      tags,
      createdAt: createdFor(raw, frontmatter),
      doneAt: firstGroup(DONE, raw),
      dueInDays: daysUntil(due, today),
    });
  }
  return todos;
}

/**
 * Fristen neu auf ein anderes „heute" beziehen. Der Index rechnet sie bei jedem
 * Lauf frisch aus, auch fuer Dokumente, die nicht neu gelesen wurden.
 */
export function refreshDueInDays(todos: Todo[], today: DateLike): void {
  for (const todo of todos) todo.dueInDays = daysUntil(todo.due, today);
}

/** Projekttitel nachtragen — der ist erst bekannt, wenn die Projekte gelesen sind. */
export function applyProjectTitles(todos: Todo[], titles: ReadonlyMap<string, string>): void {
  for (const todo of todos) {
    todo.projectTitle = todo.project === null ? null : (titles.get(todo.project) ?? null);
  }
}
