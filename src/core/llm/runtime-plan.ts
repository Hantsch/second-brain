/* Ollama-shaped preconditions for getting a local runtime installed in-app
   (019c, D1). Thin wrapper (033, D1) around the generalised
   `planRuntimeDownload` in `runtime/plan.ts`: this module now only knows the
   Ollama-specific vocabulary (`installerPath`, `modelDirHint`,
   `installerSizeMb`) and translates it to and from the shared decision
   logic, so `tests/core/llm/runtime-plan.test.ts` keeps passing unedited —
   same inputs, same outputs, same behaviour, just no longer its own copy of
   the platform/disk/writability judgement. */

import * as path from 'node:path';
import * as os from 'node:os';
import type { RuntimeBlockedReason, RuntimePlan } from '@shared/types';
import { runtimeSupportsPlatform } from './runtime/descriptors';
import { planRuntimeDownload } from './runtime/plan';

/* `RuntimeBlockedReason` and `RuntimePlan` live in `@shared/types`, not here,
   so the renderer's separate TypeScript project (`tsconfig.web.json`) can
   type the plan without pulling in the rest of `core/llm` — only main may
   import and run `planRuntimeInstall` itself. Re-exported here for this
   module's own callers' convenience, same as `capacity.ts` does for
   `CapacityVerdict`/`LimitingFactor`. */
export type { RuntimeBlockedReason, RuntimePlan };

/** What the caller (main) already knows and hands in — this function does
    no detection of its own, it only judges. */
export interface RuntimePlanInput {
  /** `os.platform()`, e.g. `'win32' | 'darwin' | 'linux'`. */
  platform: string;
  /** From the 019a machine facts; `null` means "couldn't be determined". */
  freeDiskMb: number | null;
  /** Size of the official installer for this platform, in MB. */
  installerSizeMb: number;
  /** Where the installer would be saved — main supplies this from Electron's
      `app.getPath('temp')`; this function stays pure and never calls
      Electron itself. */
  tempDir: string;
  /** Whether `tempDir` actually accepted a write, as determined by main's own
      cheap probe (write a small file, then delete it) — this function does
      no I/O of its own, it only judges the outcome main already measured. */
  writable: boolean;
}

/** Name the installer is saved under, per platform — recognizable in a temp
    folder and in support requests. Only reached for the two installable
    platforms; the fallback below is never shown to a user (`canInstall` is
    always `false` first), but keeps the return type a plain string with no
    special-cased `null`. */
function installerFilename(platform: string): string {
  switch (platform) {
    case 'win32':
      return 'OllamaSetup.exe';
    case 'darwin':
      return 'Ollama.dmg';
    default:
      return 'ollama-installer';
  }
}

/** Where Ollama keeps its downloaded models. Same formula as
    `machine-scan.ts`'s `ollamaModelsDir()` (`~/.ollama/models`,
    `%USERPROFILE%\.ollama\models` on win32) — replicated here rather than
    imported, because that function lives in main and this module may not
    depend on it; kept identical on purpose so the two never drift apart. */
function ollamaModelsDirHint(): string {
  return path.join(os.homedir(), '.ollama', 'models');
}

/**
 * Facts → plan. Never throws — see `planRuntimeDownload` in `runtime/plan.ts`
 * for the shared reasoning behind every branch (platform support, disk
 * safety margin, `freeDiskMb === null` never blocking). This wrapper only
 * adds the Ollama-specific paths/hints the pre-033 callers still expect.
 */
export function planRuntimeInstall(input: RuntimePlanInput): RuntimePlan {
  /* `path.win32`/`path.posix` explicitly, not the bare `path` module: the
     latter is bound to the host running this code, but `input.platform` is
     data, not necessarily the host — fixtures for every platform must be
     able to run (and pass) on any single CI/dev machine. */
  const joinPath = input.platform === 'win32' ? path.win32.join : path.posix.join;
  const installerPath = joinPath(input.tempDir, installerFilename(input.platform));
  const modelDirHint = ollamaModelsDirHint();

  const download = planRuntimeDownload({
    runtime: 'ollama',
    kind: 'engine',
    platform: input.platform,
    freeDiskMb: input.freeDiskMb,
    downloadMb: input.installerSizeMb,
    targetPath: installerPath,
    writable: input.writable,
    assetAvailable: runtimeSupportsPlatform('ollama', input.platform),
  });

  return {
    canInstall: download.canDownload,
    blockedReason: download.blockedReason,
    downloadMb: download.downloadMb,
    installerPath,
    modelDirHint,
  };
}
