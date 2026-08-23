/* llama.cpp's install half of `RuntimeInstaller` (033, D6) — the second
 * runtime behind the same channels Ollama already uses, mirroring
 * `ollama-install.ts`: `llm:downloadRuntime` returns a `downloadId`
 * immediately, the run continues in the background reporting over
 * `event:install-progress` (no third progress shape), and
 * `llm:cancelRuntimeDownload` looks that id up in an `AbortController` map to
 * abort it.
 *
 * This file is the boundary: which build this machine gets, whether the fetch
 * may be attempted at all, and what `status` may claim. The run itself — and
 * with it the staging-then-rename discipline that makes "a cancelled fetch
 * leaves no installed engine" true — lives in `llamacpp-fetch.ts`.
 *
 * Three things worth knowing before reading on:
 *
 * - **The build is derived by default, and only overridable to something real.**
 *   Main turns the remembered GPU scan into a build through D2's pure
 *   classifier; the `buildId` the channels may carry (033, D10 — the dialog's
 *   build select) wins over that, but only when this machine actually has an
 *   asset for it, otherwise the derived choice stands. Nothing here guesses.
 * - **Platform and architecture are both resolved here, once.** `os.arch()` is
 *   as load-bearing as `os.platform()`: the release ships a separate archive
 *   per architecture, and an x64 archive on an arm64 machine is an engine that
 *   cannot execute.
 * - **Only the target directory counts as installed.** `status` never looks at
 *   a staging directory, which is what lets a cancelled run answer `absent`
 *   honestly (AC 3).
 */

import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import { app, shell } from 'electron';
import {
  availableEngineBuilds,
  getEngineAsset,
  planRuntimeDownload,
  selectEngineBuild,
  totalEngineDownloadMb,
} from '@core/llm';
import type { EngineAssetDescriptor } from '@core/llm';
import type {
  EngineBuildId,
  EngineBuildReason,
  LocalRuntimeStatus,
  MachineFacts,
  RuntimePlan,
} from '@shared/types';
import type { FetchFn } from '../ollama-install';
import { detectFreeDiskMb } from '../machine-scan';
import type { HandlerMap } from '../registry';
import { fail } from '../registry';
import type { EngineFs } from './engine-fs';
import { nodeEngineFs } from './engine-fs';
import type { EngineFetchInput, EngineFetchIo } from './llamacpp-fetch';
import { runEngineFetch } from './llamacpp-fetch';
import { detectLlamaCppStatus, llamaCppServerProbe } from './llamacpp-status';
import { engineBinaryPath, engineTargetDir, ggufModelDir } from './paths';
import { createRuntimeRegistry, installChannelHandlers } from './registry';
import type { RuntimeInstallerPart } from './types';
import type { ExtractTarFn } from './untar';
import { nodeExtractTar } from './untar';
import type { ExtractZipFn } from './unzip';
import { nodeExtractZip } from './unzip';
import { createMachineScanCache } from '../../machine-scan-cache';
import type { Services } from '../../services';

/** Where the engine would land when no asset matches this platform — only ever
    used to name a path in a blocked plan, never written to. */
const DEFAULT_TARGET_SUBDIR = 'runtimes/llamacpp';

/** The GPU facts the build choice reads — the subset of `MachineFacts` D2 needs. */
export type GpuScanFacts = Pick<MachineFacts, 'gpuName' | 'gpuDetection'>;

/** Test seam: production reads the real platform, `userData`, the remembered
    machine scan, `fetch` and the real filesystem; tests inject every one, so no
    test touches the network, the disk, or Electron. */
export interface LlamaCppInstallDeps {
  platform?: string;
  /** Defaults to `os.arch()`. Injected the same way `platform` is, so a test
      can assert the arm64 asset is picked without running on arm64. */
  arch?: string;
  userDataDir?: string;
  freeDiskMbFn?: (dir: string) => Promise<number | null>;
  /** Defaults to the remembered scan (035's cache); `null` means "never
      scanned", which `selectEngineBuild` answers with the CPU build. */
  gpuFactsFn?: () => Promise<GpuScanFacts | null>;
  fetchImpl?: FetchFn;
  fs?: EngineFs;
  /** One extractor per archive format the release ships — ZIP on Windows,
      `.tar.gz` on macOS and Linux. Both are seams for the same reason. */
  extractZip?: ExtractZipFn;
  extractTar?: ExtractTarFn;
  /** Staging-directory token generator — a UUID in production, a fixed string
      in tests so they can name the path they assert is gone. */
  stagingToken?: () => string;
  /** `status`'s server-reachability probe (033, D7) — deliberately its own
      field, not a reuse of the download's `fetchImpl`: this file's own tests
      already inject `fetchImpl` for the engine download and never expect
      `status` to probe a server at all, so `status` only probes once this is
      explicitly given. `register-all.ts` passes the real `fetch` here for
      production; a test that wants to exercise `'running'` passes a fake. */
  statusFetchImpl?: FetchFn;
  statusTimeoutMs?: number;
}

/** `EngineFetchInput` before it is known whether this machine has an asset at
    all — `undefined` is the case that becomes `unsupported-platform`. `arch`
    rides along for the table lookups; the fetch itself needs none of it,
    since the chosen descriptor already names the architecture's archive. */
type EngineContext = Omit<EngineFetchInput, 'asset'> & {
  arch: string;
  asset: EngineAssetDescriptor | undefined;
};

/** The last scan this machine remembered (035) — read, never triggered: an
    install must not start a GPU probe, and "no scan yet" is an honest answer. */
async function rememberedGpuFacts(userDataDir: string): Promise<GpuScanFacts | null> {
  return (await createMachineScanCache(userDataDir).read())?.facts ?? null;
}

/** The GPU-derived choice plus its structured reason, carried alongside the
    resolved context so `buildEnginePlan` can report it without re-deriving
    it (033, D10). */
type EngineBuildPick = { id: EngineBuildId; reason: EngineBuildReason };

async function resolveContext(
  deps: LlamaCppInstallDeps,
  buildOverride?: EngineBuildId,
): Promise<EngineContext & { buildPick: EngineBuildPick }> {
  const platform = deps.platform ?? os.platform();
  const arch = deps.arch ?? os.arch();
  const userDataDir = deps.userDataDir ?? app.getPath('userData');
  const gpuFactsFn = deps.gpuFactsFn ?? (() => rememberedGpuFacts(userDataDir));
  const facts = await gpuFactsFn();
  const derived = selectEngineBuild({
    platform,
    arch,
    gpuName: facts?.gpuName ?? null,
    gpuDetection: facts?.gpuDetection ?? 'not-attempted',
  });
  // An override (033, D10 — the install dialog's build select) only takes
  // effect when this platform *and architecture* actually have an asset for
  // it; an unknown or unavailable override falls back to the derived choice
  // rather than silently producing a plan with no asset at all.
  const overrideAsset =
    buildOverride && getEngineAsset('llamacpp', platform, buildOverride, arch)
      ? buildOverride
      : undefined;
  const buildId = overrideAsset ?? derived.buildId;
  const asset = getEngineAsset('llamacpp', platform, buildId, arch);
  return {
    platform,
    arch,
    userDataDir,
    build: buildId,
    asset,
    targetDir: engineTargetDir(userDataDir, asset?.targetSubdir ?? DEFAULT_TARGET_SUBDIR),
    buildPick: { id: buildId, reason: derived.reason },
  };
}

/** Facts → plan, in `RuntimePlan`'s shape because that is what
    `llm:runtimeInstallPlan` reports for either runtime. `installerPath` names
    the engine directory: llama.cpp ships archives (033, Q4), so there is no
    installer file, and where the engine lands is the path worth showing.
    `build` (033, D10) is only populated here, never by Ollama's own plan —
    Ollama has no build variants to show or override. */
async function buildEnginePlan(
  ctx: EngineContext & { buildPick: EngineBuildPick },
  engineFs: EngineFs,
  deps: LlamaCppInstallDeps,
): Promise<RuntimePlan> {
  const freeDiskMb = await (deps.freeDiskMbFn ?? detectFreeDiskMb)(ctx.userDataDir);
  const plan = planRuntimeDownload({
    runtime: 'llamacpp',
    kind: 'engine',
    platform: ctx.platform,
    freeDiskMb,
    downloadMb: ctx.asset ? totalEngineDownloadMb(ctx.asset) : 0,
    targetPath: ctx.targetDir,
    // `<userData>` itself, not the target: the target directory does not exist
    // before the first install, and this probe may have no side effect.
    writable: await engineFs.writable(ctx.userDataDir),
    assetAvailable: ctx.asset !== undefined,
  });
  return {
    canInstall: plan.canDownload,
    blockedReason: plan.blockedReason,
    downloadMb: plan.downloadMb,
    installerPath: ctx.targetDir,
    modelDirHint: ggufModelDir(ctx.userDataDir),
    build: {
      id: ctx.buildPick.id,
      reason: ctx.buildPick.reason,
      // Only builds that exist for *this* architecture — offering an
      // alternative whose asset this machine has none of would make the
      // dialog's select a way to reach `unsupported-platform`.
      options: availableEngineBuilds('llamacpp', ctx.platform, ctx.arch),
    },
  };
}

/** llama.cpp's part of `RuntimeInstaller`. `pull`/`cancelPull` (D7) and `start`
    (D9) are deliberately not here — `register-all.ts` composes them. */
export type LlamaCppInstallPart = RuntimeInstallerPart<
  'plan' | 'download' | 'cancel' | 'status' | 'openInstaller'
>;

export function createLlamaCppInstallPart(
  services: Services,
  deps: LlamaCppInstallDeps = {},
): LlamaCppInstallPart {
  const running = new Map<string, AbortController>();
  const engineFs = deps.fs ?? nodeEngineFs;
  const io: EngineFetchIo = {
    fetchImpl: deps.fetchImpl ?? fetch,
    fs: engineFs,
    extractZip: deps.extractZip ?? nodeExtractZip,
    extractTar: deps.extractTar ?? nodeExtractTar,
    token: deps.stagingToken ?? randomUUID,
  };

  /** Whether a *complete* engine is installed: the binary in the target
      directory. A staging directory is never consulted, which is what makes a
      cancelled run report `absent`. */
  const installed = async (ctx: EngineContext): Promise<boolean> =>
    engineFs.exists(engineBinaryPath(ctx.targetDir, ctx.platform));

  return {
    id: 'llamacpp',

    /* Binary present or not (this file's own fact) plus `llamacpp-status.ts`'s
       server-reachability probe (D7) — an absent binary short-circuits to
       `'absent'` without probing, so a port answering for an unrelated
       reason can never be read as "llama.cpp is running". No probe at all
       when `statusFetchImpl` wasn't given (see the field's own comment). */
    status: async (): Promise<LocalRuntimeStatus> =>
      detectLlamaCppStatus(
        await installed(await resolveContext(deps)),
        deps.statusFetchImpl
          ? llamaCppServerProbe({
              fetchImpl: deps.statusFetchImpl,
              timeoutMs: deps.statusTimeoutMs,
            })
          : undefined,
      ),

    plan: async (buildId) => buildEnginePlan(await resolveContext(deps, buildId), engineFs, deps),

    download: async (buildId) => {
      const ctx = await resolveContext(deps, buildId);
      const plan = await buildEnginePlan(ctx, engineFs, deps);
      const asset = ctx.asset;
      if (!plan.canInstall || !asset) {
        throw fail('invalid', 'auf dieser Maschine ist kein Engine-Download möglich');
      }

      const downloadId = randomUUID();
      const controller = new AbortController();
      running.set(downloadId, controller);

      const send = (downloadedMb: number, totalMb: number, done: boolean, error?: string): void => {
        services.sendEvent('event:install-progress', {
          downloadId,
          downloadedMb,
          totalMb,
          done,
          ...(error === undefined ? {} : { error }),
        });
        if (done) running.delete(downloadId);
      };

      void runEngineFetch({ ...ctx, asset }, controller, io, send);
      return { downloadId };
    },

    cancel: async (downloadId) => {
      /* Aborting is all this does: the run itself notices, removes its staging
         root and sends the closing event — one cleanup path, whatever stopped
         the run. An id this runtime doesn't know changes nothing. */
      running.get(downloadId)?.abort();
    },

    /* There is no installer to launch (033, Q4) — llama.cpp ships plain
       archives that `llamacpp-fetch.ts` unpacks itself. The equivalent of "open
       what was downloaded" is showing the engine that was installed, so this
       opens the engine directory, and reports the channel's existing
       `'no-installer-downloaded'` reason when there is nothing to show. */
    openInstaller: async () => {
      const ctx = await resolveContext(deps);
      if (!(await installed(ctx))) return { opened: false, reason: 'no-installer-downloaded' };
      const error = await shell.openPath(ctx.targetDir);
      return error === '' ? { opened: true } : { opened: false, reason: error };
    },
  };
}

/** The three install channels over a registry that knows llama.cpp and nothing
    else — this module's own seam. Production builds one registry across all
    runtimes in `register-all.ts` and hands it to the very same
    `installChannelHandlers`. */
export function llamaCppInstallHandlers(
  services: Services,
  deps: LlamaCppInstallDeps = {},
): HandlerMap {
  return installChannelHandlers(createRuntimeRegistry([createLlamaCppInstallPart(services, deps)]));
}
