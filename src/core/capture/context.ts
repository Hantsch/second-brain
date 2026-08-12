/**
 * Der Entscheidungskontext einer Einordnung: welche Projekte, Bereiche und Module
 * es gibt, welche Tags gebraeuchlich sind, welcher Tag heute ist.
 *
 * Der Kontext muss **klein** bleiben. Er wandert in einen Prompt, und jedes
 * ueberzaehlige Projekt kostet Tokens, die dem eigentlichen Text fehlen. Deshalb:
 * harte Obergrenzen, gekuerzte Ausschnitte — und `narrowContext`, das per
 * Volltextsuche die thematisch naechsten Kandidaten vorsortiert, statt alles
 * mitzuschicken.
 */

import type {
  KnowledgeModule,
  Project,
  ProjectStatus,
  Scope,
  SearchHit,
  SearchQuery,
} from '@shared/types';
import { collapse } from '@core/index/text';
import type { IndexedDoc } from '@core/index/types';
import { excerpt } from '@core/vault/doc';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';

/** Hoechstzahl an Projekten im vollen Kontext. */
export const MAX_PROJECTS = 40;
/** Hoechstzahl an Modulen im vollen Kontext. */
export const MAX_MODULES = 40;
/** Hoechstzahl an Tags, die als Vorschlagsliste mitgehen. */
export const MAX_TAGS = 30;
/** Laenge eines Projekt-Ausschnitts in Zeichen. */
export const EXCERPT_CHARS = 200;
/** So viele Kandidaten reichen dem Modell, wenn vorsortiert wurde. */
export const NEAREST_LIMIT = 8;
/** So viel Dumptext geht in die Volltextsuche — mehr verwaessert die Anfrage. */
const SEARCH_CHARS = 400;
/** So viele Treffer reichen, um eine Reihenfolge zu bilden. */
const SEARCH_HITS = 30;

/** Ein Projekt als Ablageziel. */
export interface ProjectCandidate {
  slug: string;
  title: string;
  /** Pfad der Projektdatei, vault-relativ. */
  path: string;
  scope: Scope;
  status: ProjectStatus;
  tags: string[];
  /** Wiedereinstiegspunkt, auf `EXCERPT_CHARS` gekuerzt. */
  excerpt: string;
}

/** Ein Bereich (`areas/<slug>.md`) als Ablageziel. */
export interface AreaCandidate {
  slug: string;
  title: string;
  path: string;
}

/** Ein Wissens-Modul als Ablageziel. */
export interface ModuleCandidate {
  slug: string;
  title: string;
  description: string;
}

/** Alles, was eine Einordnung ueber den Vault wissen muss. */
export interface FilingContext {
  /** Heutiger Kalendertag — Grundlage jeder relativen Frist. */
  today: string;
  projects: ProjectCandidate[];
  areas: AreaCandidate[];
  modules: ModuleCandidate[];
  /** Die haeufigsten Tags im Vault, haeufigste zuerst. */
  tags: string[];
}

/**
 * Was der Kontextaufbau am Index braucht — eine schmale Sicht, die `IndexService`
 * strukturell erfuellt. Damit bleibt der Capture-Kern ohne Wissen ueber den
 * Indexdienst testbar.
 */
export interface CaptureIndex {
  projects(): readonly Project[];
  modules(): readonly KnowledgeModule[];
  /** Der abgeleitete Zustand; Bereiche und Tags stehen in den Dokumenten. */
  index(): { docs: readonly IndexedDoc[] };
  search(query: SearchQuery): SearchHit[];
}

export interface FilingContextOptions {
  /** Das „jetzt". Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: DateLike;
  /**
   * Der Text, um den es geht. Ist er gesetzt, entscheidet die Volltextsuche,
   * welche Projekte die begrenzten Plaetze bekommen — sonst die juengste Spur.
   * Ohne das faellt bei einem grossen Vault genau das passende Projekt aus dem
   * Kontext, nur weil zuletzt woanders gearbeitet wurde.
   */
  text?: string;
  maxProjects?: number;
  maxModules?: number;
  maxTags?: number;
}

/** Abgeschlossene Projekte sind kein Ziel fuer einen neuen Gedanken. */
const CLOSED: readonly ProjectStatus[] = ['done', 'dropped'];

function toProjectCandidate(project: Project): ProjectCandidate {
  return {
    slug: project.slug,
    title: project.title,
    path: project.path,
    scope: project.scope,
    status: project.status,
    tags: project.tags,
    excerpt: excerpt(project.excerpt, EXCERPT_CHARS),
  };
}

function areaCandidates(docs: readonly IndexedDoc[]): AreaCandidate[] {
  const areas: AreaCandidate[] = [];
  for (const doc of docs) {
    if (doc.docType !== 'area') continue;
    const name = doc.path.split('/').pop() ?? doc.path;
    areas.push({ slug: name.replace(/\.md$/i, ''), title: doc.title, path: doc.path });
  }
  areas.sort((a, b) => a.slug.localeCompare(b.slug));
  return areas;
}

function toModuleCandidate(module: KnowledgeModule): ModuleCandidate {
  return {
    slug: module.slug,
    title: module.title,
    description: excerpt(module.description, EXCERPT_CHARS),
  };
}

/** Tags nach Haeufigkeit — was der Vault schon benutzt, soll wiederverwendet werden. */
function frequentTags(docs: readonly IndexedDoc[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const tag of doc.tags) {
      const key = tag.trim().toLowerCase();
      if (key.length === 0) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

/** Aus einem Trefferpfad den Projekt-Slug ziehen: `projects/<scope>/<slug>/...`. */
function projectOf(path: string): string | null {
  const match = /^projects\/[^/]+\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

/** Aus einem Trefferpfad den Modul-Slug ziehen: `modules/<slug>/...`. */
function moduleOf(path: string): string | null {
  const match = /^modules\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

/** Projekt- und Modul-Slugs in der Reihenfolge, in der die Suche sie fand. */
function rankBySearch(
  index: CaptureIndex,
  text: string,
): { projects: string[]; modules: string[] } {
  const query = collapse(text).slice(0, SEARCH_CHARS);
  const projects: string[] = [];
  const modules: string[] = [];
  if (query.length === 0) return { projects, modules };
  for (const hit of index.search({ text: query, limit: SEARCH_HITS })) {
    const project = projectOf(hit.path);
    if (project !== null && !projects.includes(project)) projects.push(project);
    const module = moduleOf(hit.path);
    if (module !== null && !modules.includes(module)) modules.push(module);
  }
  return { projects, modules };
}

/**
 * Der volle Kontext: offene Projekte (bis `maxProjects`), Bereiche, Module,
 * haeufige Tags, heutiges Datum. Mit `text` entscheidet die Volltextsuche ueber
 * die Reihenfolge, sonst die juengste Spur.
 */
export function buildFilingContext(
  index: CaptureIndex,
  options: FilingContextOptions = {},
): FilingContext {
  const docs = index.index().docs;
  const open = index
    .projects()
    .filter((project) => !CLOSED.includes(project.status))
    .map(toProjectCandidate);
  const modules = index.modules().map(toModuleCandidate);
  const ranked = rankBySearch(index, options.text ?? '');

  return {
    today: isoDay(options.now ?? new Date()),
    projects: reorder(open, (project) => project.slug, ranked.projects).slice(
      0,
      options.maxProjects ?? MAX_PROJECTS,
    ),
    areas: areaCandidates(docs),
    modules: reorder(modules, (module) => module.slug, ranked.modules).slice(
      0,
      options.maxModules ?? MAX_MODULES,
    ),
    tags: frequentTags(docs, options.maxTags ?? MAX_TAGS),
  };
}

/** Reihenfolge nach Suchtreffern, dann der Rest — Bekanntes verschwindet nicht. */
function reorder<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  ranked: readonly string[],
): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const result: T[] = [];
  for (const key of ranked) {
    const item = byKey.get(key);
    if (item !== undefined && !result.includes(item)) result.push(item);
  }
  for (const item of items) if (!result.includes(item)) result.push(item);
  return result;
}

/**
 * Den Kontext auf die thematisch naechsten Kandidaten eindampfen.
 *
 * Die Volltextsuche entscheidet, was „nah" heisst: was der Dump anspricht, steht
 * in denselben Woertern in der Projektdatei. Bleiben Treffer aus, gewinnt die
 * juengste Spur — der Kontext ist dann nicht schlechter als vorher, nur kleiner.
 */
export function narrowContext(
  index: CaptureIndex,
  context: FilingContext,
  text: string,
  limit = NEAREST_LIMIT,
): FilingContext {
  const ranked = rankBySearch(index, text);
  return {
    ...context,
    projects: reorder(context.projects, (project) => project.slug, ranked.projects).slice(0, limit),
    modules: reorder(context.modules, (module) => module.slug, ranked.modules).slice(0, limit),
  };
}

/** Ein Projekt im Kontext, oder `null`. */
export function findProject(context: FilingContext, slug: string | null): ProjectCandidate | null {
  if (slug === null) return null;
  return context.projects.find((project) => project.slug === slug) ?? null;
}

/** Ein Modul im Kontext, oder `null`. */
export function findModule(context: FilingContext, slug: string | null): ModuleCandidate | null {
  if (slug === null) return null;
  return context.modules.find((module) => module.slug === slug) ?? null;
}

/** Ein Bereich im Kontext, oder `null`. */
export function findArea(context: FilingContext, slug: string | null): AreaCandidate | null {
  if (slug === null) return null;
  return context.areas.find((area) => area.slug === slug) ?? null;
}
