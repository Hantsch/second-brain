/* Filter, sort, rank, split — the logic of the project list, without React.

   It stands here on its own so that it's testable: which row ends up on
   top is the actual statement this screen makes. And that statement is now
   a single list: starred projects and the one last worked on come first,
   regardless of scope. Work and private stay separated everywhere else in
   the app (todo tiles, todo scoping), but the project list is the documented
   exception (VAULT-FORMAT.md) — here the scope filter alone separates the
   scopes, not visual blocks. */

import type { Project, ProjectStatus, Scope } from '@shared/types';

export type ProjectSort = 'touch' | 'deadline' | 'priority' | 'name';

export const PROJECT_SORTS: readonly ProjectSort[] = ['touch', 'deadline', 'priority', 'name'];

/** `all` means both scopes — not "doesn't matter", but explicitly both. */
export type ScopeFilter = Scope | 'all';

/** `open` are all that are still running (not done, not dropped); `all` applies no status filter. */
export type StatusFilter = 'all' | 'open' | ProjectStatus;

export interface ProjectFilter {
  scope: ScopeFilter;
  status: StatusFilter;
  sort: ProjectSort;
  query: string;
}

export const DEFAULT_FILTER: ProjectFilter = {
  scope: 'all',
  status: 'all',
  sort: 'touch',
  query: '',
};

export function isRunning(project: Project): boolean {
  return project.status !== 'done' && project.status !== 'dropped';
}

function matches(project: Project, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystack = [project.title, project.slug, ...project.tags].join(' ').toLowerCase();
  return haystack.includes(needle);
}

/** By scope, status, and search text. Sorting is done by `sortProjects`. */
export function filterProjects(projects: readonly Project[], filter: ProjectFilter): Project[] {
  const needle = filter.query.trim().toLowerCase();
  return projects.filter(
    (project) =>
      (filter.scope === 'all' || project.scope === filter.scope) &&
      (filter.status === 'all'
        ? true
        : filter.status === 'open'
          ? isRunning(project)
          : project.status === filter.status) &&
      matches(project, needle),
  );
}

/** A missing deadline sorts to the back, not the front — it isn't urgency. */
function byDeadline(a: Project, b: Project): number {
  if (a.deadline === null && b.deadline === null) return 0;
  if (a.deadline === null) return 1;
  if (b.deadline === null) return -1;
  return a.deadline.localeCompare(b.deadline);
}

export function sortProjects(projects: readonly Project[], sort: ProjectSort): Project[] {
  const rows = [...projects];
  if (sort === 'name') return rows.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'deadline') {
    return rows.sort((a, b) => byDeadline(a, b) || a.title.localeCompare(b.title));
  }
  if (sort === 'priority') {
    return rows.sort((a, b) => a.priority - b.priority || b.lastTouch.localeCompare(a.lastTouch));
  }
  /* Most recent trail first — the answer to "what did I last work on". */
  return rows.sort(
    (a, b) => b.lastTouch.localeCompare(a.lastTouch) || a.title.localeCompare(b.title),
  );
}

/**
 * Stagnant projects sit as their own section at the end. They should stay
 * visible without clogging up the list of running work.
 *
 * Two rows are exempt and stay in `current` even when they are stale: a
 * starred one and the one identified by `latest` (the row the user last
 * worked on). The star and the re-entry point win over staleness — the user
 * asked to see these, so they don't get banished. Their `stale` flag is
 * untouched; the row still renders with whatever stale treatment it has.
 * Relative order is preserved in both lists.
 */
export function splitStalled(
  projects: readonly Project[],
  latest: string | null,
): {
  current: Project[];
  stalled: Project[];
} {
  const current: Project[] = [];
  const stalled: Project[] = [];
  for (const project of projects) {
    const banished = project.stale && !project.favorite && project.slug !== latest;
    (banished ? stalled : current).push(project);
  }
  return { current, stalled };
}

/**
 * The list as it appears on the screen: filtered, sorted, ranked, split.
 *
 * One single list, whatever the scope: work and private are separated only by
 * the scope filter, not by visual blocks — the project list is the documented
 * exception to the scope separation the rest of the app keeps (VAULT-FORMAT.md).
 * What the list is separated by instead is attention: under the default `touch`
 * sort the row last worked on sits on top, the starred ones follow, the rest
 * keeps its touch order. `latest` names that top row so the UI can mark it; it
 * stays `null` under the other sorts, where nothing is pulled forward at all.
 * The order in `all` is the order on screen, so the keyboard follows the eye.
 */
export function visibleProjects(
  projects: readonly Project[],
  filter: ProjectFilter,
): { current: Project[]; stalled: Project[]; all: Project[]; latest: string | null } {
  const sorted = sortProjects(filterProjects(projects, filter), filter.sort);
  if (filter.sort !== 'touch') {
    const split = splitStalled(sorted, null);
    return { ...split, all: [...split.current, ...split.stalled], latest: null };
  }

  /* `sorted` is touch-ordered, so its head is the last thing worked on. */
  const head = sorted[0];
  const latest = head?.slug ?? null;
  const { current, stalled } = splitStalled(sorted, latest);
  /* Three buckets over one array, by reference — never a second pass over the
     same rows, so every project lands in exactly one place. */
  const rest = current.filter((project) => project !== head);
  const ranked = [
    ...(head ? [head] : []),
    ...rest.filter((project) => project.favorite),
    ...rest.filter((project) => !project.favorite),
  ];
  return { current: ranked, stalled, all: [...ranked, ...stalled], latest };
}
