/**
 * Discarding a page — the write half of `discard.ts`.
 *
 * `discardPage` is the only path in this app that takes a page out of the vault.
 * Its order **is** the guarantee, and it is fixed:
 *
 * 1. **Plan.** `discardPlan` runs again here, at click time — the preview a user
 *    saw is never what gets applied.
 * 2. **Read everything, then write.** Every file that is about to change is read
 *    and its new content computed *before* the first write, so a page that no
 *    longer matches the plan raises `conflict` while nothing has been touched.
 * 3. **Content first, delete last.** Repoints and catalog line are written with the
 *    hash just read; only then does the page go to the trash. A stale hash
 *    therefore aborts while **both** files are still there — a conflict can never
 *    leave a half-discarded pair behind.
 * 4. **One mark.** The journal is written before the writes (as in `fixes.ts`) and
 *    then carries the delete mark, so a single `undoFix` puts content and file back.
 * 5. **Roll back on failure.** Should a write fail mid-loop — the one window this
 *    store shape leaves, between the reads and the writes — `undoFix` undoes what
 *    already landed and the error is rethrown. By (3) the delete has not happened
 *    at that point.
 *
 * The chronicle is append-only and never rolled back, exactly as with a fix.
 */

import type { DocLanguage } from '@shared/types';
import { composeContent } from '@core/vault/compose';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import type { VaultStore } from '@core/vault/types';
import { appendLog, removeEntries } from '@core/wiki';
import { discardPlan } from './discard';
import type { DiscardDeps, DiscardInput, DiscardPlan, DiscardRepoint } from './discard';
import { GardenerError } from './types';
import { undoFix, writeFixJournal } from './undo';
import type { FixDelete, FixJournal } from './undo';

/** What the write needs beyond the preview: the language of the log entry and the clock. */
export interface DiscardWriteDeps extends DiscardDeps {
  /** Language of the chronicle entry. */
  docLanguage?: DocLanguage;
  /** The "now". Tests pass a fixed time. */
  now?: DateLike;
}

export interface DiscardWriteInput extends DiscardInput {
  /**
   * The hash the confirm step was shown (`plan.target.hash`). Given, a page that has
   * been edited since raises `conflict` instead of being discarded silently.
   */
  expectedHash?: string;
}

export interface DiscardResult {
  /** The page that is now in the trash. */
  discarded: string;
  /** Files whose content changed: repointed pages and the catalog. */
  written: string[];
  /** One mark for the whole action — `undoFix` restores content *and* file. */
  undoToken: string;
  /** The chronicle with the `lint` entry; it is not rolled back. */
  logged: string | null;
}

/** One file, before and after. Same shape as `Change` in `fixes.ts`. */
interface DiscardChange {
  path: string;
  before: string;
  next: string;
}

async function rawOf(store: VaultStore, path: string): Promise<string> {
  const raw = await store.readText(path);
  if (raw === null) throw new GardenerError('not-found', `Datei fehlt: ${path}`);
  return raw;
}

/**
 * `body` with every planned line replaced. `null` if not every planned line is still
 * there — then the page was edited between plan and write, and writing the computed
 * text would rewrite a line the plan never saw.
 */
function applyRepoints(body: string, repoints: readonly DiscardRepoint[]): string | null {
  const wanted = new Map(repoints.map((repoint) => [repoint.before, repoint.after]));
  let hits = 0;
  const lines = body.split('\n').map((line) => {
    const after = wanted.get(line);
    if (after === undefined) return line;
    hits += 1;
    return after;
  });
  return hits === repoints.length ? lines.join('\n') : null;
}

/**
 * Everything that has to be written, computed from files read just now — all of it
 * before the first write. Bodies only: the frontmatter of an inbound page (and with
 * it `sources:`) stays byte-identical, and `updated` is deliberately left alone —
 * a repoint is a consequence of *this* action, not an edit of that page.
 */
async function contentChanges(
  store: VaultStore,
  plan: DiscardPlan,
): Promise<readonly DiscardChange[]> {
  const changes: DiscardChange[] = [];
  const byPath = new Map<string, DiscardRepoint[]>();
  for (const repoint of plan.repoints) {
    const list = byPath.get(repoint.path) ?? [];
    list.push(repoint);
    byPath.set(repoint.path, list);
  }
  for (const [path, repoints] of byPath) {
    const before = await rawOf(store, path);
    const body = applyRepoints(parse(before).body, repoints);
    if (body === null) {
      throw new GardenerError('conflict', `„${path}" wurde seit der Vorschau geaendert.`);
    }
    const next = composeContent(path, before, { path, body });
    if (next !== before) changes.push({ path, before, next });
  }
  if (plan.catalogLine !== null) {
    const before = await rawOf(store, plan.catalogPath);
    const next = removeEntries(before, [plan.target.slug]);
    if (next === before) {
      throw new GardenerError(
        'conflict',
        `Die Zeile zu „${plan.target.slug}" steht nicht mehr in ${plan.catalogPath}.`,
      );
    }
    changes.push({ path: plan.catalogPath, before, next });
  }
  return changes;
}

/** `[[slug]]` per touched page, `index.md` for the catalog — as in `fixes.ts`. */
function touchedOf(plan: DiscardPlan, written: readonly string[]): string[] {
  const linkOf = new Map(plan.inbound.map((ref) => [ref.path, `[[${ref.slug}]]`]));
  return [
    `[[${plan.target.slug}]]`,
    ...written.map((path) => (path === plan.catalogPath ? 'index.md' : (linkOf.get(path) ?? path))),
  ];
}

/**
 * The write phase: content, then the delete. Fails anything, what already landed is
 * rolled back through the journal that is already on disk — with the same hash check
 * `undoFix` uses, so a file somebody else touched in between stays as it is.
 */
async function applyPlan(
  store: VaultStore,
  plan: DiscardPlan,
  token: string,
  changes: readonly DiscardChange[],
): Promise<{ written: string[]; deleted: FixDelete }> {
  const written: string[] = [];
  try {
    for (const change of changes) {
      await store.writeText(change.path, change.next, { expectedHash: sha256(change.before) });
      written.push(change.path);
    }
    /* The last look before the one step that takes a file away: is the page still the
       one the plan read? If not, nothing is discarded. */
    if ((await store.hash(plan.target.path)) !== plan.target.hash) {
      throw new GardenerError(
        'conflict',
        `„${plan.target.path}" wurde zwischenzeitlich geaendert und bleibt stehen.`,
      );
    }
    const result = await store.delete(plan.target.path);
    return { written, deleted: { path: result.path, token: result.undoToken } };
  } catch (error) {
    await undoFix(store, token);
    throw error;
  }
}

/**
 * Discard `path`: repoint the inbound wikilinks at `keep`, take the catalog line out,
 * move the page to the trash. One mark for all three — `undoFix` reverses the whole
 * action. Nothing is merged and nothing is chosen here: which page goes is the
 * caller's decision, and `keep` alone decides whether the links are repointed.
 */
export async function discardPage(
  deps: DiscardWriteDeps,
  input: DiscardWriteInput,
): Promise<DiscardResult> {
  const plan = await discardPlan(deps, input);
  if (input.expectedHash !== undefined && input.expectedHash !== plan.target.hash) {
    throw new GardenerError(
      'conflict',
      `„${plan.target.path}" wurde seit der Vorschau geaendert und bleibt stehen.`,
    );
  }
  const changes = await contentChanges(deps.store, plan);

  const day = isoDay(deps.now ?? new Date());
  const token = createUndoToken(new Date(deps.now === undefined ? Date.now() : deps.now));
  const journal: FixJournal = {
    version: 1,
    kind: 'discard',
    action: 'discard',
    steps: changes.map((change) => ({
      path: change.path,
      before: change.before,
      hashAfter: sha256(change.next),
    })),
  };
  await writeFixJournal(deps.store, token, journal);

  const { written, deleted } = await applyPlan(deps.store, plan, token, changes);
  /* Only now is the delete mark known, and it belongs in the same journal: one
     action, one way back. */
  await writeFixJournal(deps.store, token, { ...journal, deleted });

  const entry = await appendLog(
    deps.store,
    plan.target.module,
    {
      kind: 'lint',
      day,
      touched: touchedOf(plan, written),
      findings: `discard (${plan.target.path})`,
    },
    { language: deps.docLanguage ?? 'de', now: day },
  );
  return { discarded: deleted.path, written, undoToken: token, logged: entry.path };
}
