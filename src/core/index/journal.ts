/**
 * Tageseintraege: ein Tag ist eine Datei (`journal/YYYY/MM/YYYY-MM-DD.md`).
 *
 * Alles hier ist abgeleitet. `turns` zaehlt die Sprecherzeilen im Abschnitt
 * „Gespräch" — zwei Zeilen sind eine Runde; eine angefangene Runde zaehlt mit,
 * damit eine unbeantwortete Frage nicht verschwindet.
 */

import type { JournalDay } from '@shared/types';
import { excerpt, extractSections } from '@core/vault/doc';
import { baseName } from '@core/vault/paths';
import { asDate, asStringList, contentLines } from './text';
import type { IndexedDoc } from './types';

/** Abschnitt mit dem Coaching-Dialog, klein geschrieben verglichen. */
const DIALOGUE_SECTIONS = new Set(['gespräch', 'gespraech', 'conversation']);

/** Eine Sprecherzeile: `> **Ich** — 18:40`. */
const SPEAKER = /^>\s*\*\*[^*]+\*\*/;

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))
    return Number(value.trim());
  return null;
}

/** Datum aus dem Frontmatter, sonst aus dem Dateinamen. */
function dateOf(doc: IndexedDoc): string {
  const declared = asDate(doc.frontmatter['date']);
  if (declared !== null) return declared;
  const name = baseName(doc.path);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(name);
  return match?.[1] ?? '';
}

/** Sprecherzeilen im Dialogabschnitt → Runden. */
export function countTurns(body: string): number {
  let speakers = 0;
  for (const [heading, text] of extractSections(body)) {
    if (!DIALOGUE_SECTIONS.has(heading.trim().toLowerCase())) continue;
    for (const { line } of contentLines(text)) {
      if (SPEAKER.test(line)) speakers += 1;
    }
  }
  return Math.ceil(speakers / 2);
}

/** Erster Absatz unter '## Tag', sonst erster Absatz des Rumpfs. */
function dayExcerpt(body: string, maxChars = 200): string {
  for (const [heading, text] of extractSections(body)) {
    if (heading.trim().toLowerCase() !== 'tag' && heading.trim().toLowerCase() !== 'day') continue;
    const found = excerpt(text, maxChars);
    if (found.length > 0) return found;
  }
  return excerpt(body, maxChars);
}

/** Ein indiziertes Dokument als Tageseintrag. */
export function toJournalDay(doc: IndexedDoc): JournalDay {
  return {
    path: doc.path,
    date: dateOf(doc),
    title: doc.title,
    mood: numberOf(doc.frontmatter['mood']),
    energy: numberOf(doc.frontmatter['energy']),
    people: asStringList(doc.frontmatter['people']),
    projects: asStringList(doc.frontmatter['projects']),
    tags: doc.tags,
    excerpt: dayExcerpt(doc.body),
    wordCount: doc.words,
    turns: countTurns(doc.body),
  };
}

/** Alle Tageseintraege, der jüngste zuerst. */
export function deriveJournalDays(docs: readonly IndexedDoc[]): JournalDay[] {
  const days: JournalDay[] = [];
  for (const doc of docs) {
    if (doc.docType !== 'journal') continue;
    days.push(toJournalDay(doc));
  }
  days.sort((a, b) =>
    a.date === b.date ? a.path.localeCompare(b.path) : a.date < b.date ? 1 : -1,
  );
  return days;
}
