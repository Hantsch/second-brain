/**
 * Deleting a knowledge module — the write half of `deletePlan` (story 063, D3).
 *
 * The order is `discardPage`'s (`@core/gardener/discard-page.ts`) and D2's
 * `renameModule`'s, minus the move:
 *
 * 1. **Plan again.** `deletePlan` runs here, at click time; its fingerprint has to be
 *    the one the preview showed, or the write refuses with `conflict`.
 * 2. **Read everything, then write.** Every file the plan named — a source's
 *    `.ingest.json`, a project's frontmatter — is read, fingerprinted and rewritten
 *    in memory before the first write. A file edited since the preview raises
 *    `conflict` while nothing has been touched.
 * 3. **Content first, delete last.** Every rewrite lands with the hash just read.
 *    Only then — after a last look at the whole module folder — does
 *    `VaultStore.delete` take the folder to the trash, nested under the journal's
 *    `deleted` mark exactly as `discardPage` nests a page's. One mark, one way back.
 * 4. **Roll back on failure.** Anything throws on the way, `undoFix` undoes what
 *    landed and the original error is rethrown.
 *
 * What is deliberately *not* rewritten here (story 063's decisions, already
 * reflected in `deletePlan`'s `changes`, which never lists any of these):
 * - inbound `[[slug/…]]` wikilinks from outside the module (`deletePlan.brokenLinks`
 *   names them for the preview; there is no target left to repoint them at),
 * - dump `filed_into` receipts pointing into the deleted module,
 * - any file under `raw/` — only its `.ingest.json` sidecar loses the slug.
 */

import { undoFix, writeFixJournal } from '@core/gardener/undo';
import type { FixDelete, FixJournal } from '@core/gardener/undo';
import { sha256 } from '@core/vault/hash';
import { moduleDir } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import type { VaultStore } from '@core/vault/types';
import { WikiError } from '../types';
import { deletePlan, fingerprintOfHashes } from './plan';
import { retargetIngestModules, retargetProjectModules } from './refs';
import type { DeletePlan, DeletePlanInput, ModuleLifecycleDeps } from './types';

/** What the write needs beyond the preview: the clock, for the undo token. */
export interface DeleteWriteDeps extends ModuleLifecycleDeps {
  /** The "now". Tests pass a fixed time. */
  now?: DateLike;
}

export interface DeleteInput extends DeletePlanInput {
  /** `plan.fingerprint` of the preview the user confirmed. */
  fingerprint: string;
}

export interface DeleteResult {
  slug: string;
  /** Every rewritten file — a source's protocol or a project, never inside the
   * deleted folder. */
  written: string[];
  /** The module folder's path, now in the trash. */
  deleted: string;
  /** One mark for the whole action — `undoFix` restores the folder and the content. */
  undoToken: string;
}

/** One file, before and after. Same shape as `RenameChange`/`DiscardChange`. */
interface DeleteChange {
  path: string;
  before: string;
  next: string;
}

/** What `readAll` hands the write phase: the rewrites and the folder as it was read. */
interface DeleteReads {
  changes: DeleteChange[];
  /** Every file of the module folder with the hash it had when it was read — the
   * folder itself is never rewritten, so this is only for the last look before
   * the delete. */
  folder: Map<string, string>;
}

function conflict(message: string): WikiError {
  return new WikiError('conflict', message);
}

/**
 * The one rewrite `deletePlan` could have listed `path` for: an `.ingest.json`
 * protocol loses the slug (and `sourcePage` where its list emptied), a project's
 * `modules:` loses it too. Nothing else ever appears in `plan.changes` for a delete.
 */
function rewrite(slug: string, path: string, before: string): string {
  const edit = { from: slug, to: null };
  if (path.endsWith('.ingest.json')) return retargetIngestModules(before, edit)?.content ?? before;
  return retargetProjectModules(path, before, edit) ?? before;
}

/**
 * Read the module folder and every planned file, prove they are what the preview
 * saw (the fingerprint over exactly these contents), and compute every rewrite —
 * all before the first write.
 */
async function readAll(
  deps: ModuleLifecycleDeps,
  plan: DeletePlan,
  expected: string,
): Promise<DeleteReads> {
  const { store } = deps;
  const folderPath = moduleDir(plan.slug);
  const folder = new Map<string, string>();
  for (const path of await store.list({ dir: folderPath, recursive: true })) {
    const hash = await store.hash(path);
    if (hash !== null) folder.set(path, hash);
  }
  const hashes = new Map(folder);
  const texts = new Map<string, string>();
  for (const change of plan.changes) {
    const raw = await store.readText(change.path);
    if (raw === null) throw conflict(`„${change.path}“ fehlt seit der Vorschau.`);
    texts.set(change.path, raw);
    hashes.set(change.path, sha256(raw));
  }
  if (fingerprintOfHashes(hashes) !== expected) {
    throw conflict(`„${folderPath}“ wurde seit der Vorschau geaendert.`);
  }

  const changes: DeleteChange[] = [];
  for (const change of plan.changes) {
    const before = texts.get(change.path);
    if (before === undefined) throw conflict(`„${change.path}“ fehlt seit der Vorschau.`);
    const next = rewrite(plan.slug, change.path, before);
    if (next !== before) changes.push({ path: change.path, before, next });
  }
  return { changes, folder };
}

/** Same check as `renameModule`'s private `folderUnchanged` — the last look before
 * the one step without a hash guard. Kept local rather than shared: both are eight
 * lines against a `VaultStore` and neither is exported. */
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
 * The write phase: content, a last look at the folder, the delete. Fails anything,
 * what already landed is rolled back through the journal already on disk.
 */
async function applyDelete(
  store: VaultStore,
  plan: DeletePlan,
  token: string,
  reads: DeleteReads,
): Promise<FixDelete> {
  const folderPath = moduleDir(plan.slug);
  try {
    for (const change of reads.changes) {
      await store.writeText(change.path, change.next, { expectedHash: sha256(change.before) });
    }
    /* The last look before the one step that takes the folder away: is it still
       exactly what was read? None of the content writes above touch anything
       inside it, so `reads.folder` is still the expectation, unlike a rename. */
    if (!(await folderUnchanged(store, folderPath, reads.folder))) {
      throw conflict(`„${folderPath}“ wurde zwischenzeitlich geaendert und bleibt stehen.`);
    }
    const result = await store.delete(folderPath);
    return { path: result.path, token: result.undoToken };
  } catch (error) {
    await undoFix(store, token);
    throw error;
  }
}

/**
 * Delete module `slug`: drop the slug from every source's `.ingest.json` (resetting
 * `sourcePage` to `null` where that empties its `modules` list) and from every
 * project's `modules:`, then move the whole `modules/<slug>/` folder to the trash.
 * One mark undoes both the content edits and the folder. Inbound wikilinks and dump
 * `filed_into` receipts are left exactly as they are (story 063's decision) — there
 * is nothing to repoint them at.
 */
export async function deleteModule(
  deps: DeleteWriteDeps,
  input: DeleteInput,
): Promise<DeleteResult> {
  const plan = await deletePlan(deps, input);
  if (plan.fingerprint !== input.fingerprint) {
    throw conflict(`„${moduleDir(plan.slug)}“ wurde seit der Vorschau geaendert.`);
  }
  const reads = await readAll(deps, plan, input.fingerprint);

  const token = createUndoToken(new Date(deps.now === undefined ? Date.now() : deps.now));
  const journal: FixJournal = {
    version: 1,
    kind: 'module-delete',
    action: 'module-delete',
    steps: reads.changes.map((change) => ({
      path: change.path,
      before: change.before,
      hashAfter: sha256(change.next),
    })),
  };
  await writeFixJournal(deps.store, token, journal);

  const deleted = await applyDelete(deps.store, plan, token, reads);
  /* Only now is the delete mark known, and it belongs in the same journal: one
     action, one way back — as `discardPage` does for a single page. */
  await writeFixJournal(deps.store, token, { ...journal, deleted });

  return {
    slug: plan.slug,
    written: reads.changes.map((change) => change.path),
    deleted: deleted.path,
    undoToken: token,
  };
}
