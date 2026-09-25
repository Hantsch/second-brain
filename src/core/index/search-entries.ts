/**
 * What MiniSearch holds per document: one entry per passage (053), id
 * `<path>#<n>`. Kept apart from `search.ts` so the entry shape — and the one
 * place that reads it back out of a saved state — is in a single spot.
 */

import type { IndexedDoc, SerializedSearch } from './types';

/**
 * What MiniSearch sees of one passage. Title and tags sit on every passage of a
 * document, so a query mixing a title word with a body term still gets the title
 * boost on the passage that holds the body term.
 */
export interface SearchEntry {
  id: string;
  path: string;
  title: string;
  tags: string;
  text: string;
}

export function entryId(path: string, passage: number): string {
  return `${path}#${passage}`;
}

/** Passage number of an entry id — the last '#' separates it, a path may carry its own. */
export function passageOf(id: string): number {
  return Number(id.slice(id.lastIndexOf('#') + 1));
}

export function toEntries(doc: IndexedDoc): SearchEntry[] {
  const tags = doc.tags.join(' ');
  // An oversized stub has no passages, but stays findable by its title.
  const texts =
    doc.passages.length > 0 ? doc.passages.map((passage) => passage.text.toLowerCase()) : [''];
  return texts.map((text, n) => ({
    id: entryId(doc.path, n),
    path: doc.path,
    title: doc.title,
    tags,
    text,
  }));
}

/**
 * Path → passage count of a saved state, so a restored engine still knows which
 * ids to discard per path. `null` when an id does not have the `<path>#<n>` shape.
 */
export function countsOf(state: SerializedSearch): Map<string, number> | null {
  const counts = new Map<string, number>();
  for (const id of Object.values(state.documentIds) as unknown[]) {
    if (typeof id !== 'string') return null;
    const cut = id.lastIndexOf('#');
    const passage = Number(id.slice(cut + 1));
    if (cut <= 0 || !Number.isInteger(passage) || passage < 0) return null;
    const path = id.slice(0, cut);
    counts.set(path, Math.max(counts.get(path) ?? 0, passage + 1));
  }
  return counts;
}
