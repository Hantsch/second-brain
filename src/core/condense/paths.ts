/**
 * Pfade der verdichteten Area (`areas/<slug>.condensed.md`), dokumentiert in
 * docs/VAULT-FORMAT.md als dotted-sibling-Ausnahme zu `areas/<slug>.md` —
 * dieselbe Art Ausnahme wie `web/<date>-<slug>.ingest.json`.
 *
 * Das verdichtete Projekt (`projects/<scope>/<slug>/condensed.md`) braucht diese
 * Ausnahme nicht: es liegt als eigene Datei neben `project.md` im ohnehin
 * vorhandenen Projektordner, kein dotted-sibling-Name noetig.
 */

import { VAULT_DIRS } from '@shared/types';
import type { Scope } from '@shared/types';
import { joinVaultPath, projectDir, slugify, toVaultPath } from '@core/vault/paths';

const CONDENSED_SUFFIX = '.condensed.md';

/** `areas/<slug>.condensed.md` */
export function condensedAreaPath(slug: string): string {
  return joinVaultPath(VAULT_DIRS.areas, `${slugify(slug)}${CONDENSED_SUFFIX}`);
}

/** Ist der Pfad eine verdichtete Area, keine gewoehnliche `areas/<slug>.md`? */
export function isCondensedAreaPath(path: string): boolean {
  return areaSlugFromCondensedPath(path) !== undefined;
}

/** Slug aus `areas/<slug>.condensed.md`, oder `undefined` wenn der Pfad nicht passt. */
export function areaSlugFromCondensedPath(path: string): string | undefined {
  const normalized = toVaultPath(path);
  const match = /^areas\/([^/]+)\.condensed\.md$/.exec(normalized);
  return match?.[1];
}

/** Referenz auf ein Projekt: scope und slug, wie in `projects/<scope>/<slug>/`. */
export interface CondensedProjectRef {
  scope: string;
  slug: string;
}

/** `projects/<scope>/<slug>/condensed.md` */
export function condensedProjectPath(scope: Scope, slug: string): string {
  return joinVaultPath(projectDir(scope, slug), 'condensed.md');
}

/** Ist der Pfad ein verdichtetes Projekt, keine gewoehnliche `project.md`? */
export function isCondensedProjectPath(path: string): boolean {
  return projectRefFromCondensedPath(path) !== undefined;
}

/**
 * Scope und Slug aus `projects/<scope>/<slug>/condensed.md`, oder `undefined`
 * wenn der Pfad nicht passt.
 */
export function projectRefFromCondensedPath(path: string): CondensedProjectRef | undefined {
  const normalized = toVaultPath(path);
  const match = /^projects\/([^/]+)\/([^/]+)\/condensed\.md$/.exec(normalized);
  const scope = match?.[1];
  const slug = match?.[2];
  if (scope === undefined || slug === undefined) return undefined;
  return { scope, slug };
}
