/**
 * Resolves a link target — a vault path, a wikilink, or a bare slug — to the
 * vault-relative path it means, or `null` when nothing can be said with
 * confidence.
 *
 * Pure and read-only: it never guesses past ambiguity. An ambiguous filename
 * match returns `null` rather than an arbitrary pick — the same "no evidence,
 * no answer" stance the rest of the app takes (CLAUDE.md guardrail 3).
 *
 * Resolution order, first match wins:
 * 1. An existing vault path, `./` and a trailing `:line` suffix stripped.
 * 2. `[[module/slug]]`, or `[[slug]]` from inside a module — the same
 *    module/slug semantics `derivePages()` uses to build the wiki graph.
 * 3. A project or area slug — resolved to that project's or area's own file,
 *    not a re-built path, so it can never drift from the real convention.
 * 4. A unique filename-stem match across all docs. More than one doc sharing
 *    the stem is ambiguous and resolves to `null`, not to a pick.
 */

import { areaSlug } from './areas';
import { baseName, extName } from '@core/vault/paths';
import { derivePages, moduleOfPath, parseWikilinks } from './pages';
import type { IndexedDoc } from './types';

/** Leading './' and a trailing ':<line>' reference stripped, nothing else touched. */
function stripPathDecorations(target: string): string {
  const withoutDot = target.startsWith('./') ? target.slice(2) : target;
  const withoutLine = /^(.+):\d+$/.exec(withoutDot);
  return withoutLine?.[1] ?? withoutDot;
}

/** Filename without its extension — the same idiom `areaSlug` uses for area files. */
function stemOf(path: string): string {
  const name = baseName(path);
  const ext = extName(name);
  return ext.length > 0 ? name.slice(0, -ext.length) : name;
}

function resolveWikilink(
  wikilink: { module: string | null; slug: string },
  fromPath: string,
  docs: readonly IndexedDoc[],
): string | null {
  const module = wikilink.module ?? moduleOfPath(fromPath);
  if (module === null) return null;
  const page = derivePages(docs).pages.find(
    (candidate) => candidate.module === module && candidate.slug === wikilink.slug,
  );
  return page?.path ?? null;
}

function resolveProjectOrAreaSlug(slug: string, docs: readonly IndexedDoc[]): string | null {
  const project = docs.find((doc) => doc.docType === 'project' && doc.project === slug);
  if (project !== undefined) return project.path;
  const area = docs.find((doc) => doc.docType === 'area' && areaSlug(doc.path) === slug);
  return area?.path ?? null;
}

function resolveFilenameStem(stem: string, docs: readonly IndexedDoc[]): string | null {
  const matches = docs.filter((doc) => stemOf(doc.path) === stem);
  return matches.length === 1 ? (matches[0]?.path ?? null) : null;
}

/**
 * Resolves `target`, as it stands in a source file (`fromPath`), against the
 * indexed vault. `docs` may be the whole vault — nothing here assumes a
 * pre-filtered set.
 */
export function resolveLink(
  target: string,
  fromPath: string,
  docs: readonly IndexedDoc[],
): string | null {
  const trimmed = target.trim();
  if (trimmed.length === 0) return null;

  // Rule 1: an existing vault path, decorations stripped.
  const asPath = stripPathDecorations(trimmed);
  if (docs.some((doc) => doc.path === asPath)) return asPath;

  // Rule 2: wikilink syntax, resolved with the same semantics derivePages() uses.
  const wikilink = parseWikilinks(trimmed)[0] ?? null;
  if (wikilink !== null) {
    const resolved = resolveWikilink(wikilink, fromPath, docs);
    if (resolved !== null) return resolved;
  }

  // Rules 3-4 operate on the bare slug: the wikilink's slug when the target was
  // wikilink syntax, the trimmed target otherwise.
  const bareTarget = wikilink?.slug ?? trimmed;

  // Rule 3: a project or area slug.
  const bySlug = resolveProjectOrAreaSlug(bareTarget, docs);
  if (bySlug !== null) return bySlug;

  // Rule 4: a unique filename-stem match. Ambiguous stays null, not a guess.
  return resolveFilenameStem(bareTarget, docs);
}
