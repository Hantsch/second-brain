/* Filtern, sortieren, trennen — die Logik der Projektliste, ohne React.

   Sie steht hier für sich, damit sie prüfbar ist: welche Zeile oben steht, ist
   die eigentliche Aussage dieses Screens. */

import type { Project, ProjectStatus, Scope } from '@shared/types';

export type ProjectSort = 'touch' | 'deadline' | 'priority' | 'name';

export const PROJECT_SORTS: readonly ProjectSort[] = ['touch', 'deadline', 'priority', 'name'];

/** `all` heißt beide Bereiche — nicht „egal", sondern ausdrücklich beide. */
export type ScopeFilter = Scope | 'all';

/** `open` sind alle, die noch laufen (nicht fertig, nicht verworfen). */
export type StatusFilter = 'open' | ProjectStatus;

export interface ProjectFilter {
  scope: ScopeFilter;
  status: StatusFilter;
  sort: ProjectSort;
  query: string;
}

export const DEFAULT_FILTER: ProjectFilter = {
  scope: 'all',
  status: 'open',
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

/** Nach Bereich, Status und Suchtext. Die Sortierung macht `sortProjects`. */
export function filterProjects(projects: readonly Project[], filter: ProjectFilter): Project[] {
  const needle = filter.query.trim().toLowerCase();
  return projects.filter(
    (project) =>
      (filter.scope === 'all' || project.scope === filter.scope) &&
      (filter.status === 'open' ? isRunning(project) : project.status === filter.status) &&
      matches(project, needle),
  );
}

/** Fehlende Frist steht hinten, nicht vorne — sie ist keine Dringlichkeit. */
function byDeadline(a: Project, b: Project): number {
  if (a.deadline === null && b.deadline === null) return 0;
  if (a.deadline === null) return 1;
  if (b.deadline === null) return -1;
  return a.deadline.localeCompare(b.deadline);
}

/** Arbeit vor Privat — die Reihenfolge der beiden Bereiche, überall dieselbe. */
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
  /* Jüngste Spur zuerst — die Antwort auf „woran habe ich zuletzt gearbeitet". */
  return rows.sort(
    (a, b) => b.lastTouch.localeCompare(a.lastTouch) || a.title.localeCompare(b.title),
  );
}

/**
 * Stagnierendes steht als eigener Abschnitt am Ende. Es soll sichtbar bleiben,
 * ohne die Liste der laufenden Arbeit zu verstopfen.
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
 * Die Liste, wie sie auf dem Screen steht: gefiltert, sortiert, geteilt.
 *
 * Bei „Alle" stehen die Bereiche **untereinander, nicht durcheinander**: erst
 * Arbeit, dann Privat. Die Trennung der beiden Bereiche ist eine Anforderung
 * (VAULT-FORMAT.md, die zwei Todo-Kacheln) — eine Liste, in der ein Kundenprojekt
 * und ein Hochbeet abwechseln, bricht sie. `grouped` sagt der Oberfläche, dass
 * sie Überschriften setzen soll; die Reihenfolge in `all` ist dieselbe, damit die
 * Tastatur genau der Reihe nach geht, die man sieht.
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
