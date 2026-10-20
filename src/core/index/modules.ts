/**
 * Knowledge modules: a module is a folder `modules/<slug>/` with its own small
 * wiki. The list here is derived — page counts come from the page graph,
 * `lastIngest` from the raw sources.
 *
 * `findingCount` stays 0 as long as no maintenance run has happened: the
 * number says "no known findings", not "checked and clean".
 */

import type { KnowledgeModule, RawSource } from '@shared/types';
import { excerpt } from '@core/vault/doc';
import { laterOf } from './dates';
import { asStringList, asText } from './text';
import type { IndexedDoc, ModulePageCounts } from './types';

const EMPTY_COUNTS: ModulePageCounts = { sources: 0, entities: 0, concepts: 0 };

/** `modules/<slug>/module.md` → slug, otherwise null. */
function moduleFileSlug(path: string): string | null {
  const match = /^modules\/([^/]+)\/module\.md$/.exec(path);
  return match?.[1] ?? null;
}

/** Make the slug readable when no `module.md` provides a title. */
function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.length === 0 ? slug : words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ModuleDerivationOptions {
  /** Page counts per module, as `derivePages` provides them. */
  counts?: ReadonlyMap<string, ModulePageCounts>;
  /** Raw sources; their most recent timestamp becomes `lastIngest`. */
  sources?: readonly RawSource[];
}

/**
 * All modules, alphabetically by title. A module counts as soon as anything
 * exists under `modules/<slug>/` — even without `module.md`, so a manually
 * created wiki doesn't stay invisible.
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
