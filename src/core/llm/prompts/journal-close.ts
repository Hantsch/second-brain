/* The day close, second part: what the day says about people, projects, and
   mood.

   Todos are pulled by `extract-tasks` (its own file, also used by filing) —
   this is only about the fields that live in the journal entry's
   frontmatter: `people`, `projects`, `mood`, `energy`, `tags`.

   Two hard rules, because this becomes a suggestion against the user's
   journal:

   - **Only what's there.** No person who isn't mentioned; no project outside
     the given list; no mood the text doesn't support (then null).
   - **No interpretation.** The number describes what the user wrote, not how
     they're doing according to the model's opinion. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

export interface JournalCloseInput {
  /** The journal entry — only what the human themself wrote. */
  text: string;
  /** Calendar day of the entry (YYYY-MM-DD). */
  date: string;
  /** Project slugs that may be assigned. Anything else is made up. */
  projects?: readonly { slug: string; title: string }[];
  /** Area slugs that may be assigned. Anything else is made up. */
  areas?: readonly { slug: string; title: string }[];
  /** People already appearing in the vault — so spelling stays consistent. */
  people?: readonly string[];
  /** Tags in common use in the vault. */
  tags?: readonly string[];
}

/** Expected response shape. Sent along as `schema`. */
export const JOURNAL_CLOSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['people', 'projects', 'areas'],
  properties: {
    people: {
      type: 'array',
      items: { type: 'string' },
      description: 'Namen von Menschen, die im Text vorkommen. Keine Firmen, keine Systeme.',
    },
    projects: {
      type: 'array',
      items: { type: 'string' },
      description: 'Projekt-Slugs aus der Liste, die der Text berührt.',
    },
    areas: {
      type: 'array',
      items: { type: 'string' },
      description: 'Bereichs-Slugs aus der Liste, die der Text berührt.',
    },
    mood: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: 5,
      description: '1 = sehr schlechter Tag, 5 = sehr guter Tag. null, wenn der Text nichts sagt.',
    },
    energy: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: 5,
      description: '1 = erschöpft, 5 = voller Kraft. null, wenn der Text nichts sagt.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Höchstens drei kurze Schlagworte, klein geschrieben, ohne Raute.',
    },
  },
};

export function journalClosePrompt(input: JournalCloseInput, docLanguage: DocLanguage): ChatTurn[] {
  const projects = input.projects ?? [];
  const areas = input.areas ?? [];
  const people = input.people ?? [];
  const tags = input.tags ?? [];
  return turns(
    [
      'Du liest einen Tagebucheintrag und trägst nach, was er über Personen, Projekte und Befinden sagt.',
      documentLanguageRule(docLanguage),
      `Der Eintrag ist vom ${input.date}.`,
      'people sind Menschen, die im Text genannt werden — mit der Schreibweise aus dem Text. Keine Firmen, keine Werkzeuge, keine Systeme.',
      projects.length > 0
        ? `Zulässige Projekt-Slugs: ${projects.map((project) => project.slug).join(', ')}. Andere Werte sind nicht erlaubt.`
        : 'Es gibt keine Projekte; projects bleibt leer.',
      areas.length > 0
        ? `Zulässige Bereichs-Slugs: ${areas.map((area) => area.slug).join(', ')}. Andere Werte sind nicht erlaubt.`
        : 'Es gibt keine Bereiche; areas bleibt leer.',
      'mood und energy sind Zahlen von 1 bis 5 und beschreiben, was der Text sagt — nicht, was du vermutest. Sagt der Text nichts, ist der Wert null.',
      'energy meint Kraft und Wachheit (müde, ausgelaugt, voller Energie), mood die Stimmung. Beides kann unabhängig voneinander fehlen.',
      'Keine Diagnose, keine Deutung, kein Rat. Du trägst nach, du beurteilst nicht.',
      'Höchstens drei tags, klein geschrieben, ohne Raute. Keine Tags erfinden, die der Text nicht hergibt.',
      'Findest du nichts, gib leere Listen und null zurück.',
    ],
    [
      projects.length > 0
        ? `Projekte:\n${projects.map((project) => `- ${project.slug}: ${project.title}`).join('\n')}\n`
        : '',
      areas.length > 0
        ? `Bereiche:\n${areas.map((area) => `- ${area.slug}: ${area.title}`).join('\n')}\n`
        : '',
      people.length > 0 ? `Bekannte Personen: ${people.join(', ')}\n` : '',
      tags.length > 0 ? `Gebräuchliche Tags: ${tags.join(', ')}\n` : '',
      'Eintrag:',
      clamp(input.text, 6000),
    ],
  );
}
