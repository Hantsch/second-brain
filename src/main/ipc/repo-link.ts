/* Linking a working directory to a vault project — the one write path.

   Two channels need it: `claude:link` (from the dashboard tile, per session)
   and `agents:link` (from the agent browser, per project). Both write the
   same thing in the same place — the directory moves into the project's
   `repos` — so both go through this function. Two copies of it would drift:
   one of them would forget the `pathKey` dedup, or the `expectedHash`, and
   the difference would only show up in the user's Markdown file.

   The write is agent-neutral on purpose. `repos` says "this directory belongs
   to this project"; which CLI happened to run there is not part of that
   statement (docs/VAULT-FORMAT.md). */

import { pathKey, vaultPath } from '@core/claude';
import { isoDay } from '@core/vault/paths';
import { fail } from './errors';
import { settle } from './wiki-bridge';
import type { Services } from '../services';

/**
 * Writes `cwd` into the `repos` of the project `slug`, unless an equal path is
 * already there. Returns whether the file was actually written — the caller
 * decides what else needs to be forgotten afterwards.
 *
 * `area` only appears in the index catch-up's warning; it names the caller.
 */
export async function linkRepoToProject(
  services: Services,
  slug: string,
  rawCwd: string,
  area: string,
): Promise<boolean> {
  /* Canonical write form, not display form: `C:/...` as in
     docs/VAULT-FORMAT.md. Otherwise `C:/development/x` and
     `c:/development/y` would sit side by side in the same list, and any
     comparison outside `pathKey` — git diff, Obsidian, a user's script —
     would take them for different folders. */
  const cwd = vaultPath(rawCwd);
  if (cwd.length === 0) throw fail('invalid', 'dazu gibt es kein Arbeitsverzeichnis');

  const store = services.requireStore();
  const found = (services.index()?.projects?.() ?? []).find((entry) => entry.slug === slug);
  if (found === undefined) throw fail('not-found', `dieses Projekt gibt es nicht: ${slug}`);
  const doc = await store.read(found.path);
  if (doc === null) throw fail('not-found', `diese Projektdatei gibt es nicht: ${found.path}`);

  /* Existing entries stay as the user wrote them; only identical paths are
     not entered twice. */
  const known = Array.isArray(doc.frontmatter['repos'])
    ? (doc.frontmatter['repos'] as unknown[]).filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];
  if (known.some((entry) => pathKey(entry) === pathKey(cwd))) return false;

  await store.write({
    path: found.path,
    frontmatter: { repos: [...known, cwd], updated: isoDay(new Date()) },
    expectedHash: doc.hash,
  });
  await settle(services, [found.path], area);
  return true;
}
