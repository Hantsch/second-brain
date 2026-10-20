/**
 * Writes an accepted condensation proposal to its artifact path — the only
 * place in `condense/` that touches the vault (`run.ts`/`run-project.ts` never
 * write).
 *
 * One writer, the path a parameter (story 044, D9): `areas/<slug>.condensed.md`
 * and `projects/<scope>/<slug>/condensed.md` go through the same hash guard,
 * because a second copy of that guard is a second place it can be got wrong.
 * The two level-specific entry points exist only to *derive* the path from the
 * proposal's identity rather than trusting a path field — the same distrust
 * every handler in `src/main/ipc/` applies to a path it did not build itself.
 *
 * Same hash-guard as `src/main/ipc/areas.ts`: no bespoke conflict logic here,
 * just `VaultStore.writeText()` with the hash the proposal was built from.
 * `baseHash: null` ("no existing artifact") becomes `mustNotExist: true` —
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
import type { CondenseProjectProposal } from './run-project';
import { condensedAreaPath, condensedProjectPath } from './paths';

/**
 * What writing an artifact needs, whatever level it belongs to: the whole file
 * and the hash it was built from. Both proposal types carry exactly this.
 */
export interface CondensedWrite {
  /** The whole file, frontmatter included, written unchanged. */
  content: string;
  /**
   * sha256 of the artifact as the run read it, or `null` when none existed.
   * `null` means "must not exist yet" rather than "overwrite whatever is there".
   */
  baseHash: string | null;
}

/**
 * Writes `artifact.content` to `path`, hash-guarded. Throws
 * `VaultConflictError` on a stale `baseHash` or, when `baseHash` is `null`, if
 * the file appeared in the meantime.
 */
export async function writeCondensedArtifact(
  store: VaultStore,
  path: string,
  artifact: CondensedWrite,
): Promise<WriteResult> {
  return store.writeText(
    path,
    artifact.content,
    artifact.baseHash === null ? { mustNotExist: true } : { expectedHash: artifact.baseHash },
  );
}

/** Writes an area proposal to `areas/<slug>.condensed.md`. */
export async function writeCondensedArea(
  store: VaultStore,
  proposal: CondenseAreaProposal,
): Promise<WriteResult> {
  return writeCondensedArtifact(store, condensedAreaPath(proposal.slug), proposal);
}

/** Writes a project proposal to `projects/<scope>/<slug>/condensed.md`. */
export async function writeCondensedProject(
  store: VaultStore,
  proposal: CondenseProjectProposal,
): Promise<WriteResult> {
  return writeCondensedArtifact(
    store,
    condensedProjectPath(proposal.scope, proposal.slug),
    proposal,
  );
}
