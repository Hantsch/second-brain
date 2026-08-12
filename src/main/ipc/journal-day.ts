/* Die Textarbeit am Tageseintrag: Abschnitte lesen, den Abschnitt „Tag" ersetzen,
 * den bestätigten Tagesabschluss schreiben.
 *
 * Getrennt von `journal.ts`, weil das zwei Verantwortungen sind: dort steht der
 * Ablauf (wer streamt, wer abbricht, wer den Index nachzieht), hier steht, was
 * genau in der Datei passiert.
 *
 * Zwei Zusagen gelten in dieser Datei über allem:
 *
 * - **Es wird nur der eigene Abschnitt angefasst.** Gespräch, Fakten und alles,
 *   was der Nutzer sonst hineingeschrieben hat, bleiben Zeichen für Zeichen stehen.
 * - **Kein halber Zustand.** Scheitert der Tagesabschluss in der Mitte, geht das
 *   Geschriebene zurück; der Rückweg für den gelungenen Lauf kommt als Liste von
 *   `vault:write`-Aufträgen heraus. `capture:apply` taugt hier nicht — es würde
 *   den „Dump", hier also den Tageseintrag, am Ende löschen.
 */

import { SECTION_FACTS, todoActions, todoBlock } from '@core/capture';
import {
  dayText,
  isSectionOf,
  journalSections,
  parseDialog,
  requireDay,
  sectionIn,
} from '@core/journal';
import type { JournalIndexView, JournalStore } from '@core/journal';
import { FsVaultStore, findSections, toVaultDoc } from '@core/vault';
import type { SectionRange } from '@core/vault';
import type {
  IpcRequest,
  JournalDayView,
  JournalFrontmatterFields,
  WriteRequest,
} from '@shared/ipc';
import type { DocLanguage, FilingAction, JournalDay, VaultDoc } from '@shared/types';
import { fail } from './errors';
import type { Services } from '../services';

/**
 * Der Store, wie der Tagebuch-Kern ihn braucht: `stat` und ein `append`, das über
 * den angelegten Abschnitt Auskunft gibt, kennt die schmale Sicht der Shell nicht.
 * `FsVaultStore` hält keinen Zustand, ein zweiter kostet nichts (dieselbe Stelle
 * wie in `wiki-bridge.ts`).
 *
 * Die **einzige** Stelle, an der er entsteht: Tagebuch, Tagesabschluss und der
 * Todo-Bereich sollen denselben Weg in dieselbe Datei nehmen.
 */
export function journalStore(services: Services): JournalStore {
  return new FsVaultStore(services.requireVaultRoot());
}

// ── Abschnitte lesen ─────────────────────────────────────────────────────────

/** Der erste Abschnitt dieser Art; mehrere gleichnamige gibt es nur von Hand. */
function sectionOf(body: string, kind: 'day' | 'facts'): SectionRange | null {
  return findSections(body, 2).find((range) => isSectionOf(range.heading, kind)) ?? null;
}

function textIn(body: string, range: SectionRange): string {
  return body.split('\n').slice(range.start, range.end).join('\n').trim();
}

/**
 * Der Tageseintrag für die Anzeige. Fehlt die Überschrift „Tag" ganz (eine von
 * Hand geschriebene Datei), gilt alles außer Gespräch und Fakten als Tagestext —
 * genau das, was `dayText` liest, und genau das, was `withDayText` ersetzt. So
 * zeigt der Screen nie einen leeren Tag, in dessen Datei Prosa steht.
 */
export function toView(found: { day: JournalDay; doc: VaultDoc }): JournalDayView {
  const body = found.doc.body;
  const day = sectionOf(body, 'day');
  const facts = sectionOf(body, 'facts');
  return {
    day: found.day,
    doc: found.doc,
    text: day === null ? dayText(body) : textIn(body, day),
    /* Die Runden kommen aus dem Kern (`parseDialog`, nachsichtig gegen von Hand
       ergänzte Blöcke) — der Renderer bekommt sie fertig. */
    turns: parseDialog(body).map((turn) => ({ role: turn.role, text: turn.text, at: turn.at })),
    facts: facts === null ? '' : textIn(body, facts),
  };
}

/**
 * Den Abschnitt „Tag" durch `text` ersetzen — der Schreibweg des Editors.
 */
export function withDayText(body: string, text: string, language: DocLanguage): string {
  const lines = body.split('\n');
  const block = text.replace(/\r\n/g, '\n').trim();
  const middle = block.length === 0 ? [''] : ['', block, ''];
  const range = sectionOf(body, 'day');
  if (range !== null) {
    return [...lines.slice(0, range.start), ...middle, ...lines.slice(range.end)].join('\n');
  }
  /* Keine Überschrift „Tag": die losen Zeilen vor dem ersten Abschnitt sind der
     Tagestext. Die Überschrift kommt dazu, damit die Datei danach dem Format aus
     docs/VAULT-FORMAT.md entspricht. */
  const first = findSections(body, 2)[0]?.headingLine ?? lines.length;
  return [`## ${journalSections(language).day}`, ...middle, ...lines.slice(first)].join('\n');
}

// ── Tagesabschluss ausführen ─────────────────────────────────────────────────

/** Bestand gewinnt: was schon im Frontmatter steht, überlebt jeden Schreibvorgang. */
function union(existing: unknown, added: readonly string[]): string[] {
  const known = Array.isArray(existing)
    ? existing.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const seen = new Set(known.map((entry) => entry.trim().toLowerCase()));
  const merged = [...known];
  for (const entry of added) {
    const value = entry.trim();
    if (value.length === 0 || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    merged.push(value);
  }
  return merged;
}

/** Die Felder, die wirklich geschrieben werden. Leere Listen ändern nichts. */
function fieldPatch(doc: VaultDoc, fields: JournalFrontmatterFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['people', 'projects', 'tags'] as const) {
    const values = fields[key] ?? [];
    if (values.length === 0) continue;
    const merged = union(doc.frontmatter[key], values);
    if (merged.length > 0) patch[key] = merged;
  }
  if (fields.mood !== null) patch['mood'] = fields.mood;
  if (fields.energy !== null) patch['energy'] = fields.energy;
  return patch;
}

/** Der Stand vor dem Schreiben — Grundlage des Rückwegs. */
function previousFields(doc: VaultDoc, patch: Record<string, unknown>): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const old = doc.frontmatter[key];
    /* Ein Feld, das es vorher nicht gab, wird geleert: entfernen kann ein
       Frontmatter-Patch nicht, und ein alter Wert wäre erfunden. */
    before[key] = old ?? (Array.isArray(value) ? [] : null);
  }
  return before;
}

/** Zurückdrehen, was dieser Lauf geschrieben hat. Ein Fehler dabei verdeckt nichts. */
async function revert(store: JournalStore, plan: readonly WriteRequest[]): Promise<void> {
  for (const entry of [...plan].reverse()) {
    try {
      await store.write(entry);
    } catch {
      continue;
    }
  }
}

/**
 * Eine Zieldatei lesen; fehlt sie, wird nichts geschrieben.
 *
 * Über den Kern (`toVaultDoc`): Rumpf und Hash müssen dieselbe Rechnung sein wie
 * beim Schreiben, sonst wäre der Konfliktschutz eine Behauptung.
 */
async function readTarget(
  store: JournalStore,
  path: string,
): Promise<{ body: string; hash: string }> {
  const raw = await store.readText(path);
  if (raw === null) throw fail('not-found', `Zieldatei fehlt: ${path}`);
  const doc = toVaultDoc(path, raw, { modified: new Date().toISOString() });
  return { body: doc.body, hash: doc.hash };
}

/**
 * Den bestätigten Tagesabschluss schreiben: Todos als Checkboxen und die
 * Frontmatter-Felder des Tages. Zurück kommt, was geschrieben wurde, und der
 * Rückweg dazu.
 */
export async function applyClose(
  store: JournalStore,
  index: JournalIndexView,
  language: DocLanguage,
  request: IpcRequest<'journal:applyClose'>,
): Promise<{ written: string[]; undo: WriteRequest[] }> {
  const day = await requireDay(store, request.date);
  const section = sectionIn(day.doc.body, 'facts', language) || SECTION_FACTS;
  const home: FilingAction = {
    target: 'journal',
    path: day.doc.path,
    section,
    content: todoBlock([]),
  };
  const projects = index.projects();
  /* Dieselbe Stelle, die auch die Inbox benutzt: nur `core/capture/actions` weiß,
     wie eine Checkbox-Zeile aussieht und wohin ein Todo mit Projekt gehört. */
  const actions = todoActions(
    home,
    request.todos,
    (slug) => projects.find((project) => project.slug === slug)?.path ?? null,
  );
  const patch = fieldPatch(day.doc, request.frontmatter);
  const undo: WriteRequest[] = [];
  const written: string[] = [];

  try {
    const own = actions.find((action) => action.path === day.doc.path) ?? null;
    if (own !== null || Object.keys(patch).length > 0) {
      const before: WriteRequest = {
        path: day.doc.path,
        body: day.doc.body,
        frontmatter: previousFields(day.doc, patch),
      };
      /* Der Hash, den der Renderer beim Öffnen gelesen hat — danach der eigene:
         der Lauf darf sich nicht selbst im Weg stehen. */
      let hash = request.expectedHash ?? day.doc.hash;
      if (own !== null) {
        hash = (await store.append(day.doc.path, section, own.content, { expectedHash: hash }))
          .hash;
      }
      if (Object.keys(patch).length > 0) {
        hash = (await store.write({ path: day.doc.path, frontmatter: patch, expectedHash: hash }))
          .hash;
      }
      undo.push({ ...before, expectedHash: hash });
      written.push(day.doc.path);
    }

    for (const action of actions) {
      if (action.path === day.doc.path) continue;
      const target = await readTarget(store, action.path);
      const result = await store.append(action.path, action.section ?? section, action.content, {
        expectedHash: target.hash,
      });
      undo.push({ path: action.path, body: target.body, expectedHash: result.hash });
      written.push(action.path);
    }
  } catch (error) {
    /* Kein halber Zustand: was schon geschrieben wurde, geht zurück. */
    await revert(store, undo);
    throw error;
  }
  /* Der Rückweg steht in umgekehrter Reihenfolge — der Renderer führt ihn so aus,
     wie er hier steht. */
  return { written, undo: [...undo].reverse() };
}
