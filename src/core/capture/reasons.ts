/**
 * Begruendungssaetze der Heuristik in der Dokumentsprache.
 *
 * Mirrors the `phrases()` pattern in `src/core/wiki/text.ts`: one table per
 * language, selected by `reasons()`. The German entries are copied verbatim from
 * what used to be hardcoded in `heuristic.ts` — byte-identical, straight `"`
 * quotes, `und`, `am 15.08.` — so today's output does not shift. The English
 * entries are new phrasing for the same structure; they never contain U+201E
 * (CLAUDE.md guardrail 7).
 */

import type { DocLanguage } from '@shared/types';

/** Alle Bausteine, aus denen `decide()`/`withDate()` eine Begruendung bauen. */
export interface ReasonPhrases {
  /** `<clause>.` ohne Termin. */
  withoutDate: (clause: string) => string;
  /** `<clause> und einen Termin am <date>` mit Termin. */
  withDate: (clause: string, date: string) => string;
  /** Klausel vor `withDate`/`withoutDate`: 'Erwähnt "X"'. */
  mentionsClause: (matched: string) => string;
  /** Klausel vor `withDate`/`withoutDate`: 'Erwähnt "X" aus einem laufenden Bereich'. */
  areaMentionClause: (matched: string) => string;
  /** Gefuehlsworte im Text, kein Projektbezug. */
  moodWords: (words: string) => string;
  /** Link plus passendes Modul. */
  linkWithModule: (host: string, title: string) => string;
  /** Link ohne passendes Modul. */
  linkWithoutModule: (host: string) => string;
  /** Nichts trifft — bleibt im Inbox liegen. */
  noMatch: string;
}

const DE: ReasonPhrases = {
  withoutDate: (clause) => `${clause}.`,
  withDate: (clause, date) => `${clause} und einen Termin am ${date}`,
  mentionsClause: (matched) => `Erwähnt "${matched}"`,
  areaMentionClause: (matched) => `Erwähnt "${matched}" aus einem laufenden Bereich`,
  moodWords: (words) => `Enthält Gefühlsworte (${words}) und keinen Projektbezug.`,
  linkWithModule: (host, title) => `Enthält einen Link (${host}) und passt zum Modul "${title}".`,
  linkWithoutModule: (host) => `Enthält einen Link (${host}), aber kein Modul, in das er gehört.`,
  noMatch: 'Kein Projektbezug, kein Tagesbezug und keine Quelle erkennbar — bleibt liegen.',
};

const EN: ReasonPhrases = {
  withoutDate: (clause) => `${clause}.`,
  withDate: (clause, date) => `${clause} and a date on ${date}`,
  mentionsClause: (matched) => `Mentions "${matched}"`,
  areaMentionClause: (matched) => `Mentions "${matched}" from an active area`,
  moodWords: (words) => `Contains mood words (${words}) and no project reference.`,
  linkWithModule: (host, title) => `Contains a link (${host}) and matches the module "${title}".`,
  linkWithoutModule: (host) => `Contains a link (${host}), but no module it belongs to.`,
  noMatch:
    'No project reference, no day reference and no source recognizable — stays in the inbox.',
};

/** Begruendungsbausteine in der Dokumentsprache. Unbekannte Sprachen fallen auf Deutsch zurueck. */
export function reasons(language: DocLanguage = 'de'): ReasonPhrases {
  return language === 'en' ? EN : DE;
}
