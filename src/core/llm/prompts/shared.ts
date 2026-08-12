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
