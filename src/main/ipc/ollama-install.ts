/* Downloading the Ollama installer in-app (019c, D2).
 *
 * `runtime-plan.ts` (D1) already judges whether an install can even be
 * attempted here; this file is the one that actually moves bytes. Same
 * split as `llm-stream.ts`: `llm:downloadRuntime` returns a `downloadId`
 * immediately, the run itself continues in the background and reports over
 * `event:install-progress`, and `llm:cancelRuntimeDownload` looks that id up
 * to abort it — an unknown id changes nothing, not an error.
 *
 * Three rules this file enforces, all in service of the same acceptance
 * criterion: a cancelled or failed download never leaves a partial installer
 * behind.
 *
 * - **Every run ends with `done: true`.** Success, cancellation, and
 *   failure all report it, exactly once, and no event follows.
 * - **Cancel and failure both clean up.** Whichever way the download stops
 *   short of a full file, the partial file at `plan.installerPath` is
 *   removed before the closing event goes out.
 * - **Failures are a closed code, never a stack trace.** `toIpcError`
 *   translates whatever went wrong (network error, non-2xx, disk write
 *   error, abort) into the same closed `IpcError['code']` vocabulary used
 *   everywhere else on this boundary; the renderer turns the code into a
 *   sentence via `t()`.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import { planRuntimeInstall } from '@core/llm';
import type { RuntimePlan } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail, toIpcError } from './registry';
import { detectFreeDiskMb } from './machine-scan';
import type { Services } from '../services';

/**
 * Ollama's official GUI installer download, per platform. Deliberately
 * hardcoded here rather than in `runtime-plan.ts` — that module stays pure
 * (facts in, judgement out) and never fetches anything; this is the one
 * place that knows an actual URL. Only `win32`/`darwin` need an entry:
 * `planRuntimeInstall` already blocks every other platform as
 * `unsupported-platform` before a URL would ever be needed.
 *
 * `installerSizeMb` is a rough current-release estimate, not a measurement —
 * Ollama publishes no manifest with an exact size, and it moves with every
 * release. Good enough for "does this look like it'll fit", which is all
 * `planRuntimeInstall` uses it for.
 */
const INSTALLER_SOURCES: Readonly<Record<string, { url: string; installerSizeMb: number }>> = {
  win32: { url: 'https://ollama.com/download/OllamaSetup.exe', installerSizeMb: 300 },
  darwin: { url: 'https://ollama.com/download/Ollama.dmg', installerSizeMb: 200 },
};

/** The slice of the global `fetch` this file uses — the seam tests fill with a fake. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** A destination the download writes to, one chunk at a time. Production wraps
    `fs.createWriteStream`; tests fill it with an in-memory fake, so no test ever
    touches the real disk. */
export interface WriteSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** File operations this download needs, injectable for the same reason as `FetchFn`. */
export interface DownloadFs {
  createSink(path: string): WriteSink;
  /** Deletes the file if present. Missing already counts as success — the
      whole point of calling this is "make sure it's gone". */
  remove(path: string): Promise<void>;
}

function nodeWriteSink(path: string): WriteSink {
  const stream = fs.createWriteStream(path);
  return {
    write: (chunk) =>
      new Promise((resolve, reject) => {
        stream.write(chunk, (error) => (error ? reject(error) : resolve()));
      }),
    close: () =>
      new Promise((resolve, reject) => {
        stream.end((error?: Error) => (error ? reject(error) : resolve()));
      }),
  };
}

const nodeFs: DownloadFs = {
  createSink: nodeWriteSink,
  remove: async (path) => {
    try {
      await fsPromises.unlink(path);
    } catch (error) {
      // Never having existed, or already removed, both count as "gone".
      if ((error as { code?: unknown }).code !== 'ENOENT') throw error;
    }
  },
};

/**
 * Tracks the installer path of the most recently *completed* download — the
 * one fact `llm:openRuntimeInstaller` (019c, D3, `ollama-runtime.ts`) needs
 * to open the right file without trusting a path the renderer might supply.
 * A plain mutable box rather than a return value from `ollamaInstallHandlers`
 * itself, so `register-all.ts` can create one and hand the same instance to
 * both this module's handlers and D3's — the same "one shared piece of state,
 * two handler maps" shape `running` already has within this file.
 */
export interface InstallerPathTracker {
  get(): string | null;
  set(path: string): void;
}

export function createInstallerPathTracker(): InstallerPathTracker {
  let path: string | null = null;
  return {
    get: () => path,
    set: (value) => {
      path = value;
    },
  };
}

/** Test seam: production supplies nothing and gets the real platform, temp
    dir, disk probe, `fetch`, and file system; tests inject every one of
    them, so no test ever touches the network, the real disk, or Electron. */
export interface OllamaInstallDeps {
  platform?: string;
  tempDir?: string;
  freeDiskMbFn?: () => Promise<number | null>;
  /** Test seam for the write-probe below — production gets the real one,
      tests inject a fixed answer so no test ever touches the real disk. */
  writableFn?: (tempDir: string) => Promise<boolean>;
  fetchImpl?: FetchFn;
  fs?: DownloadFs;
  /** Defaults to a fresh, private tracker — supplied by `register-all.ts` in
      production so `ollama-runtime.ts`'s handlers see the same one. */
  installerPathTracker?: InstallerPathTracker;
}

/**
 * Cheap real write-and-delete of a small probe file, so `no-write-permission`
 * (019c's third named blocked case, alongside platform and disk space) is an
 * actual measurement rather than an assumption. `planRuntimeInstall` stays
 * pure and never touches a filesystem itself — this is the one place that
 * does, and it never lets a thrown error escape: any failure to write or
 * remove the probe just means "not writable", not a crash of the plan build.
 */
async function probeWritable(tempDir: string): Promise<boolean> {
  const probePath = path.join(tempDir, `.sb-write-probe-${randomUUID()}`);
  try {
    await fsPromises.writeFile(probePath, '');
    await fsPromises.unlink(probePath);
    return true;
  } catch {
    return false;
  }
}

/** Facts → plan, the same call every install attempt starts from. Exported
    so `llm:runtimeInstallPlan` and `llm:downloadRuntime` can never see a
    different plan for the same machine. */
export async function buildRuntimePlan(deps: OllamaInstallDeps = {}): Promise<RuntimePlan> {
  const platform = deps.platform ?? os.platform();
  const freeDiskMb = await (deps.freeDiskMbFn ?? detectFreeDiskMb)();
  const installerSizeMb = INSTALLER_SOURCES[platform]?.installerSizeMb ?? 0;
  const tempDir = deps.tempDir ?? app.getPath('temp');
  const writable = await (deps.writableFn ?? probeWritable)(tempDir);
  return planRuntimeInstall({ platform, freeDiskMb, installerSizeMb, tempDir, writable });
}

/** Megabytes, rounded down — so "1.9 MB downloaded" doesn't briefly read as
    "2 MB" before the byte that completes it actually arrives. */
function wholeMb(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}

/** The `Content-Length` header, in whole MB — or `null` if it's missing or
    unparseable, which happens whenever a host doesn't send it. */
function contentLengthMb(response: Response): number | null {
  const header = response.headers.get('content-length');
  const bytes = header === null ? NaN : Number(header);
  return Number.isFinite(bytes) && bytes > 0
    ? Math.max(1, Math.round(bytes / (1024 * 1024)))
    : null;
}

/**
 * Streams the installer at `plan.installerPath`, reporting progress through
 * `send`. Resolves once the run has ended one way or another; never rejects
 * — every failure is reported through `send({ error, done: true })` instead,
 * exactly like `llmStreams.run`'s completion contract.
 */
async function runDownload(
  plan: RuntimePlan,
  url: string,
  controller: AbortController,
  deps: { fetchImpl: FetchFn; fs: DownloadFs },
  send: (downloadedMb: number, totalMb: number, done: boolean, error?: string) => void,
): Promise<void> {
  // Ollama's own answer beats the hardcoded estimate when it sends one; the
  // estimate is only a fallback for a host that omits the header.
  let totalMb = plan.downloadMb;
  // Declared here, not inside the `try`, so the `catch` below can close it —
  // the file now exists exactly once this is assigned, and needs cleanup on
  // any early exit from here on.
  let sink: WriteSink | undefined;
  try {
    const response = await deps.fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw fail('io', `Download fehlgeschlagen: HTTP ${response.status}`);
    totalMb = contentLengthMb(response) ?? totalMb;

    const body = response.body;
    if (!body) throw fail('io', 'die Antwort enthielt keinen Inhalt');

    sink = deps.fs.createSink(plan.installerPath);
    const reader = body.getReader();
    let downloadedBytes = 0;
    let lastReportedMb = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await sink.write(value);
      downloadedBytes += value.byteLength;
      const downloadedMb = wholeMb(downloadedBytes);
      /* Throttled to one event per whole megabyte crossed, not one per chunk
         — a chunk is typically far smaller than a megabyte, so this still
         reports several times a second without spamming the renderer. */
      if (downloadedMb !== lastReportedMb) {
        lastReportedMb = downloadedMb;
        send(downloadedMb, totalMb, false);
      }
    }
    await sink.close();
    send(wholeMb(downloadedBytes), totalMb, true);
  } catch (error) {
    /* The sink must be closed *before* the file is removed — deleting while
       the handle is still open races an open file descriptor, and on
       Windows that leaves the file present (or pending-delete) until the
       handle is eventually GC'd, exactly the leftover the cancel test plan
       checks for with `Get-ChildItem`. */
    if (sink) await sink.close().catch(() => undefined);
    if (sink) await deps.fs.remove(plan.installerPath).catch(() => undefined);
    send(0, totalMb, true, toIpcError(error).code);
  }
}

/** `llm:downloadRuntime` / `llm:cancelRuntimeDownload` — the running downloads,
    keyed by the id `llm:downloadRuntime` handed back. Module-level on
    purpose: exactly like `llmStreams`'s `running` map, it must survive
    between the two IPC calls that use it. */
export function ollamaInstallHandlers(
  services: Services,
  deps: OllamaInstallDeps = {},
): HandlerMap {
  const running = new Map<string, AbortController>();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const downloadFs = deps.fs ?? nodeFs;
  const installerPathTracker = deps.installerPathTracker ?? createInstallerPathTracker();

  return defineHandlers({
    'llm:runtimeInstallPlan': async () => {
      void services;
      return buildRuntimePlan(deps);
    },

    'llm:downloadRuntime': async () => {
      void services;
      const plan = await buildRuntimePlan(deps);
      if (!plan.canInstall) {
        throw fail('invalid', 'auf dieser Maschine ist keine App-interne Installation möglich');
      }
      const platform = deps.platform ?? os.platform();
      const source = INSTALLER_SOURCES[platform];
      // `plan.canInstall` is only true once `planRuntimeInstall` has already
      // ruled out every unsupported platform, and those are exactly the
      // platforms missing from `INSTALLER_SOURCES` — so this branch should be
      // unreachable in practice. Guarded anyway: a thrown `fail('invalid', …)`
      // beats `source.url` crashing with "undefined" a line further down.
      if (!source) throw fail('invalid', 'kein Installer für diese Plattform bekannt');

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
        if (done) {
          running.delete(downloadId);
          // Only a clean finish counts as "an installer is ready to open" —
          // a cancelled or failed run has already deleted the partial file.
          if (error === undefined) installerPathTracker.set(plan.installerPath);
        }
      };

      void runDownload(plan, source.url, controller, { fetchImpl, fs: downloadFs }, send);
      return { downloadId };
    },

    'llm:cancelRuntimeDownload': async ({ downloadId }) => {
      running.get(downloadId)?.abort();
    },
  });
}
