/**
 * Ranked, filtered target list for an orphan's "add a reference" fix, for the
 * cases the automatic fix in `checks/orphan.ts` cannot decide on its own: that
 * fix only fires when exactly one other page in the module mentions the orphan's
 * title without linking it (`singleMention`). With zero or several such pages, a
 * human picks the target instead — this is the pure function behind that pick.
 *
 * Pure and synchronous, like `relations.ts`: no store, no index, no I/O. The
 * caller decides the module scope by what it passes as `pages` — this function
 * only ever looks at that array.
 */

import type { DocLanguage, OrphanTarget, OrphanTargets, WikiPage } from '@shared/types';
import { mentionWords } from './checks/orphan';
import { relatedLine } from './relations';

/** Ascending by title — the sort convention used across the gardener (see `report.ts`). */
function byTitle(a: WikiPage, b: WikiPage): number {
  return a.title.localeCompare(b.title);
}

/** Does `page`'s own title/slug carry at least one of `words`? */
function mentions(page: WikiPage, words: readonly string[]): boolean {
  return mentionWords(page).some((word) => words.includes(word));
}

function toTarget(page: WikiPage): OrphanTarget {
  return { path: page.path, title: page.title, slug: page.slug };
}

/**
 * Candidates for a manual pick, ordered overview page → pages sharing a mention
 * word with the orphan → everything else, titles ascending within each group.
 * Excludes the orphan itself and every page whose `outbound` already names it —
 * same id shape as `singleMention` (`checks/orphan.ts`): `${module}/${slug}`.
 */
export function orphanTargets(
  pages: readonly WikiPage[],
  orphan: WikiPage,
  docLanguage: DocLanguage,
): OrphanTargets {
  const id = `${orphan.module}/${orphan.slug}`;
  const words = mentionWords(orphan);

  const eligible = pages.filter((page) => page.path !== orphan.path && !page.outbound.includes(id));

  const overview = eligible.filter((page) => page.type === 'overview').sort(byTitle);
  const decided = new Set(overview.map((page) => page.path));

  const related = eligible
    .filter((page) => !decided.has(page.path) && mentions(page, words))
    .sort(byTitle);
  for (const page of related) decided.add(page.path);

  const rest = eligible.filter((page) => !decided.has(page.path)).sort(byTitle);

  return {
    line: relatedLine(orphan.slug, docLanguage),
    targets: [...overview, ...related, ...rest].map(toTarget),
  };
}
