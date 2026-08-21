/**
 * Discard preview: what would disappear, and what would need to be repointed —
 * without writing anything. `discardPlan` is the read-only half; the write that
 * applies its plan lives next door in `discard-page.ts`.
 *
 * Three things it must get right, all mirrored from `fixes.ts`:
 * - **Read fresh.** The page (and every inbound page) is read from the store at
 *   call time, never from a stale report.
 * - **The preview is the truth.** The catalog line shown as "would be removed" is
 *   derived by actually running `removeEntries` and diffing before/after — not by
 *   reformatting the entry ourselves, which would be a second notion of what a
 *   catalog line looks like.
 * - **Nothing is written.** No `store.write`, `writeText`, or `delete` call here —
 *   applying the plan is a separate function the caller has to ask for.
 */

import type { WikiPage } from '@shared/types';
import { wikiIndexPath } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import { pageRefOf, removeEntries } from '@core/wiki';
import type { PageRef } from '@core/wiki';
import { GardenerError } from './types';

/** Same wikilink shape as `WIKILINK` in `@core/index/pages.ts`. Kept local: unlike
 * `parseWikilinks`, this one needs the match's position in the line so the "after"
 * text can be built in place. */
const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/** What `discardPlan` needs of the index: only the page graph, for inbound links. */
export interface DiscardIndexView {
  pages(): readonly WikiPage[];
}

export interface DiscardDeps {
  store: VaultStore;
  index: DiscardIndexView;
}

export interface DiscardInput {
  path: string;
  /** Path or slug of the surviving page, when the pair is meant to merge into one. */
  keep?: string;
}

/** The page that would be discarded, as read just now. */
export interface DiscardTarget extends PageRef {
  hash: string;
}

/** One line that would change in an inbound page, if `keep` were given. */
export interface DiscardRepoint {
  path: string;
  /** The line as it stands now. */
  before: string;
  /** The same line, with the wikilink target repointed to `keep`. */
  after: string;
}

export interface DiscardPlan {
  target: DiscardTarget;
  /** Pages that link to the target, from the index graph. Empty is not an error. */
  inbound: PageRef[];
  catalogPath: string;
  /** The exact line `removeEntries` would drop from the catalog; `null` if there is none. */
  catalogLine: string | null;
  /** One entry per inbound page; empty unless `keep` was given. */
  repoints: DiscardRepoint[];
}

/** Body of a page, read just now — `readCurrent`'s counterpart for pages we only
 * need to scan, not to write back. */
async function bodyOf(store: VaultStore, path: string): Promise<string> {
  const doc = await store.read(path);
  if (doc === null) throw new GardenerError('not-found', `Datei fehlt: ${path}`);
  return doc.body;
}

function refOf(path: string, frontmatter: Record<string, unknown>): PageRef {
  const ref = pageRefOf(path, frontmatter);
  if (ref === null) throw new GardenerError('invalid', `Keine Wiki-Seite: ${path}`);
  return ref;
}

function toRef(page: WikiPage): PageRef {
  return {
    path: page.path,
    module: page.module,
    slug: page.slug,
    type: page.type,
    title: page.title,
  };
}

/**
 * The exact line `removeEntries` would drop for `slug` — found by actually calling
 * it and diffing, since `removeEntries` only ever filters lines out, never edits or
 * reorders the rest. The first line missing from the result, walked in order, is
 * the removed entry.
 */
function catalogLineOf(catalogRaw: string, slug: string): string | null {
  const after = removeEntries(catalogRaw, [slug]);
  if (after === catalogRaw) return null;
  const before = catalogRaw.split('\n');
  const next = after.split('\n');
  let ai = 0;
  for (const line of before) {
    if (ai < next.length && line === next[ai]) {
      ai += 1;
      continue;
    }
    return line;
  }
  return null;
}

/** `keep` as a module+slug pair — a path resolves via `pageRefOf`, else it is taken
 * as a bare slug or a `module/slug` pair, used verbatim inside `[[...]]`. */
function keepTargetOf(keep: string, fallbackModule: string): { module: string; slug: string } {
  const ref = pageRefOf(keep);
  if (ref !== null) return { module: ref.module, slug: ref.slug };
  const cut = keep.lastIndexOf('/');
  if (cut < 0) return { module: fallbackModule, slug: keep };
  return { module: keep.slice(0, cut), slug: keep.slice(cut + 1) };
}

/**
 * `line`, with every wikilink that targets `discard` (within `linkModule`, the
 * module the inbound page itself belongs to) repointed to `keep`. `null` if the
 * line names no such link — surrounding text is never touched.
 */
function repointLine(
  line: string,
  discard: { module: string; slug: string },
  linkModule: string,
  keep: { module: string; slug: string },
): string | null {
  const keepRaw = keep.module === linkModule ? keep.slug : `${keep.module}/${keep.slug}`;
  let changed = false;
  const next = line.replace(WIKILINK, (full: string, rawTarget: string, label?: string) => {
    const raw = rawTarget.trim();
    const cut = raw.lastIndexOf('/');
    const module = cut < 0 ? linkModule : raw.slice(0, cut).trim();
    const slug = (cut < 0 ? raw : raw.slice(cut + 1)).trim();
    if (module !== discard.module || slug !== discard.slug) return full;
    changed = true;
    return label === undefined ? `[[${keepRaw}]]` : `[[${keepRaw}|${label}]]`;
  });
  return changed ? next : null;
}

/**
 * What discarding `path` would cost: the page itself, who links to it, the catalog
 * line that would disappear, and — when `keep` names the surviving page — the
 * exact repoint of every inbound wikilink. Purely a preview: nothing is written.
 */
export async function discardPlan(
  deps: DiscardDeps,
  { path, keep }: DiscardInput,
): Promise<DiscardPlan> {
  const page = await deps.store.read(path);
  if (page === null) throw new GardenerError('not-found', `Datei fehlt: ${path}`);
  const ref = refOf(page.path, page.frontmatter);
  const target: DiscardTarget = { ...ref, hash: page.hash };

  const graphPages = deps.index.pages();
  const inGraph = graphPages.find((candidate) => candidate.path === ref.path);
  const byId = new Map(
    graphPages.map((candidate) => [`${candidate.module}/${candidate.slug}`, candidate]),
  );
  const inboundPages = (inGraph?.inbound ?? [])
    .map((id) => byId.get(id))
    .filter((candidate): candidate is WikiPage => candidate !== undefined);
  const inbound = inboundPages.map(toRef);

  const catalogPath = wikiIndexPath(ref.module);
  const catalogRaw = (await deps.store.readText(catalogPath)) ?? '';
  const catalogLine = catalogLineOf(catalogRaw, ref.slug);

  const repoints: DiscardRepoint[] = [];
  if (keep !== undefined && keep.trim().length > 0) {
    const keepTarget = keepTargetOf(keep.trim(), ref.module);
    for (const inboundPage of inboundPages) {
      const body = await bodyOf(deps.store, inboundPage.path);
      for (const line of body.split('\n')) {
        const after = repointLine(line, ref, inboundPage.module, keepTarget);
        if (after !== null) repoints.push({ path: inboundPage.path, before: line, after });
      }
    }
  }

  return { target, inbound, catalogPath, catalogLine, repoints };
}
