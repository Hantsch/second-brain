/* Title and tags for a text. The cheapest task in the app: one sentence of output. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

export interface TitleTagsInput {
  text: string;
  /** Tags already used in the vault — prefer reusing these over inventing new ones. */
  knownTags?: readonly string[];
  /** Maximum number of tags (default 4). */
  maxTags?: number;
}

/** Expected response shape. Sent along as `schema`. */
export const TITLE_TAGS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'tags'],
  properties: {
    title: { type: 'string', description: 'Kurzer, sachlicher Titel, höchstens 60 Zeichen.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Kleingeschriebene Schlagwörter ohne Rautezeichen.',
    },
  },
};

export function titleTagsPrompt(input: TitleTagsInput, docLanguage: DocLanguage): ChatTurn[] {
  const maxTags = input.maxTags ?? 4;
  const known = input.knownTags ?? [];
  return turns(
    [
      'Du benennst Notizen für ein persönliches Wissensarchiv.',
      documentLanguageRule(docLanguage),
      `Der Titel ist eine Aussage, kein Etikett: sachlich, ohne Vorsilben wie "Notiz über", höchstens 60 Zeichen.`,
      `Höchstens ${maxTags} Tags, kleingeschrieben, ohne Rautezeichen.`,
      known.length > 0
        ? `Benutze bevorzugt vorhandene Tags: ${known.slice(0, 40).join(', ')}.`
        : '',
      'Erfinde nichts, was nicht im Text steht.',
    ],
    ['Text:', clamp(input.text, 4000)],
  );
}
