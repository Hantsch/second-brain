/* Starred projects to the front — the one place that rule is written down.
 *
 * Anything that shows a list of projects (tiles, pickers, dialogs) has to
 * agree on what "favourite" does to the order, so the rule lives here instead
 * of once per component. The project screen itself does not use this: its
 * ordering additionally has to interleave the last-touched row and the stale
 * section, so it keeps its own pass in `screens/projects/filter.ts`.
 */

import type { Project } from '@shared/types';

/**
 * Stable partition, not a sort: favourites keep their incoming order among
 * themselves, and so does everything else — only the two groups swap places.
 * Whatever order the caller sorted by therefore survives inside each group.
 */
export function favoritesFirst(projects: readonly Project[]): Project[] {
  return [
    ...projects.filter((project) => project.favorite),
    ...projects.filter((project) => !project.favorite),
  ];
}
