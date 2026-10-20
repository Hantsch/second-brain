/**
 * Renaming a knowledge module — the write half of `renamePlan` (story 063, D2).
 *
 * The order is `discardPage`'s (`@core/gardener/discard-page.ts`), and the order is
 * the guarantee:
 *
 * 1. **Plan again.** `renamePlan` runs here, at click time; its fingerprint has to be
 *    the one the preview showed, and a blocked plan (`target-exists`) is a `conflict`.
 * 2. **Read everything, then write.** Every file about to change — and every file of
 *    the folder about to move — is read, fingerprinted and rewritten in memory before
 *    the first write. A file edited since the preview raises `conflict` while nothing
 *    has been touched.
 * 3. **Content first, move last.** Every rewrite lands with the hash just read; the
 *    files inside the folder are written at their **old** paths. Only then — after a
 *    last look at the whole folder — does `VaultStore.move` take it to its new name.
 *    The move is the one step without a hash guard, so it is the last one.
 * 4. **One mark.** The journal (gardener's `FixJournal`) is written before the first
 *    write and gains `moved` only once the move has landed — a journal that names a
 *    move always describes one that happened, so `undoFix` can put it back first.
 * 5. **Roll back on failure.** Anything throws on the way, `undoFix` undoes what
 *    landed and the original error is rethrown.
 *
 * The chronicle (`wiki/log.md`) is never rewritten and never rolled back: the rename
 * appends one `lint` entry to it once the folder sits at its new name, as discard does.
 *
 * Between the last look at the folder and the move there is still a window — the same
 * one `condense:accept` and `discardPage` leave open. Accepted, not solved.
 */

import type { DocLanguage } from '@shared/types';
import type { IndexedDoc } from '@core/index/types';
import { undoFix, writeFixJournal } from '@core/gardener/undo';
import type { FixJournal, FixMove } from '@core/gardener/undo';
import { composeContent } from '@core/vault/compose';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import {
  isInside,
  isoDay,
  moduleDir,
  modulePagePath,
  modulePath,
  wikiIndexPath,
} from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import type { VaultStore } from '@core/vault/types';
import { appendLog } from '../log-md';
import { agentsPath } from '../module';
import { WikiError } from '../types';
import { fingerprintOfHashes, renamePlan } from './plan';
import {
  retargetDumpFiledInto,
  retargetHeadlineTitle,
  retargetIngestModules,
  retargetModuleFile,
  retargetModuleLinks,
  retargetModulePaths,
  retargetOverviewTitle,
  retargetPageModule,
  retargetProjectModules,
} from './refs';
import type { ModuleLifecycleDeps, RenamePlan, RenamePlanInput } from './types';

/** What the write needs beyond the preview: the language of the log entry and the clock. */
export interface RenameWriteDeps extends ModuleLifecycleDeps {
  /** Language of the chronicle entry. */
  docLanguage?: DocLanguage;
  /** The "now". Tests pass a fixed time. */
  now?: DateLike;
}

export interface RenameInput extends RenamePlanInput {
  /** `plan.fingerprint` of the preview the user confirmed. */
  fingerprint: string;
}

export interface RenameResult {
  slug: string;
  newSlug: string;
  title: string;
  /** `false` for a title-only rename: the folder stayed where it was. */
  moved: boolean;
  /** Every rewritten file, at the path it has **now** (inside the new folder). */
  written: string[];
  /** One mark for the whole action — `undoFix` moves the folder back and restores content. */
  undoToken: string;
  /** The chronicle with the `lint` entry; it is not rolled back. */
  logged: string;
}

/** One file, before and after. Same shape as `DiscardChange`. */
interface RenameChange {
  path: string;
  before: string;
  next: string;
}

/** What `readAll` hands the write phase: the rewrites and the folder as it was read. */
interface RenameReads {
  changes: RenameChange[];
  /** Every file of the module folder with the hash it had when it was read. */
  folder: Map<string, string>;
}

function conflict(message: string): WikiError {
  return new WikiError('conflict', message);
}

/** `modules/<slug>/wiki/log.md` — never rewritten, so never part of the steps. */
function isLogFile(path: string): boolean {
  return /^modules\/[^/]+\/wiki\/log\.md$/u.test(path);
}

/** The plan plus the index lookups `rewrite` needs, gathered once per rename. */
interface RewriteContext {
  plan: RenamePlan;
  pagePaths: ReadonlySet<string>;
  projectPaths: ReadonlySet<string>;
  docs: ReadonlyMap<string, IndexedDoc>;
}

function rewriteContext(deps: ModuleLifecycleDeps, plan: RenamePlan): RewriteContext {
  return {
    plan,
    pagePaths: new Set(plan.pages.map((page) => page.path)),
    projectPaths: new Set(deps.index.projects().map((project) => project.path)),
    docs: deps.index.index().byPath,
  };
}

/**
 * The rewrites the plan announced for `path`, applied to `before`. Which rewriter
 * applies follows the plan's own reasons for listing the path — its role in the
 * module, the index's view of it as a project or a dump, the wikilinks in its body —
 * so nothing is rewritten here that the preview did not show.
 */
function rewrite(context: RewriteContext, path: string, before: string): string {
  const { plan } = context;
  const { slug, newSlug, oldTitle, title } = plan;
  let next = before;
  if (path === modulePath(slug)) next = retargetModuleFile(path, next, newSlug, title);
  if (path === agentsPath(slug)) {
    next = retargetHeadlineTitle(retargetModulePaths(next, slug, newSlug), oldTitle, title, ':');
  }
  if (path === wikiIndexPath(slug)) next = retargetHeadlineTitle(next, oldTitle, title, '—');
  if (path === modulePagePath(slug, 'overview')) {
    next = retargetOverviewTitle(path, next, oldTitle, title) ?? next;
  }
  if (plan.titleOnly) return next;

  const edit = { from: slug, to: newSlug };
  if (path.endsWith('.ingest.json')) return retargetIngestModules(next, edit)?.content ?? next;
  if (context.pagePaths.has(path)) next = retargetPageModule(path, next, newSlug);
  if (context.projectPaths.has(path)) next = retargetProjectModules(path, next, edit) ?? next;
  const doc = context.docs.get(path);
  if (doc?.docType === 'dump') next = retargetDumpFiledInto(path, next, slug, newSlug) ?? next;
  if (doc !== undefined && !path.startsWith('raw/') && !isLogFile(path)) {
    const body = parse(next).body;
    const linked = retargetModuleLinks(body, slug, newSlug);
    if (linked !== body) next = composeContent(path, next, { path, body: linked });
  }
  return next;
}

/**
 * Read the folder and every planned file, prove they are what the preview saw (the
 * fingerprint over exactly these contents), and compute every rewrite — all before
 * the first write.
 */
async function readAll(
  deps: ModuleLifecycleDeps,
  plan: RenamePlan,
  expected: string,
): Promise<RenameReads> {
  const { store } = deps;
  const folderPath = moduleDir(plan.slug);
  const texts = new Map<string, string>();
  const folder = new Map<string, string>();
  for (const path of await store.list({ dir: folderPath, recursive: true })) {
    const raw = await store.readText(path);
    if (raw === null) continue;
    texts.set(path, raw);
    folder.set(path, sha256(raw));
  }
  const hashes = new Map(folder);
  for (const change of plan.changes) {
    if (texts.has(change.path)) continue;
    const raw = await store.readText(change.path);
    if (raw === null) throw conflict(`„${change.path}“ fehlt seit der Vorschau.`);
    texts.set(change.path, raw);
    hashes.set(change.path, sha256(raw));
  }
  if (fingerprintOfHashes(hashes) !== expected) {
    throw conflict(`„${folderPath}“ wurde seit der Vorschau geaendert.`);
  }

  const context = rewriteContext(deps, plan);
  const changes: RenameChange[] = [];
  for (const change of plan.changes) {
    const before = texts.get(change.path);
    if (before === undefined) throw conflict(`„${change.path}“ fehlt seit der Vorschau.`);
    const next = rewrite(context, change.path, before);
    if (next !== before) changes.push({ path: change.path, before, next });
  }
  return { changes, folder };
}

/** The folder's hashes as they must read after the writes — anything else is a foreign hand. */
function expectedFolder(reads: RenameReads): Map<string, string> {
  const expected = new Map(reads.folder);
  for (const change of reads.changes) {
    if (expected.has(change.path)) expected.set(change.path, sha256(change.next));
  }
  return expected;
}

async function folderUnchanged(
  store: VaultStore,
  folderPath: string,
  expected: ReadonlyMap<string, string>,
): Promise<boolean> {
  const paths = await store.list({ dir: folderPath, recursive: true });
  if (paths.length !== expected.size) return false;
  for (const path of paths) {
    if (expected.get(path) !== (await store.hash(path))) return false;
  }
  return true;
}

/**
 * The write phase: content, a last look at the folder, the move. Fails anything, what
 * landed is rolled back through the journal already on disk. Should the move have
 * landed but the journal not yet learned of it, the folder is moved back here first —
 * the one moment the journal alone could not put it back.
 */
async function applyRename(
  store: VaultStore,
  plan: RenamePlan,
  token: string,
  journal: FixJournal,
  reads: RenameReads,
): Promise<FixMove | null> {
  const move: FixMove | null = plan.titleOnly
    ? null
    : { from: moduleDir(plan.slug), to: moduleDir(plan.newSlug) };
  try {
    for (const change of reads.changes) {
      await store.writeText(change.path, change.next, { expectedHash: sha256(change.before) });
    }
    if (move === null) return null;
    /* The last look before the one step without a hash guard: is the folder still
       exactly what was read, plus what was just written? If not, nothing moves. */
    if (!(await folderUnchanged(store, move.from, expectedFolder(reads)))) {
      throw conflict(`„${move.from}“ wurde zwischenzeitlich geaendert und bleibt stehen.`);
    }
    await store.move(move.from, move.to);
    try {
      await writeFixJournal(store, token, { ...journal, moved: move });
    } catch (error) {
      /* The journal on disk does not know the move, so `undoFix` below could not
         undo it — and its in-folder steps name the old paths. Back first, then undo. */
      await store.move(move.to, move.from);
      throw error;
    }
    return move;
  } catch (error) {
    await undoFix(store, token);
    throw error;
  }
}

/** A path inside the old folder, as it reads after the move. */
function finalPath(plan: RenamePlan, path: string): string {
  const from = moduleDir(plan.slug);
  if (plan.titleOnly || !isInside(from, path)) return path;
  return `${moduleDir(plan.newSlug)}${path.slice(from.length)}`;
}

/**
 * Rename module `slug` to `title` (new slug: `slugify(title)`, as `createModule`
 * derives it). Rewrites every pointer the plan listed, then moves the folder; one
 * mark undoes both. A title-only rename rewrites the title lines and moves nothing.
 */
export async function renameModule(
  deps: RenameWriteDeps,
  input: RenameInput,
): Promise<RenameResult> {
  const plan = await renamePlan(deps, input);
  if (plan.fingerprint !== input.fingerprint) {
    throw conflict(`„${moduleDir(plan.slug)}“ wurde seit der Vorschau geaendert.`);
  }
  if (plan.blocked === 'target-exists') {
    throw conflict(`Ein Modul „${plan.newSlug}“ gibt es schon.`);
  }
  if (plan.changes.length === 0) {
    throw new WikiError('invalid', 'Der Titel ist unveraendert.');
  }
  const reads = await readAll(deps, plan, input.fingerprint);

  const day = isoDay(deps.now ?? new Date());
  const token = createUndoToken(new Date(deps.now === undefined ? Date.now() : deps.now));
  const journal: FixJournal = {
    version: 1,
    kind: 'module-rename',
    action: 'module-rename',
    steps: reads.changes.map((change) => ({
      path: change.path,
      before: change.before,
      hashAfter: sha256(change.next),
    })),
  };
  await writeFixJournal(deps.store, token, journal);

  const moved = await applyRename(deps.store, plan, token, journal, reads);
  const written = reads.changes.map((change) => finalPath(plan, change.path));

  const entry = await appendLog(
    deps.store,
    plan.newSlug,
    {
      kind: 'lint',
      day,
      touched: written,
      findings: `rename (${plan.slug} -> ${plan.newSlug}): ${plan.oldTitle} -> ${plan.title}`,
    },
    { language: deps.docLanguage ?? 'de', now: day },
  );
  return {
    slug: plan.slug,
    newSlug: plan.newSlug,
    title: plan.title,
    moved: moved !== null,
    written,
    undoToken: token,
    logged: entry.path,
  };
}
