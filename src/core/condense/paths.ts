/**
 * Pfade der verdichteten Area (`areas/<slug>.condensed.md`), dokumentiert in
 * docs/VAULT-FORMAT.md als dotted-sibling-Ausnahme zu `areas/<slug>.md` —
 * dieselbe Art Ausnahme wie `web/<date>-<slug>.ingest.json`.
 */

import { VAULT_DIRS } from '@shared/types';
import { joinVaultPath, slugify, toVaultPath } from '@core/vault/paths';

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
