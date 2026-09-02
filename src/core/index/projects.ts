/**
 * Projekte: Frontmatter lesen, Ableitungen rechnen.
 *
 * Die Ableitungen beantworten die erste der drei Fragen der App — „woran habe ich
 * zuletzt gearbeitet und wo war ich stehengeblieben?": `lastTouch` ist die juengste
 * Spur, `excerpt` der Wiedereinstiegspunkt, `stale` die stille Warnung.
 */

import type {
  Project,
  ProjectStatus,
  Provenance,
  ProvenanceOrigin,
  Scope,
  Todo,
  WaitingOn,
} from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import { excerpt, extractSections } from '@core/vault/doc';
import { dirName, isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { sectionKindOf } from '@core/vault/section-names';
import { ageInDays, daysBetween, laterOf } from './dates';
import { asDate, asStringList, asText } from './text';
import { scopeFromPath } from './todos';
import { DEFAULT_STALE_AFTER_DAYS } from './types';
import type { ExternalTouches, IndexedDoc } from './types';

export interface ProjectDerivationOptions {
  /** Das „jetzt", auf das sich `ageDays` und `stale` beziehen. */
  now?: DateLike;
  /** Schwelle fuer `stale`; kommt aus den Vault-Einstellungen. */
  staleAfterDays?: number;
  /**
   * Spuren von aussen (Claude-Sessions, Journal), Projekt-Slug → Zeitpunkt.
   * Sie gewinnen, wenn sie juenger sind als die juengste Dateiaenderung.
   */
  externalTouches?: ExternalTouches;
}

function statusOf(value: unknown): ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : 'active';
}

function priorityOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 3;
}

const PROVENANCE_BY: readonly string[] = ['user', 'suggestion', 'filing'];

/** `status_set`/`next_step_set` aus dem Frontmatter — nur wenn beide Teile brauchbar sind. */
function provenanceOf(value: unknown): Provenance | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const at = asDate(record['at']);
  const by = record['by'];
  if (at === null || typeof by !== 'string' || !PROVENANCE_BY.includes(by)) return undefined;
  return { at, by: by as ProvenanceOrigin };
}

function scopeOf(doc: IndexedDoc): Scope {
  const fromFrontmatter = doc.frontmatter['scope'];
  if (fromFrontmatter === 'work') return 'work';
  if (fromFrontmatter === 'private' || fromFrontmatter === 'privat') return 'private';
  return scopeFromPath(doc.path) ?? 'private';
}

/** `waiting_on` ist Nutzerhand — jeder Eintrag wird geprueft, nichts erfunden. */
function waitingOnOf(value: unknown): WaitingOn[] {
  if (!Array.isArray(value)) return [];
  const entries: WaitingOn[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const who = asText(record['who']);
    if (who === null) continue;
    const entry: WaitingOn = {
      who,
      what: asText(record['what']) ?? '',
      since: asDate(record['since']) ?? '',
      resolved: record['resolved'] === true,
    };
    const due = asDate(record['due']);
    if (due !== null) entry.due = due;
    entries.push(entry);
  }
  return entries;
}

/** Erster Absatz unter '## Stand', sonst erster Absatz des Rumpfs. */
export function projectExcerpt(body: string, maxChars = 240): string {
  for (const [heading, text] of extractSections(body)) {
    if (sectionKindOf(heading) === 'state') {
      const found = excerpt(text, maxChars);
      if (found.length > 0) return found;
    }
  }
  return excerpt(body, maxChars);
}

/** `projects/<scope>/<slug>/irgendwas` → `projects/<scope>/<slug>`. */
function projectDirOf(path: string): string | null {
  const parts = path.split('/');
  if (parts.length < 3 || parts[0] !== 'projects') return null;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

/**
 * Juengste Dateiaenderung je Projektordner — die Spur, die in `lastTouch` landet.
 *
 * A condensed artifact (story 044) is excluded: it lives inside the project's
 * own folder, but writing it is the *run's* work, not the human's — counting it
 * would make a condensation make the project look freshly worked on, exactly
 * the fabricated-progress bug `stale`/`nextStepStale` exist to catch.
 */
function touchesByDir(docs: readonly IndexedDoc[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const doc of docs) {
    if (doc.docType === 'condensed') continue;
    const dir = projectDirOf(doc.path);
    if (dir === null) continue;
    const known = result.get(dir);
    if (known === undefined || doc.updated > known) result.set(dir, doc.updated);
  }
  return result;
}

interface TodoCount {
  total: number;
  open: number;
}

function countsBySlug(todos: readonly Todo[]): Map<string, TodoCount> {
  const result = new Map<string, TodoCount>();
  for (const todo of todos) {
    if (todo.project === null) continue;
    const entry = result.get(todo.project) ?? { total: 0, open: 0 };
    entry.total += 1;
    if (todo.state === 'open') entry.open += 1;
    result.set(todo.project, entry);
  }
  return result;
}

/**
 * Alle Projekte aus den indizierten Dokumenten. `docs` darf der ganze Vault sein —
 * Projektdateien werden hier herausgesucht, alle uebrigen liefern nur `lastTouch`.
 */
export function deriveProjects(
  docs: readonly IndexedDoc[],
  todos: readonly Todo[],
  options: ProjectDerivationOptions = {},
): Project[] {
  const now = options.now ?? new Date();
  const staleAfter = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const fileTouches = touchesByDir(docs);
  const todoCounts = countsBySlug(todos);
  const projects: Project[] = [];

  for (const doc of docs) {
    if (doc.docType !== 'project') continue;
    const dir = projectDirOf(doc.path) ?? dirName(doc.path);
    const slug = asText(doc.frontmatter['slug']) ?? doc.project ?? dir.split('/').pop() ?? '';
    const status = statusOf(doc.frontmatter['status']);
    const counts = todoCounts.get(slug) ?? { total: 0, open: 0 };

    const fileTouch = fileTouches.get(dir) ?? doc.updated;
    const external = options.externalTouches?.get(slug) ?? null;
    let lastTouch = fileTouch;
    let lastTouchSource: Project['lastTouchSource'] = 'file';
    if (
      external !== null &&
      external.at !== fileTouch &&
      laterOf(fileTouch, external.at) === external.at
    ) {
      lastTouch = external.at;
      lastTouchSource = external.source;
    }
    const ageDays = ageInDays(lastTouch, now);
    const statusSet = provenanceOf(doc.frontmatter['status_set']);
    const nextStepSet = provenanceOf(doc.frontmatter['next_step_set']);
    const nextStepStale =
      nextStepSet !== undefined &&
      (daysBetween(nextStepSet.at, isoDay(new Date(lastTouch))) ?? 0) > 0;

    projects.push({
      path: doc.path,
      slug,
      title: doc.title,
      scope: scopeOf(doc),
      status,
      priority: priorityOf(doc.frontmatter['priority']),
      favorite: doc.frontmatter['favorite'] === true,
      deadline: asDate(doc.frontmatter['deadline']),
      nextStep: asText(doc.frontmatter['next_step']),
      statusSet,
      nextStepSet,
      nextStepStale,
      waitingOn: waitingOnOf(doc.frontmatter['waiting_on']),
      tags: doc.tags,
      modules: asStringList(doc.frontmatter['modules']),
      repos: asStringList(doc.frontmatter['repos']),
      lastTouch,
      lastTouchSource,
      ageDays,
      stale: status !== 'done' && status !== 'dropped' && ageDays >= staleAfter,
      todoCount: counts.total,
      openTodoCount: counts.open,
      excerpt: projectExcerpt(doc.body),
    });
  }

  projects.sort((a, b) =>
    a.lastTouch === b.lastTouch ? a.path.localeCompare(b.path) : a.lastTouch < b.lastTouch ? 1 : -1,
  );
  return projects;
}

/** Projekt-Slug → Titel, fuer `Todo.projectTitle`. */
export function projectTitles(projects: readonly Project[]): Map<string, string> {
  return new Map(projects.map((project) => [project.slug, project.title]));
}
