/* Filter, sort, split — the logic of the project list, without React.

   It stands here on its own so that it's testable: which row ends up on
   top is the actual statement this screen makes. */

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

/** Work before private — the order of the two scopes, the same everywhere. */
const SCOPE_ORDER: readonly Scope[] = ['work', 'private'];

export function scopeRank(scope: Scope): number {
  const at = SCOPE_ORDER.indexOf(scope);
  return at < 0 ? SCOPE_ORDER.length : at;
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
 */
export function splitStalled(projects: readonly Project[]): {
  current: Project[];
  stalled: Project[];
} {
  const current: Project[] = [];
  const stalled: Project[] = [];
  for (const project of projects) (project.stale ? stalled : current).push(project);
  return { current, stalled };
}

/**
 * The list as it appears on the screen: filtered, sorted, split.
 *
 * With "all", the scopes appear **stacked, not interleaved**: work first,
 * then private. Separating the two scopes is a requirement
 * (VAULT-FORMAT.md, the two todo tiles) — a list where a client project and
 * a raised garden bed alternate breaks that. `grouped` tells the UI that it
 * should render headings; the order in `all` is the same, so the keyboard
 * follows exactly the sequence you see.
 */
export function visibleProjects(
  projects: readonly Project[],
  filter: ProjectFilter,
): { current: Project[]; stalled: Project[]; all: Project[]; grouped: boolean } {
  const grouped = filter.scope === 'all';
  const sorted = sortProjects(filterProjects(projects, filter), filter.sort);
  const ordered = grouped
    ? [...sorted].sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope))
    : sorted;
  const split = splitStalled(ordered);
  return { ...split, all: [...split.current, ...split.stalled], grouped };
}
