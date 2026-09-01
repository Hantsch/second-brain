/**
 * Writes an accepted `CondenseAreaProposal` to `areas/<slug>.condensed.md` — the
 * only place in `condense/` that touches the vault (`run.ts` never writes).
 *
 * Same hash-guard as `src/main/ipc/areas.ts`: no bespoke conflict logic here,
 * just `VaultStore.writeText()` with the hash the proposal was built from.
 * `baseHash: null` (D7: "no existing artifact") becomes `mustNotExist: true` —
 * the same "must not exist yet" the areas channel uses for a freshly created
 * area, not a hash to compare against. A stale hash throws `VaultConflictError`
 * (`code: 'conflict'`) before anything is touched (`assertWritable` runs first,
 * inside the store); this function does not catch it — the caller (038's IPC
 * handler) decides what a conflict means to the user.
 *
 * `VaultStore.write`/`writeText` never move the previous version to
 * `.secondbrain/trash/` on their own — only `VaultStore.delete()` does that
 * (`src/core/vault/fs-store.ts`, `memory-store.ts`). So a condensed artifact
 * that gets replaced is overwritten in place, same as any other file the app
 * writes; there is no separate trash step to invoke here.
 */

import type { WriteResult } from '@shared/types';
import type { VaultStore } from '@core/vault';
import type { CondenseAreaProposal } from './run';
import { condensedAreaPath } from './paths';

/**
 * Writes the proposal's content, hash-guarded. Throws `VaultConflictError` on a
 * stale `baseHash` or, when `baseHash` is `null`, if the file appeared in the
 * meantime.
 */
export async function writeCondensedArea(
  store: VaultStore,
  proposal: CondenseAreaProposal,
): Promise<WriteResult> {
  const path = condensedAreaPath(proposal.slug);
  return store.writeText(
    path,
    proposal.content,
    proposal.baseHash === null ? { mustNotExist: true } : { expectedHash: proposal.baseHash },
  );
}
