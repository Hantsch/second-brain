/* Filing a dump: where it belongs, what todos it contains, who it's waiting
   on. The result is a proposal the user confirms — that's why `reason` is
   mandatory and `confidence` must be filled in honestly.

   The hard rule of this prompt: **only targets from the given list.** A
   made-up project slug isn't a filing decision, it's a hallucination; the
   caller discards it and falls back to the heuristic (`core/capture/classify`). */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

export interface ClassifyProjectHint {
  slug: string;
  title: string;
  scope: 'work' | 'private';
  status?: string;
  tags?: readonly string[];
  /** First paragraph of the project status — this is how the model recognizes the connection. */
  excerpt?: string;
}

/** A knowledge module. Either a plain slug or with title and description. */
export type ClassifyModuleHint = string | { slug: string; title?: string; description?: string };

export interface ClassifyDumpInput {
  text: string;
  /** Today's date as YYYY-MM-DD — basis for "tomorrow", "next week". */
  today: string;
  projects?: readonly ClassifyProjectHint[];
  /** Knowledge modules. */
  modules?: readonly ClassifyModuleHint[];
  /** Area slugs under `areas/`. */
  areas?: readonly string[];
  knownTags?: readonly string[];
}

/**
 * Core fields of a `FilingProposal`. Building the actual `FilingAction`
 * (paths, sections) happens in `core/capture` — the model only decides on
 * target and content, not on file names.
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

/** A project in one line: slug first, so the answer can copy it verbatim. */
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
