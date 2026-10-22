/* Gemeinsame Bausteine der Prompts.

   Zwei Sprachen, getrennt: `docLanguage` ist die Sprache, in der Notizen, Titel
   und Wiki-Seiten geschrieben werden. `replyLanguage` ist die Sprache, in der
   das Modell mit dem Nutzer redet. Beides steckt in jedem Prompt ausdrücklich
   drin — sonst antwortet ein Modell in der Sprache der Quelle. */

import type { ChatTurn, DocLanguage, UiLanguage } from '@shared/types';

const LANGUAGE_NAME: Record<string, string> = { de: 'Deutsch', en: 'Englisch' };

/** Anweisung: In dieser Sprache wird geschrieben, was in den Vault wandert. */
export function documentLanguageRule(docLanguage: DocLanguage): string {
  return `Schreibe alle Inhalte, die im Vault gespeichert werden (Titel, Tags, Notizen), auf ${LANGUAGE_NAME[docLanguage] ?? docLanguage}.`;
}

/** Anweisung: In dieser Sprache wird mit dem Nutzer geredet. */
export function replyLanguageRule(replyLanguage: UiLanguage): string {
  return `Antworte dem Nutzer auf ${LANGUAGE_NAME[replyLanguage] ?? replyLanguage}.`;
}

/** Ein Ausschnitt aus dem Vault, mit dem eine Aussage belegt werden kann. */
export interface PromptExcerpt {
  /** Vault-relativer Pfad — genau so muss er in der Antwort zitiert werden. */
  path: string;
  title: string;
  /** Wortwörtlicher Textausschnitt. */
  snippet: string;
}

/** Ausschnitte in eine Form, die das Modell zuverlässig zitieren kann. */
export function formatExcerpts(excerpts: readonly PromptExcerpt[]): string {
  if (excerpts.length === 0) return '(keine Ausschnitte)';
  return excerpts
    .map((excerpt, index) =>
      [
        `--- Ausschnitt ${index + 1} ---`,
        `pfad: ${excerpt.path}`,
        `titel: ${excerpt.title}`,
        excerpt.snippet.trim(),
      ].join('\n'),
    )
    .join('\n\n');
}

/** Baut die Turns und wirft leere Systemzeilen weg. */
export function turns(system: string[], user: string[]): ChatTurn[] {
  return [
    { role: 'system', content: system.filter((line) => line.length > 0).join('\n') },
    { role: 'user', content: user.filter((line) => line.length > 0).join('\n') },
  ];
}

/** Begrenzt einen Eingabetext, damit ein Dump kein Kontextfenster sprengt. */
export function clamp(text: string, max = 8000): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n[…gekürzt]` : trimmed;
}

/**
 * Der weiche Zielwert fuer den gesamten Artefakttext eines Kondensationslaufs —
 * nicht pro Abschnitt (Decision Q3 der Story 037, bestaetigt fuer die Story 044
 * unter D21). Beide Ebenen — Area und Projekt — teilen sich diese eine Zahl, statt
 * je eine eigene zu pflegen, die auseinanderdriften koennte.
 */
export const CONDENSE_SOFT_CAP_WORDS = 2000;
export const CONDENSE_SOFT_CAP_CHARS = 12000;

/**
 * Per-item cap when one input (a note, a todo, a session tail, …) is folded
 * into a condense prompt — independent of the soft cap above, which bounds the
 * *whole* artifact, not what the model gets to see of any one input. Hoisted
 * here (story 044 review fix) so the area and the project prompt use the exact
 * same number instead of two literals that could drift apart; a caller that
 * needs to know how much this cap dropped should compute it against this same
 * constant (see `promptItemsClampedChars` in `condense-project.ts`).
 */
export const CONDENSE_ITEM_CHARS = 1500;

/**
 * Schema of one condensed section — `{ text, sources }` — shared by every level so
 * the reply shape the run's attribution check reads cannot drift between them.
 * `sourcesDescription` is the only part that differs: what a level may cite.
 */
export function condenseSectionSchema(
  description: string,
  sourcesDescription: string,
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'sources'],
    properties: {
      text: { type: 'string', description },
      sources: { type: 'array', items: { type: 'string' }, description: sourcesDescription },
    },
  };
}
