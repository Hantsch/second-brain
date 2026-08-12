/* Der Tagesabschluss, zweiter Teil: was der Tag über Personen, Projekte und
   Stimmung sagt.

   Die Aufgaben zieht `extract-tasks` (eigene Datei, auch vom Einordnen benutzt) —
   hier geht es nur um die Felder, die im Frontmatter des Tageseintrags stehen:
   `people`, `projects`, `mood`, `energy`, `tags`.

   Zwei harte Regeln, weil daraus ein Vorschlag am Tagebuch des Nutzers wird:

   - **Nur was dasteht.** Keine Person, die nicht genannt ist; kein Projekt außer
     denen aus der Liste; keine Stimmung, die der Text nicht hergibt (dann null).
   - **Keine Deutung.** Die Zahl beschreibt, was der Nutzer geschrieben hat, nicht
     wie es ihm nach Meinung des Modells geht. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

export interface JournalCloseInput {
  /** Der Tageseintrag — nur was der Mensch selbst geschrieben hat. */
  text: string;
  /** Kalendertag des Eintrags (YYYY-MM-DD). */
  date: string;
  /** Projekt-Slugs, die zugeordnet werden dürfen. Alles andere ist erfunden. */
  projects?: readonly { slug: string; title: string }[];
  /** Personen, die im Vault schon vorkommen — damit die Schreibweise gleich bleibt. */
  people?: readonly string[];
  /** Tags, die im Vault gebräuchlich sind. */
  tags?: readonly string[];
}

/** Erwartete Antwortform. Wird als `schema` mitgeschickt. */
export const JOURNAL_CLOSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['people', 'projects'],
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
      people.length > 0 ? `Bekannte Personen: ${people.join(', ')}\n` : '',
      tags.length > 0 ? `Gebräuchliche Tags: ${tags.join(', ')}\n` : '',
      'Eintrag:',
      clamp(input.text, 6000),
    ],
  );
}
