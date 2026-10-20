/* Pure preconditions for fetching a local runtime's engine OR a model file
   into it (033, D1) — the generalisation of what `runtime-plan.ts` (019c)
   did for Ollama's installer alone. Platform + free disk + download size +
   writability → whether the fetch can even be attempted, and if not, why.
   No filesystem, no process, no Electron: main supplies every fact as a
   plain parameter, `input.platform` is data (not `process.platform`), and
   this function never throws. Shared between the engine fetch and the model
   file fetch on purpose (033 Plan, step 1) — they differ only in what asset
   and size they refer to, not in how the decision is made. */

import type { RuntimeBlockedReason, RuntimeDownloadPlan, RuntimeId } from '@shared/types';

/* `RuntimeDownloadPlan` lives in `@shared/types`, not here, so the
   renderer's separate TypeScript project (`tsconfig.web.json`) can type a
   plan without pulling in the rest of `core/llm` — only main may import and
   run `planRuntimeDownload` itself. Re-exported here for this module's own
   callers' convenience, same as `runtime-plan.ts` does for `RuntimePlan`. */
export type { RuntimeDownloadPlan };

/** What kind of thing is being downloaded — changes nothing about the
    decision logic below, but is carried through to the result so a caller
    (and a test) can tell an engine refusal from a model refusal. */
export type RuntimeDownloadKind = 'engine' | 'model';

export interface RuntimeDownloadInput {
  runtime: RuntimeId;
  kind: RuntimeDownloadKind;
  /** `os.platform()`, e.g. `'win32' | 'darwin' | 'linux'`. */
  platform: string;
  /** From the machine facts; `null` means "couldn't be determined". */
  freeDiskMb: number | null;
  /** Size of the thing being fetched, in MB — the engine archive's
      `totalEngineDownloadMb()` for `kind: 'engine'`, or the picked file's
      size for `kind: 'model'`. */
  downloadMb: number;
  /** Where the fetch would be written — main supplies this (a path under
      `<userData>/runtimes/...` or `<userData>/models/gguf/...`); this
      function does no path construction itself. */
  targetPath: string;
  /** Whether the target directory actually accepted a write, as determined
      by main's own cheap probe (write a small file, then delete it) — this
      function does no I/O of its own, it only judges the outcome main
      already measured. */
  writable: boolean;
  /** Whether this runtime/platform (and, for an engine fetch, build) has a
      known asset at all — `descriptors.ts`'s `runtimeSupportsPlatform()`
      (or a `getEngineAsset()` lookup) for `kind: 'engine'`; for `kind:
      'model'` the same platform-support check, since a model is pointless on
      a platform that can't run the engine in the first place. */
  assetAvailable: boolean;
}

/** Extra headroom required above the download's own size, so the plan
    doesn't greenlight a fetch that would land with (near) zero bytes free —
    unpacking/writing needs room too. A guess, not a measurement; named so it
    can be revisited without hunting for a magic literal. Same value and same
    reasoning as `runtime-plan.ts`'s pre-033 `DISK_SAFETY_MARGIN_MB`, applied
    uniformly to engine and model fetches rather than inventing a second
    constant for no behavioural reason. */
export const DISK_SAFETY_MARGIN_MB = 500;

function blocked(
  input: RuntimeDownloadInput,
  blockedReason: RuntimeBlockedReason,
): RuntimeDownloadPlan {
  return {
    runtime: input.runtime,
    kind: input.kind,
    canDownload: false,
    blockedReason,
    downloadMb: input.downloadMb,
    targetPath: input.targetPath,
    freeDiskMb: input.freeDiskMb,
  };
}

/**
 * Facts → plan. Never throws: every input is either used as given or, for
 * `freeDiskMb === null` ("couldn't be determined", never a guessed zero —
 * see `MachineFacts`), treated as "unknown, so don't block on it" — the
 * actual download step will fail honestly if space really is short, rather
 * than this heuristic refusing an attempt that might have worked.
 *
 * Exactly three `blockedReason` values are reachable from here, checked in
 * this order so an unsupported platform is reported even when disk is also
 * short and a write-permission problem is never checked before disk is:
 * `'unsupported-platform'` (no known asset for this runtime/platform/kind),
 * `'insufficient-disk'` (the download plus safety margin exceeds free disk),
 * `'no-write-permission'` (the target directory refused main's probe write).
 */
export function planRuntimeDownload(input: RuntimeDownloadInput): RuntimeDownloadPlan {
  if (!input.assetAvailable) {
    return blocked(input, 'unsupported-platform');
  }

  const requiredMb = input.downloadMb + DISK_SAFETY_MARGIN_MB;
  const insufficientDisk = input.freeDiskMb !== null && input.freeDiskMb < requiredMb;
  if (insufficientDisk) {
    return blocked(input, 'insufficient-disk');
  }

  if (!input.writable) {
    return blocked(input, 'no-write-permission');
  }

  return {
    runtime: input.runtime,
    kind: input.kind,
    canDownload: true,
    blockedReason: null,
    downloadMb: input.downloadMb,
    targetPath: input.targetPath,
    freeDiskMb: input.freeDiskMb,
  };
}
