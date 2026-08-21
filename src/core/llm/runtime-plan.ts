/* Pure preconditions for getting a local runtime installed in-app (019c, D1):
   platform + free disk + installer size → whether an in-app install is even
   possible, and if so, what it would cost and where things would go. No
   filesystem, no process, no Electron — main supplies every fact as a plain
   parameter, and this function never throws. */

import * as path from 'node:path';
import * as os from 'node:os';
import type { RuntimeBlockedReason, RuntimePlan } from '@shared/types';

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

/** Ollama ships an official downloadable GUI installer only for Windows and
    macOS. Linux's official install path is a shell script (`curl | sh`),
    which this app's guardrails forbid running as a constructed shell command
    — no shell strings, ever. Linux therefore always gets the manual path;
    this is a deliberate, documented scope decision, not an oversight. */
const INSTALLABLE_PLATFORMS: readonly string[] = ['win32', 'darwin'];

/** Extra headroom required above the installer size itself, so the plan
    doesn't greenlight a download that would land with (near) zero bytes
    free — the temp copy and the installer's own extraction both need room
    too. A guess, not a measurement; named so it can be revisited without
    hunting for a magic literal. */
const DISK_SAFETY_MARGIN_MB = 500;

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
 * Facts → plan. Never throws: every input is either used as given or, for
 * `freeDiskMb === null` ("couldn't be determined", never a guessed zero —
 * see `MachineFacts`), treated as "unknown, so don't block on it" — the
 * actual download step will fail honestly if space really is short, rather
 * than this heuristic refusing an attempt that might have worked.
 */
export function planRuntimeInstall(input: RuntimePlanInput): RuntimePlan {
  const downloadMb = input.installerSizeMb;
  /* `path.win32`/`path.posix` explicitly, not the bare `path` module: the
     latter is bound to the host running this code, but `input.platform` is
     data, not necessarily the host — fixtures for every platform must be
     able to run (and pass) on any single CI/dev machine. */
  const joinPath = input.platform === 'win32' ? path.win32.join : path.posix.join;
  const installerPath = joinPath(input.tempDir, installerFilename(input.platform));
  const modelDirHint = ollamaModelsDirHint();

  if (!INSTALLABLE_PLATFORMS.includes(input.platform)) {
    return {
      canInstall: false,
      blockedReason: 'unsupported-platform',
      downloadMb,
      installerPath,
      modelDirHint,
    };
  }

  const requiredMb = input.installerSizeMb + DISK_SAFETY_MARGIN_MB;
  const insufficientDisk = input.freeDiskMb !== null && input.freeDiskMb < requiredMb;
  if (insufficientDisk) {
    return {
      canInstall: false,
      blockedReason: 'insufficient-disk',
      downloadMb,
      installerPath,
      modelDirHint,
    };
  }

  if (!input.writable) {
    return {
      canInstall: false,
      blockedReason: 'no-write-permission',
      downloadMb,
      installerPath,
      modelDirHint,
    };
  }

  return { canInstall: true, blockedReason: null, downloadMb, installerPath, modelDirHint };
}
