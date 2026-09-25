/**
 * Read-only plans for renaming and deleting a knowledge module (story 063, D1).
 *
 * Mirrors `discardPlan` in `@core/gardener/discard.ts` in spirit and shape: the
 * index only supplies *candidates* (which pages belong to the module, which source
 * names it, which project links it), every file that might actually change is read
 * fresh through the store, and nothing is ever written — `npm test` asserts the
 * vault comes out byte-identical from both `renamePlan` and `deletePlan`.
 *
 * `withModuleLock`, the ingest-queue check, and the actual writes are D2/D3/D4's
 * job; this file only says what *would* happen.
 */

import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import {
  isInside,
  modulePagePath,
  moduleDir,
  modulePath,
  slugify,
  wikiIndexPath,
} from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import { agentsPath } from '../module';
import { protocolPaths } from '../raw-protocol';
import { WikiError } from '../types';
import {
  findModuleLinks,
  retargetDumpFiledInto,
  retargetHeadlineTitle,
  retargetIngestModules,
  retargetModuleLinks,
  retargetModulePaths,
  retargetOverviewTitle,
  retargetProjectModules,
} from './refs';
import type {
  AffectedProject,
  AffectedSource,
  BrokenInboundLink,
  DeletePlan,
  DeletePlanInput,
  LifecycleBlockReason,
  LifecycleChange,
  LifecycleChangeKind,
  ModuleLifecycleDeps,
  RenamePlan,
  RenamePlanInput,
} from './types';

/** Non-empty, trimmed text — `null` for anything else, including a stray `null`/number. */
function textFieldOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** `modules/<slug>/wiki/log.md` — the one file a rename must never list as a rewrite. */
function isLogFile(path: string): boolean {
  return /^modules\/[^/]+\/wiki\/log\.md$/u.test(path);
}

/**
 * Collects changes one per path: a second hit on the same file appends to its
 * summary instead of creating a second entry, so a page that both loses its
 * `module:` field *and* carries an outbound `[[old/…]]` link shows up once.
 */
function changeCollector(): {
  list: LifecycleChange[];
  add: (path: string, kind: LifecycleChangeKind, summary: string) => void;
} {
  const byPath = new Map<string, LifecycleChange>();
  const list: LifecycleChange[] = [];
  return {
    list,
    add(path, kind, summary) {
      const existing = byPath.get(path);
      if (existing !== undefined) {
        existing.summary = `${existing.summary}; ${summary}`;
        return;
      }
      const change: LifecycleChange = { path, kind, summary };
      byPath.set(path, change);
      list.push(change);
    },
  };
}

/** The protocol text of a raw source, from whichever of the two documented
 * locations (`protocolPaths`) actually holds a readable file. Mirrors the private
 * `readProtocol` in `@core/wiki/raw-protocol.ts` — not exported there, and this is
 * the only other place that needs the same lookup, so it is kept local rather than
 * widening that module's surface for one caller. */
async function readProtocolText(
  store: VaultStore,
  rawPath: string,
): Promise<{ path: string; raw: string } | null> {
  for (const path of protocolPaths(rawPath)) {
    const raw = await store.readText(path);
    if (raw !== null) return { path, raw };
  }
  return null;
}

/**
 * sha256 over sorted `path:hash` pairs of every file inside `folder` plus every
 * `extraPaths` entry outside it. One number standing in for N hashes, so apply
 * (D2/D3) can detect a concurrent change without the renderer round-tripping a
 * hash per file.
 */
async function fingerprintOf(
  store: VaultStore,
  folder: string,
  extraPaths: readonly string[],
): Promise<string> {
  const inside = await store.list({ dir: folder, recursive: true });
  const outside = extraPaths.filter((path) => !isInside(folder, path));
  const hashes = new Map<string, string>();
  for (const path of new Set([...inside, ...outside])) {
    const hash = await store.hash(path);
    if (hash !== null) hashes.set(path, hash);
  }
  return fingerprintOfHashes(hashes);
}

/**
 * The fingerprint's arithmetic alone, over hashes the caller already holds. Apply
 * (D2) computes it over the very contents it is about to rewrite, so "the files I
 * read are the files the preview saw" is one comparison, not a second round of reads.
 */
export function fingerprintOfHashes(hashes: ReadonlyMap<string, string>): string {
  const parts = [...hashes.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => `${path}:${hashes.get(path) ?? ''}`);
  return sha256(parts.join('\n'));
}

/**
 * What renaming `slug` to `title` would touch: `module.md`, every page's `module:`
 * field (and the overview's title, where it still says the old one verbatim),
 * `AGENTS.md`, the catalog headline, every `.ingest.json` and project naming the
 * module, every dump receipt filed into it, and every outside `[[slug/…]]`
 * wikilink — never `wiki/log.md`, never a file under `raw/`.
 */
export async function renamePlan(
  deps: ModuleLifecycleDeps,
  input: RenamePlanInput,
): Promise<RenamePlan> {
  const { store, index } = deps;
  const slug = (input.slug ?? '').trim();
  if (slug.length === 0) throw new WikiError('invalid', 'Kein Modul angegeben.');
  const title = (input.title ?? '').trim();
  if (title.length === 0) throw new WikiError('invalid', 'Ein Modul braucht einen Titel.');

  const moduleFile = modulePath(slug);
  const moduleRaw = await store.readText(moduleFile);
  if (moduleRaw === null) throw new WikiError('not-found', `Modul fehlt: ${slug}`);
  const oldTitle = textFieldOf(parse(moduleRaw).frontmatter['title']) ?? slug;

  const newSlug = slugify(title);
  const titleOnly = newSlug === slug;

  const collector = changeCollector();
  if (!titleOnly || oldTitle !== title) {
    collector.add(
      moduleFile,
      'module-file',
      titleOnly
        ? `title: "${oldTitle}" -> "${title}"`
        : `title: "${oldTitle}" -> "${title}", slug/module: ${slug} -> ${newSlug}`,
    );
  }

  const pages = index.pages().filter((page) => page.module === slug);
  // A title-only rename touches no `module:` field — the slug it points at didn't move.
  if (!titleOnly) {
    for (const page of pages) collector.add(page.path, 'page', `module: ${slug} -> ${newSlug}`);
  }

  const overviewPath = modulePagePath(slug, 'overview');
  const overviewRaw = await store.readText(overviewPath);
  if (
    overviewRaw !== null &&
    retargetOverviewTitle(overviewPath, overviewRaw, oldTitle, title) !== null
  ) {
    collector.add(overviewPath, 'page', `title: "${oldTitle}…" -> "${title}…"`);
  }

  const agentsFile = agentsPath(slug);
  const agentsRaw = await store.readText(agentsFile);
  if (agentsRaw !== null) {
    const rewritten = retargetHeadlineTitle(
      retargetModulePaths(agentsRaw, slug, newSlug),
      oldTitle,
      title,
      ':',
    );
    if (rewritten !== agentsRaw) {
      collector.add(agentsFile, 'agents-md', `modules/${slug} -> modules/${newSlug}, headline`);
    }
  }

  const catalogFile = wikiIndexPath(slug);
  const catalogRaw = await store.readText(catalogFile);
  if (catalogRaw !== null) {
    const rewritten = retargetHeadlineTitle(catalogRaw, oldTitle, title, '—');
    if (rewritten !== catalogRaw) {
      collector.add(catalogFile, 'catalog', 'headline');
    }
  }

  // Everything from here on hinges on the slug moving; a title-only rename leaves
  // every one of these untouched (`retargetSlugList`/`retargetDumpFiledInto` are
  // already no-ops for `from === to`, but skipping the reads entirely says the same
  // thing without paying for them).
  if (!titleOnly) {
    for (const source of index.sources()) {
      if (!source.modules.includes(slug)) continue;
      const found = await readProtocolText(store, source.path);
      if (found === null) continue;
      const edit = retargetIngestModules(found.raw, { from: slug, to: newSlug });
      if (edit !== null) {
        collector.add(found.path, 'ingest-protocol', `modules: ${slug} -> ${newSlug}`);
      }
    }

    for (const project of index.projects()) {
      if (!project.modules.includes(slug)) continue;
      const raw = await store.readText(project.path);
      if (raw === null) continue;
      if (retargetProjectModules(project.path, raw, { from: slug, to: newSlug }) !== null) {
        collector.add(project.path, 'project', `modules: ${slug} -> ${newSlug}`);
      }
    }

    for (const doc of index.index().docs) {
      if (doc.docType !== 'dump') continue;
      const filedInto = doc.frontmatter['filed_into'];
      if (typeof filedInto !== 'string' || !filedInto.startsWith(`modules/${slug}/`)) continue;
      const raw = await store.readText(doc.path);
      if (raw === null) continue;
      if (retargetDumpFiledInto(doc.path, raw, slug, newSlug) !== null) {
        collector.add(doc.path, 'dump', `filed_into: modules/${slug}/… -> modules/${newSlug}/…`);
      }
    }

    for (const doc of index.index().docs) {
      if (doc.path.startsWith('raw/') || isLogFile(doc.path)) continue;
      const raw = await store.readText(doc.path);
      if (raw === null) continue;
      const body = parse(raw).body;
      if (retargetModuleLinks(body, slug, newSlug) !== body) {
        collector.add(doc.path, 'wikilink', `wikilinks: ${slug}/… -> ${newSlug}/…`);
      }
    }
  }

  const blocked: LifecycleBlockReason | null =
    !titleOnly && (await store.exists(modulePath(newSlug))) ? 'target-exists' : null;

  const fingerprint = await fingerprintOf(
    store,
    moduleDir(slug),
    collector.list.map((change) => change.path),
  );

  return {
    slug,
    newSlug,
    oldTitle,
    title,
    titleOnly,
    changes: collector.list,
    pages,
    blocked,
    fingerprint,
  };
}

/**
 * What deleting `slug` would cost: page count, which raw sources return to
 * "undigested" versus stay digested elsewhere, which project `modules:` entries
 * are dropped, and which outside `[[slug/…]]` links would break (they are not
 * repointed — there is no target left to point them at).
 */
export async function deletePlan(
  deps: ModuleLifecycleDeps,
  input: DeletePlanInput,
): Promise<DeletePlan> {
  const { store, index } = deps;
  const slug = (input.slug ?? '').trim();
  if (slug.length === 0) throw new WikiError('invalid', 'Kein Modul angegeben.');

  const moduleFile = modulePath(slug);
  if (!(await store.exists(moduleFile))) throw new WikiError('not-found', `Modul fehlt: ${slug}`);

  const pages = index.pages().filter((page) => page.module === slug);
  const collector = changeCollector();
  const sources: AffectedSource[] = [];
  const projects: AffectedProject[] = [];
  const brokenLinks: BrokenInboundLink[] = [];

  for (const source of index.sources()) {
    if (!source.modules.includes(slug)) continue;
    const found = await readProtocolText(store, source.path);
    if (found === null) continue;
    const edit = retargetIngestModules(found.raw, { from: slug, to: null });
    if (edit === null) continue;
    collector.add(
      found.path,
      'ingest-protocol',
      edit.emptied ? `modules: ${slug} entfernt, sourcePage -> null` : `modules: ${slug} entfernt`,
    );
    const nextModules = (JSON.parse(edit.content) as Record<string, unknown>)['modules'];
    const remaining = Array.isArray(nextModules)
      ? nextModules.filter((entry): entry is string => typeof entry === 'string')
      : [];
    sources.push({
      path: source.path,
      protocolPath: found.path,
      outcome: edit.emptied ? 'undigested' : 'stays-digested',
      remainingModule: edit.emptied ? null : (remaining[0] ?? null),
    });
  }

  for (const project of index.projects()) {
    if (!project.modules.includes(slug)) continue;
    const raw = await store.readText(project.path);
    if (raw === null) continue;
    if (retargetProjectModules(project.path, raw, { from: slug, to: null }) === null) continue;
    collector.add(project.path, 'project', `modules: ${slug} entfernt`);
    projects.push({ path: project.path, slug: project.slug });
  }

  const moduleFolder = moduleDir(slug);
  for (const doc of index.index().docs) {
    if (doc.path.startsWith('raw/') || isInside(moduleFolder, doc.path)) continue;
    const raw = await store.readText(doc.path);
    if (raw === null) continue;
    for (const hit of findModuleLinks(parse(raw).body, slug)) {
      brokenLinks.push({ path: doc.path, target: hit.target, line: hit.line });
    }
  }

  const fingerprint = await fingerprintOf(
    store,
    moduleFolder,
    collector.list.map((change) => change.path),
  );

  return {
    slug,
    changes: collector.list,
    pages,
    sources,
    brokenLinks,
    projects,
    blocked: null,
    fingerprint,
  };
}
