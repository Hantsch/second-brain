/**
 * Die drei Abschnitte eines Tageseintrags (docs/VAULT-FORMAT.md): „Tag" traegt,
 * was passiert ist, „Gespraech" den Coaching-Dialog, „Fakten" das, was der
 * Tagesabschluss herausgezogen und der Mensch bestaetigt hat.
 *
 * Zwei Dinge entscheidet diese Datei, und nur sie:
 *
 * - **Wie die Ueberschrift heisst.** In der Dokumentsprache — der Index kennt
 *   beide Fassungen (`core/index/journal.ts`).
 * - **Welche Ueberschrift benutzt wird, wenn die Datei schon eine hat.** Steht in
 *   der Datei „## Gespräch" und ist die Dokumentsprache inzwischen Englisch, wird
 *   darunter angehaengt und nicht ein zweiter Abschnitt „Conversation" angelegt.
 *   Die Datei des Nutzers gibt den Ton vor, nicht die Einstellung.
 */

import type { DocLanguage } from '@shared/types';
import { SECTION_DAY, SECTION_FACTS } from '@core/capture';
import { fold } from '@core/index/text';
import { findSections } from '@core/vault/sections';

/** Eine ATX-Ueberschrift, wie `core/vault/sections` sie erkennt. */
const HEADING = /^ {0,3}#{1,6}\s/;

/** Welcher der drei Abschnitte gemeint ist. */
export type JournalSectionKind = 'day' | 'dialogue' | 'facts';

/** Die Ueberschriften eines Tageseintrags in einer Sprache. */
export type JournalSections = Record<JournalSectionKind, string>;

/* Die deutschen Namen kommen aus `core/capture/actions` — zwei Fassungen davon
   waeren zwei Fassungen von docs/VAULT-FORMAT.md. */
const HEADINGS: Record<DocLanguage, JournalSections> = {
  de: { day: SECTION_DAY, dialogue: 'Gespräch', facts: SECTION_FACTS },
  en: { day: 'Day', dialogue: 'Conversation', facts: 'Facts' },
};

/**
 * Ueberschriften, die als derselbe Abschnitt gelten — gefaltet verglichen, damit
 * „Gespräch" und „Gespraech" dasselbe treffen.
 */
const ALIASES: Record<JournalSectionKind, readonly string[]> = {
  day: ['tag', 'day'],
  dialogue: ['gespraech', 'conversation'],
  facts: ['fakten', 'facts'],
};

/** Die Ueberschriften in dieser Dokumentsprache. */
export function journalSections(docLanguage: DocLanguage = 'de'): JournalSections {
  return HEADINGS[docLanguage] ?? HEADINGS.de;
}

/** Ist diese Ueberschrift der genannte Abschnitt? */
export function isSectionOf(heading: string, kind: JournalSectionKind): boolean {
  return ALIASES[kind].includes(fold(heading.trim()));
}

/**
 * Die Ueberschrift, unter der angehaengt wird: die vorhandene, wenn es eine gibt,
 * sonst die der Dokumentsprache.
 */
export function sectionIn(
  body: string,
  kind: JournalSectionKind,
  docLanguage: DocLanguage = 'de',
): string {
  const found = findSections(body, 2).find((range) => isSectionOf(range.heading, kind));
  return found?.heading.trim() ?? journalSections(docLanguage)[kind];
}

/** Der Text eines Abschnitts; '' wenn es ihn nicht gibt. Gleichnamige werden verbunden. */
export function sectionText(body: string, kind: JournalSectionKind): string {
  const lines = body.split('\n');
  const parts = findSections(body, 2)
    .filter((range) => isSectionOf(range.heading, kind))
    .map((range) => lines.slice(range.start, range.end).join('\n').trim());
  return parts.filter((part) => part.length > 0).join('\n\n');
}

/**
 * Was der Mensch selbst ueber den Tag geschrieben hat — Grundlage jeder
 * Extraktion und jedes Prompts.
 *
 * Herausgenommen werden „Gespraech" und „Fakten": im Gespraech stehen auch die
 * Saetze des Coachs, und aus denen ein Todo zu ziehen hiesse, die App schlaegt
 * sich selbst vor. „Fakten" ist schon herausgezogen — es zweimal zu lesen
 * verdoppelt jeden Vorschlag.
 *
 * Alles andere bleibt, auch ein Rumpf ohne jede Ueberschrift: eine von Hand
 * geschriebene Datei ist genauso gueltig wie eine von der App angelegte.
 *
 * Ueberschriften selbst fallen weg. Sonst waere ein frisch angelegter, noch leerer
 * Tag „## Tag" — ein Text, der nach etwas aussieht und nichts sagt.
 */
export function dayText(body: string): string {
  const dropped = findSections(body, 2).filter(
    (range) => isSectionOf(range.heading, 'dialogue') || isSectionOf(range.heading, 'facts'),
  );
  const kept = body
    .split('\n')
    .filter((line, at) => {
      if (HEADING.test(line)) return false;
      return !dropped.some((range) => at >= range.headingLine && at < range.end);
    })
    .join('\n');
  return kept.trim();
}
