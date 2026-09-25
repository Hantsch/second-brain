/* Renaming and deleting a knowledge module (story 063, D4): channels, the main
 * handler, and the index settle that lets search and `askQuestion` reflect the
 * change immediately.
 *
 * Kept apart from `modules.ts` (list/create/pages/savePage/sources/graph) so
 * that file stays one responsibility — mirrors `condense:delete`
 * (`condense.ts:266-295`) and `gardener:discardPlan`/`discardPage`/`undoFix`
 * (`gardener.ts:145-180`) for the shape of a plan-then-apply-then-settle
 * channel group.
 *
 * Three decisions that otherwise aren't visible in the code:
 * - **The core plan/apply functions already re-plan and compare the
 *   fingerprint** (`renameModule`/`deleteModule` in `@core/wiki`) — a stale
 *   fingerprint surfaces as `WikiError('conflict', …)`, which `toIpcError`
 *   (`./errors.ts`) already translates into a `conflict` envelope by itself
 *   (its `code`/`message` shape matches `IpcError`). Nothing here needs to
 *   catch and re-throw that.
 * - **`digestion-pending` is not something the core plan knows about** — only
 *   this file sees the ingest queue (`hasPendingJobForModule`, `./ingest.ts`),
 *   so it's checked here and folded into the plan's `blocked` field for the
 *   preview, and turned into an explicit `conflict` for an apply that raced a
 *   digestion that started after the preview was shown.
 * - **`modules:undo` settles differently from `rename`/`delete`.** A restored
 *   or moved module folder has no `.md` extension, so `settle()`'s
 *   path-scoped gate (`IndexService.refresh(paths)`, `core/index/service.ts`)
 *   would see nothing relevant and skip the rebuild outright. `settleUndo`
 *   below calls the index's full `refresh()` directly instead — the same
 *   effect `settle` has, minus the gate that doesn't fit a bare folder path.
 *
 * No `createGateway` anywhere in this file: guardrail 1 (works without an
 * LLM) holds by construction here, not by a runtime check.
 */

import { undoFix } from '@core/gardener';
import { deleteModule, deletePlan, renameModule, renamePlan, withModuleLock } from '@core/wiki';
import type {
  DeletePlan,
  ModuleLifecycleDeps,
  ModuleLifecycleIndexView,
  RenamePlan,
} from '@core/wiki';
import { modulePath } from '@core/vault/paths';
import type {
  ModuleDeletePlan,
  ModuleDeleteResult,
  ModuleRenamePlan,
  ModuleRenameResult,
} from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { hasPendingJobForModule } from './ingest';
import { docLanguage, settle, wikiStore } from './wiki-bridge';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/**
 * What the lifecycle core needs from the index beyond `wiki-bridge.ts`'s own
 * `wikiIndex()` view (`index`/`search`/`pages`/`modules`): `sources()` and
 * `projects()` too. Same structural-check pattern as `condense.ts`'s
 * `knowsDocs` — a second narrow view onto the very same `IndexService`.
 */
const LIFECYCLE_INDEX_METHODS: readonly string[] = [
  'index',
  'pages',
  'sources',
  'projects',
  'modules',
];

function knowsLifecycle(index: IndexLike): index is IndexLike & ModuleLifecycleIndexView {
  const record = index as unknown as Record<string, unknown>;
  return LIFECYCLE_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

function lifecycleDeps(services: Services): ModuleLifecycleDeps {
  const index = services.requireIndex();
  if (!knowsLifecycle(index)) throw fail('io', 'der Index liefert keine Modul-Ableitungen');
  return { store: wikiStore(services), index };
}

/** A digestion still queued or running into `slug` — checked before both a plan
    (folds into `blocked`) and an apply (refuses outright). */
function digestionPending(services: Services, slug: string): boolean {
  return hasPendingJobForModule(services, slug);
}

/** The core plan, plus the one block reason only the IPC layer can see. Core
    `target-exists` always wins over the queue check: a plan already refused for
    one reason doesn't need a second. */
function withDigestionBlock(services: Services, plan: RenamePlan): ModuleRenamePlan;
function withDigestionBlock(services: Services, plan: DeletePlan): ModuleDeletePlan;
function withDigestionBlock(
  services: Services,
  plan: RenamePlan | DeletePlan,
): ModuleRenamePlan | ModuleDeletePlan {
  if (plan.blocked !== null) return plan;
  return digestionPending(services, plan.slug) ? { ...plan, blocked: 'digestion-pending' } : plan;
}

/** `modules:undo`'s own settle: see the header comment for why a full refresh,
    not a path-scoped one, is what a restored folder needs. */
async function settleUndo(services: Services, paths: readonly string[]): Promise<void> {
  const index = services.index();
  if (index?.refresh) {
    try {
      await index.refresh();
      await services.refreshIndexState();
    } catch (error) {
      // Derived state: its follow-up must never turn a successful undo into a failure.
      console.warn('[modules] Index-Nachlauf fehlgeschlagen:', error);
    }
  }
  services.sendEvent('event:vault-changed', { paths: [...paths], external: false });
}

export function moduleLifecycleHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'modules:renamePlan': async ({ slug, title }) => {
      const plan = await renamePlan(lifecycleDeps(services), { slug, title });
      return withDigestionBlock(services, plan);
    },

    'modules:deletePlan': async ({ slug }) => {
      const plan = await deletePlan(lifecycleDeps(services), { slug });
      return withDigestionBlock(services, plan);
    },

    'modules:rename': async ({ slug, title, fingerprint }): Promise<ModuleRenameResult> => {
      /* Checked again here, not only in the plan: a digestion may have started
         after the preview was shown, and the lock below covers only a running
         write phase, not a job still queued behind it. */
      if (digestionPending(services, slug)) {
        throw fail('conflict', `„${slug}“ wird gerade noch verdichtet.`);
      }
      const deps = { ...lifecycleDeps(services), docLanguage: docLanguage(services) };
      const result = await services.withoutWatcher(() =>
        withModuleLock(slug, () => renameModule(deps, { slug, title, fingerprint })),
      );
      /* `result.written` already names the new module.md (the plan always lists
         it), so the path-scoped gate in `settle()` never skips this — but the
         explicit `modulePath` below keeps that true even if a future plan ever
         didn't rewrite it, e.g. two modules merging into an unrelated slug. */
      await settle(services, [...result.written, modulePath(result.newSlug)], 'modules');
      return result;
    },

    'modules:delete': async ({ slug, fingerprint }): Promise<ModuleDeleteResult> => {
      if (digestionPending(services, slug)) {
        throw fail('conflict', `„${slug}“ wird gerade noch verdichtet.`);
      }
      const deps = lifecycleDeps(services);
      const result = await services.withoutWatcher(() =>
        withModuleLock(slug, () => deleteModule(deps, { slug, fingerprint })),
      );
      /* Unlike rename, `result.written` can be empty (no outside source or
         project referenced the module) — `modulePath` guarantees at least one
         `.md`-extension path so `settle()`'s gate always runs the rebuild that
         notices the folder is gone. */
      await settle(services, [...result.written, modulePath(slug)], 'modules');
      return result;
    },

    'modules:undo': async ({ undoToken }) => {
      const result = await services.withoutWatcher(() => undoFix(wikiStore(services), undoToken));
      await settleUndo(services, result.restored);
      return result;
    },
  });
}
