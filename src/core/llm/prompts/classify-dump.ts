/* Einen Dump einordnen: Wohin gehört er, was steht als Todo darin, auf wen wird
   gewartet. Das Ergebnis ist ein Vorschlag, den der Nutzer bestätigt — deshalb
   ist `reason` Pflicht und `confidence` ehrlich zu füllen.

   Die harte Regel dieses Prompts: **nur Ziele aus der mitgegebenen Liste.** Ein
   erfundener Projekt-Slug ist keine Einordnung, sondern eine Halluzination; der
   Aufrufer verwirft sie und nimmt die Heuristik (`core/capture/classify`). */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

export interface ClassifyProjectHint {
  slug: string;
  title: string;
  scope: 'work' | 'private';
  status?: string;
  tags?: readonly string[];
  /** Erster Absatz des Projektstands — daran erkennt das Modell den Bezug. */
  excerpt?: string;
}

/** Ein Wissens-Modul. Als reiner Slug oder mit Titel und Beschreibung. */
export type ClassifyModuleHint = string | { slug: string; title?: string; description?: string };

export interface ClassifyDumpInput {
  text: string;
  /** Heutiges Datum als YYYY-MM-DD — Grundlage für „morgen", „nächste Woche". */
  today: string;
  projects?: readonly ClassifyProjectHint[];
  /** Wissens-Module. */
  modules?: readonly ClassifyModuleHint[];
  /** Bereichs-Slugs unter `areas/`. */
  areas?: readonly string[];
  knownTags?: readonly string[];
}

/**
 * Kernfelder eines `FilingProposal`. Der Aufbau der eigentlichen `FilingAction`
 * (Pfade, Abschnitte) passiert in `core/capture` — das Modell entscheidet nur
 * über Ziel und Inhalt, nicht über Dateinamen.
 */
export const CLASSIFY_DUMP_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'scope', 'tags', 'target', 'reason', 'confidence'],
  properties: {
    title: { type: 'string', description: 'Sachlicher Titel des Inhalts.' },
    scope: { type: 'string', enum: ['work', 'private'] },
    tags: { type: 'array', items: { type: 'string' } },
    target: {
      type: 'string',
      enum: ['project', 'journal', 'area', 'module', 'new-project', 'inbox'],
      description: 'Wohin der Dump gehört.',
    },
    targetKey: {
      type: 'string',
      description:
        'Projekt-Slug, Modul-Slug oder Bereichs-Slug — wortwörtlich aus der Liste. ' +
        'Bei journal, inbox und new-project leer.',
    },
    newProjectTitle: {
      type: 'string',
      description: 'Nur bei target=new-project: Titel des vorgeschlagenen Projekts.',
    },
    section: {
      type: 'string',
      description: 'Abschnitt in der Zieldatei, z. B. Notizen, Stand oder Todos.',
    },
    reason: { type: 'string', description: 'Ein Satz, warum dieses Ziel.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    todos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: { type: 'string' },
          due: { type: ['string', 'null'], description: 'YYYY-MM-DD oder null.' },
          waitingFor: { type: ['string', 'null'] },
          priority: { type: 'integer', minimum: 0, maximum: 3 },
          project: { type: ['string', 'null'], description: 'Projekt-Slug oder null.' },
        },
      },
    },
    waitingOn: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['who', 'what'],
        properties: {
          who: { type: 'string' },
          what: { type: 'string' },
          due: { type: ['string', 'null'], description: 'YYYY-MM-DD oder null.' },
        },
      },
    },
    entities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Personen, Werkzeuge, Begriffe — Kandidaten für Wiki-Seiten.',
    },
  },
};

/** Ein Projekt in einer Zeile: Slug zuerst, damit die Antwort ihn abschreiben kann. */
function projectLine(project: ClassifyProjectHint): string {
  const meta = [project.scope, project.status].filter((part) => part !== undefined).join(', ');
  const tags = project.tags && project.tags.length > 0 ? ` [${project.tags.join(', ')}]` : '';
  const excerpt = project.excerpt && project.excerpt.length > 0 ? `\n  ${project.excerpt}` : '';
  return `- ${project.slug} (${meta}): ${project.title}${tags}${excerpt}`;
}

function moduleLine(module: ClassifyModuleHint): string {
  if (typeof module === 'string') return `- ${module}`;
  const title = module.title === undefined ? '' : `: ${module.title}`;
  const description = module.description === undefined ? '' : ` — ${module.description}`;
  return `- ${module.slug}${title}${description}`;
}

export function classifyDumpPrompt(input: ClassifyDumpInput, docLanguage: DocLanguage): ChatTurn[] {
  const projects = input.projects ?? [];
  const modules = input.modules ?? [];
  const areas = input.areas ?? [];

  return turns(
    [
      'Du ordnest einen rohen Gedanken in ein persönliches Second Brain ein.',
      documentLanguageRule(docLanguage),
      `Heute ist ${input.today}. Rechne relative Fristen („morgen", „bis Freitag") in YYYY-MM-DD um.`,
      'Wähle ein bestehendes Projekt, wenn der Text erkennbar dazugehört. Lege ein neues Projekt nur vor, wenn es um ein klar abgegrenztes Vorhaben mit Ziel geht.',
      'Gehört der Text zu keinem Projekt, aber zu einem Tag (Erlebtes, Stimmung, Gespräch), ist das Journal das Ziel.',
      'Ist der Text eine Quelle oder Wissen über ein Thema, ist ein Modul das Ziel.',
      'targetKey ist immer ein Slug aus den Listen unten, wortwörtlich abgeschrieben. Steht ein Ziel nicht in der Liste, gibt es es nicht — dann wähle inbox.',
      'Bist du unsicher, wähle inbox und setze confidence unter 0.5.',
      'Erfinde keine Projekte, Module, Bereiche, Personen oder Fristen, die nicht im Text oder in den Listen stehen.',
      'reason ist ein Satz und nennt den Grund, nicht den Inhalt.',
      input.knownTags && input.knownTags.length > 0
        ? `Vorhandene Tags: ${input.knownTags.slice(0, 40).join(', ')}. Benutze sie bevorzugt.`
        : '',
    ],
    [
      'Projekte:',
      projects.length > 0 ? projects.map(projectLine).join('\n') : '- (keine Projekte vorhanden)',
      '',
      'Module:',
      modules.length > 0 ? modules.map(moduleLine).join('\n') : '- (keine)',
      '',
      `Bereiche: ${areas.join(', ') || '(keine)'}`,
      '',
      'Dump:',
      clamp(input.text),
    ],
  );
}
