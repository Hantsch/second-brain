/**
 * Wissens-Module: ein Modul ist ein Ordner `modules/<slug>/` mit einem eigenen
 * kleinen Wiki. Die Liste hier ist abgeleitet — Seitenzahlen kommen aus dem
 * Seitengraph, `lastIngest` aus den Rohquellen.
 *
 * `findingCount` bleibt 0, solange kein Pflegelauf gelaufen ist: die Zahl sagt
 * „keine bekannten Befunde", nicht „geprüft und sauber".
 */

import type { KnowledgeModule, RawSource } from '@shared/types';
import { excerpt } from '@core/vault/doc';
import { laterOf } from './dates';
import { asStringList, asText } from './text';
import type { IndexedDoc, ModulePageCounts } from './types';

const EMPTY_COUNTS: ModulePageCounts = { sources: 0, entities: 0, concepts: 0 };

/** `modules/<slug>/module.md` → Slug, sonst null. */
function moduleFileSlug(path: string): string | null {
  const match = /^modules\/([^/]+)\/module\.md$/.exec(path);
  return match?.[1] ?? null;
}

/** Slug lesbar machen, wenn kein `module.md` einen Titel nennt. */
function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.length === 0 ? slug : words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ModuleDerivationOptions {
  /** Seitenzahlen je Modul, wie `derivePages` sie liefert. */
  counts?: ReadonlyMap<string, ModulePageCounts>;
  /** Rohquellen; ihr jüngster Zeitpunkt wird `lastIngest`. */
  sources?: readonly RawSource[];
}

/**
 * Alle Module, alphabetisch nach Titel. Ein Modul zaehlt, sobald irgendetwas
 * unter `modules/<slug>/` liegt — auch ohne `module.md`, damit ein von Hand
 * angelegtes Wiki nicht unsichtbar bleibt.
 */
export function deriveModules(
  docs: readonly IndexedDoc[],
  options: ModuleDerivationOptions = {},
): KnowledgeModule[] {
  const files = new Map<string, IndexedDoc>();
  const slugs = new Set<string>(options.counts?.keys() ?? []);
  const touched = new Map<string, string>();

  for (const doc of docs) {
    const fileSlug = moduleFileSlug(doc.path);
    if (fileSlug !== null) files.set(fileSlug, doc);
    if (doc.module === null) continue;
    slugs.add(doc.module);
    const known = touched.get(doc.module) ?? null;
    touched.set(doc.module, laterOf(known, doc.updated) ?? doc.updated);
  }

  const ingest = new Map<string, string>();
  for (const source of options.sources ?? []) {
    for (const slug of source.modules) {
      const known = ingest.get(slug) ?? null;
      ingest.set(slug, laterOf(known, source.ingestedAt) ?? source.ingestedAt);
    }
  }

  const modules: KnowledgeModule[] = [];
  for (const slug of slugs) {
    const doc = files.get(slug) ?? null;
    const updated = touched.get(slug) ?? doc?.updated ?? '';
    modules.push({
      slug,
      title: doc?.title ?? titleFromSlug(slug),
      description:
        asText(doc?.frontmatter['description']) ??
        (doc === null ? '' : excerpt(doc.body, 200)) ??
        '',
      created: asText(doc?.frontmatter['created']) ?? updated,
      updated,
      counts: options.counts?.get(slug) ?? { ...EMPTY_COUNTS },
      findingCount: 0,
      lastIngest: ingest.get(slug) ?? null,
      tags: doc === null ? [] : asStringList(doc.frontmatter['tags']),
    });
  }
  modules.sort((a, b) => a.title.localeCompare(b.title));
  return modules;
}
