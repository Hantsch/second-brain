/**
 * Der Einzeiler, mit dem eine Seite in `wiki/index.md` steht.
 *
 * Er wird **abgeleitet, nicht erfunden**: er ist der erste Satz des ersten
 * Absatzes der Seite (`excerpt` aus `core/vault/doc`, also ohne Auszeichnung und
 * ohne Belegklammern). Damit steht im Katalog nichts, was nicht auf der Seite
 * steht — und die Vorschau eines Fixes zeigt genau die Zeile, die geschrieben wird.
 *
 * Einen von Hand geschriebenen Einzeiler ueberschreibt das nie: `upsertEntries`
 * ersetzt eine bestehende Zeile nur, wenn ein neuer Einzeiler mitkommt, und
 * angeboten wird der Fix nur fuer fehlende Eintraege und fuer Eintraege ganz ohne
 * Einzeiler.
 */

import type { WikiPageType } from '@shared/types';
import { collapse } from '@core/index/text';
import { excerpt } from '@core/vault/doc';
import { entryLine } from '@core/wiki';
import type { WikiIndexEntry } from '@core/wiki';

/** Laenge eines Einzeilers. Was laenger ist, ist keine Zeile mehr. */
export const MAX_SUMMARY_CHARS = 100;

/** Erster Satz eines Ausschnitts, auf Katalogmass gekuerzt. */
export function catalogSummary(text: string): string {
  const clean = collapse(text);
  if (clean.length === 0) return '';
  const stop = /[.!?](\s|$)/.exec(clean);
  const sentence = stop === null ? clean : clean.slice(0, stop.index);
  if (sentence.length <= MAX_SUMMARY_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_SUMMARY_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > MAX_SUMMARY_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/** Einzeiler aus einem Seitenrumpf — der Weg beim Ausfuehren des Fixes. */
export function summaryOfBody(body: string): string {
  return catalogSummary(excerpt(body, 400));
}

/** Der Katalogeintrag einer Seite. */
export function catalogEntry(page: {
  slug: string;
  type: WikiPageType;
  summary: string;
}): WikiIndexEntry {
  return { type: page.type, slug: page.slug, summary: catalogSummary(page.summary) };
}

/** Die Zeile, die im Katalog stehen wuerde — die Vorschau eines Fixes. */
export function catalogLine(page: { slug: string; type: WikiPageType; summary: string }): string {
  return entryLine(catalogEntry(page));
}
