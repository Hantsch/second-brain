/**
 * Wer im Text vorkommt: Projekte, Module, Bereiche.
 *
 * Getroffen wird der ganze Titel, der Slug, einzelne tragende Titelwoerter (auch
 * gebeugt — 'Kundenportals' zaehlt) und Projekt-Tags. Ein Treffer wiegt so viel,
 * wie er wert ist: ein voller Titel mehr als ein Tag.
 *
 * Warum eigene Datei: das Erkennen ist eine Frage („kommt es vor?"), das
 * Einordnen eine andere („wohin dann?"). Beide getrennt zu pruefen ist einfacher.
 */

import { escapeRegExp, fold } from '@core/index/text';
import type { AreaCandidate, FilingContext, ModuleCandidate, ProjectCandidate } from './context';
import { anyWordRegex, hasMatch, matchAll, wordRegex } from './words';

/** Kurze Woerter taugen nicht als Projektbezug — 'der Relaunch' waere jeder. */
const MIN_TITLE_WORD = 5;
/** Kuerzere Tags treffen zu viel. */
const MIN_TAG = 4;

/** Woerter, die in jedem zweiten Projekttitel stehen. */
const TITLE_STOPWORDS = new Set([
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'fuer',
  'und',
  'mit',
  'von',
  'zum',
  'zur',
  'neue',
  'neuer',
  'neues',
  'projekt',
]);

/** Wie schwer ein Treffer wiegt. */
export const MENTION_WEIGHT = { title: 3, slug: 3, word: 2, tag: 1 } as const;

/** Ein Projekt, das im Text vorkommt, samt der Stelle, die dafuer spricht. */
export interface ProjectMention {
  project: ProjectCandidate;
  /** Wortwoertlich, was getroffen wurde — Grundlage der Begruendung. */
  matched: string;
  score: number;
}

/** Ein Bereich, der im Text vorkommt. */
export interface AreaMention {
  area: AreaCandidate;
  matched: string;
}

/** Bedeutungstragende Woerter eines Titels. */
function titleWords(title: string): string[] {
  return title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_TITLE_WORD && !TITLE_STOPWORDS.has(fold(word)));
}

/** Slug als Wortfolge: 'kundenportal-relaunch' trifft auch 'Kundenportal Relaunch'. */
function slugRegex(slug: string): RegExp {
  return wordRegex(slug.split('-').map(escapeRegExp).join('[\\s-]+'));
}

/** Erster Treffer eines Musters, oder `null`. */
function firstHit(pattern: RegExp, text: string): string | null {
  return matchAll(pattern, text)[0]?.text ?? null;
}

/** Alle Projekte, die im Text vorkommen — das staerkste zuerst. */
export function findProjectMentions(
  text: string,
  projects: readonly ProjectCandidate[],
): ProjectMention[] {
  const mentions: ProjectMention[] = [];
  for (const project of projects) {
    let score = 0;
    let matched: string | null = null;

    const full = firstHit(wordRegex(escapeRegExp(project.title)), text);
    if (full !== null) {
      score += MENTION_WEIGHT.title;
      matched = full;
    }
    const slug = firstHit(slugRegex(project.slug), text);
    if (slug !== null) {
      score += MENTION_WEIGHT.slug;
      matched ??= slug;
    }
    for (const word of titleWords(project.title)) {
      const hit = firstHit(anyWordRegex([escapeRegExp(word)]), text);
      if (hit === null) continue;
      score += MENTION_WEIGHT.word;
      matched ??= hit;
    }
    for (const tag of project.tags) {
      if (tag.length < MIN_TAG) continue;
      const hit = firstHit(anyWordRegex([escapeRegExp(tag)]), text);
      if (hit === null) continue;
      score += MENTION_WEIGHT.tag;
      matched ??= hit;
    }

    if (score > 0 && matched !== null) mentions.push({ project, matched, score });
  }
  mentions.sort((a, b) => b.score - a.score);
  return mentions;
}

/**
 * Modul, dessen Slug oder Titel im Text vorkommt. Gibt es genau ein Modul, ist es
 * das Ziel auch ohne Namensnennung — bei einem einzigen Wiki gibt es keine Wahl.
 */
export function findModuleMention(
  text: string,
  modules: readonly ModuleCandidate[],
): ModuleCandidate | null {
  for (const module of modules) {
    if (hasMatch(slugRegex(module.slug), text)) return module;
    if (hasMatch(wordRegex(escapeRegExp(module.title)), text)) return module;
  }
  return modules.length === 1 ? (modules[0] ?? null) : null;
}

/** Bereich, dessen Titel oder Slug im Text vorkommt. */
export function findAreaMention(text: string, context: FilingContext): AreaMention | null {
  for (const area of context.areas) {
    const matched =
      firstHit(wordRegex(escapeRegExp(area.title)), text) ?? firstHit(slugRegex(area.slug), text);
    if (matched !== null) return { area, matched };
  }
  return null;
}

/** Tags, die der Vault schon benutzt und die im Text vorkommen. */
export function findKnownTags(text: string, known: readonly string[], limit = 4): string[] {
  const found: string[] = [];
  for (const tag of known) {
    if (tag.length < 3) continue;
    if (hasMatch(anyWordRegex([escapeRegExp(tag)]), text)) found.push(tag);
    if (found.length >= limit) break;
  }
  return found;
}
