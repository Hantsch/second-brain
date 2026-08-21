/* Detection of local LLM runtimes.

   A user who doesn't have a model yet shouldn't have to guess whether one
   is already running on their machine. So the settings screen queries the
   addresses of the local presets (Ollama, LM Studio) once: if `/models`
   answers, the runtime is running — and the UI can get concrete ("3 models
   found").

   Deliberately no side effect: nothing gets created or saved here. Adopting
   it as a provider remains its own, confirmed step.

   A short timeout is part of the design: a closed port answers instantly,
   while a silent host would otherwise stall the settings screen for
   seconds. */

import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import { OpenAiCompatibleProvider, PROVIDER_PRESETS } from '@core/llm';
import type { FetchLike } from '@core/llm';
import type { IpcResponse } from '@shared/ipc';
import type { LocalRuntimeStatus, ProviderConfig } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

export type LocalRuntime = IpcResponse<'llm:detectLocal'>[number];

/** Waiting longer wouldn't be appropriate for an onboarding hint. */
export const DETECT_TIMEOUT_MS = 1500;

export interface DetectOptions {
  /** Injectable, so tests never hit the network. */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** `fetch` with a timeout — without it, a silent host would hang the request. */
function timedFetch(timeoutMs: number): FetchLike {
  return (url, init) =>
    fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Address comparison ignoring a trailing slash and case. */
function sameEndpoint(one: string, other: string): boolean {
  const normalize = (value: string): string => value.trim().replace(/\/+$/, '').toLowerCase();
  return normalize(one) === normalize(other);
}

/**
 * Checks every local preset. If an address doesn't answer, that's not an
 * error but the answer "not running here" — the UI then directs the user
 * onward.
 */
export async function detectLocalRuntimes(
  providers: readonly ProviderConfig[],
  options: DetectOptions = {},
): Promise<LocalRuntime[]> {
  const fetchImpl = options.fetchImpl ?? timedFetch(options.timeoutMs ?? DETECT_TIMEOUT_MS);
  const local = PROVIDER_PRESETS.filter((preset) => preset.local);

  return Promise.all(
    local.map(async (preset) => {
      const runtime = new OpenAiCompatibleProvider({ baseUrl: preset.baseUrl, fetchImpl });
      let models: string[] = [];
      let running = false;
      try {
        models = await runtime.listModels();
        running = true;
      } catch {
        /* Closed port, timeout, unexpected response: they all mean the same
           thing here — nothing we can use is running at this address. */
      }
      return {
        presetId: preset.id,
        label: preset.label,
        baseUrl: preset.baseUrl,
        running,
        models,
        configured: providers.some((provider) => sameEndpoint(provider.baseUrl, preset.baseUrl)),
      };
    }),
  );
}

// ── Ollama-specific status: absent / installed-stopped / running ───────────
//
// `detectLocalRuntimes` above answers "what's already running, across every
// local preset" for the settings screen's general hint. The guided install
// flow (019c) needs one definite state for Ollama specifically, including
// whether the binary exists even when it isn't running right now — so the
// app can offer "start it" instead of "install it" when it already is.

/** Injectable pieces for `detectOllamaRuntimeStatus`, so tests never touch
    the network, spawn a process, or read the real filesystem. */
export interface RuntimeStatusOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  execFileFn?: ExecFileFn;
  platform?: string;
  /** Existence check for the known per-platform install paths. */
  accessFn?: (target: string) => Promise<void>;
}

/** The slice of `child_process.execFile` this file uses — same shape as
    `machine-scan.ts`'s `ExecFileFn`, kept local so this file doesn't have to
    import another IPC module just for its own probe. */
type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
) => Promise<{ stdout: string }>;

interface ExecFileOptions {
  readonly encoding: 'utf8';
  readonly timeout: number;
  readonly killSignal: NodeJS.Signals;
  readonly maxBuffer: number;
  readonly windowsHide: true;
}

/** `ollama --version` answers in well under a second when it exists at all —
    the same two-second ceiling `machine-scan.ts` uses for its own probes. */
const RUNTIME_PROBE_TIMEOUT_MS = 2_000;

const EXEC_OPTIONS: ExecFileOptions = {
  encoding: 'utf8',
  timeout: RUNTIME_PROBE_TIMEOUT_MS,
  killSignal: 'SIGKILL',
  maxBuffer: 1024 * 1024,
  windowsHide: true,
};

/** The real `execFile`, promisified. Fixed args only, no shell string, and
    nothing from the renderer reaches this call — there is no input to
    interpolate, and none may ever be added. */
const execFileAsync: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout) });
    });
  });

/** Ollama's own known per-platform default install location, checked only
    once neither the endpoint nor `PATH` found it. A path that doesn't exist
    is just "not found there either" — nothing here throws. */
function defaultInstallPaths(platform: string): string[] {
  switch (platform) {
    case 'win32': {
      const programsDir = process.env['LOCALAPPDATA'];
      return programsDir ? [path.join(programsDir, 'Programs', 'Ollama', 'ollama.exe')] : [];
    }
    case 'darwin':
      return ['/Applications/Ollama.app', '/usr/local/bin/ollama'];
    case 'linux':
      return ['/usr/local/bin/ollama', '/usr/bin/ollama'];
    default:
      return [];
  }
}

async function pathExists(
  target: string,
  accessFn: (target: string) => Promise<void>,
): Promise<boolean> {
  try {
    await accessFn(target);
    return true;
  } catch {
    // Missing, no permission, or anything else fs.access can throw: all of
    // it means "not found there" for this purpose.
    return false;
  }
}

/** Is the Ollama endpoint answering right now? Same approach as
    `detectLocalRuntimes`, narrowed to the Ollama preset — this function
    needs one definite state, not a list of every local preset. */
async function probeOllamaEndpoint(fetchImpl: FetchLike): Promise<boolean> {
  const preset = PROVIDER_PRESETS.find((candidate) => candidate.id === 'ollama');
  if (!preset) return false;
  const runtime = new OpenAiCompatibleProvider({ baseUrl: preset.baseUrl, fetchImpl });
  try {
    await runtime.listModels();
    return true;
  } catch {
    return false; // closed port, timeout, unexpected response — not running
  }
}

/** Is the `ollama` binary reachable via `PATH`? A missing tool (`ENOENT`) is
    not an error here, only the answer "not on `PATH`". */
async function probeOllamaOnPath(execFileFn: ExecFileFn): Promise<boolean> {
  try {
    await execFileFn('ollama', ['--version'], EXEC_OPTIONS);
    return true;
  } catch {
    return false;
  }
}

/**
 * One of three states for the Ollama runtime specifically (019c, D1):
 * `'running'` if its endpoint answers; `'installed-stopped'` if the binary is
 * found (on `PATH`, or at the known per-platform default location) but the
 * endpoint doesn't answer; `'absent'` if neither. Never throws — every probe
 * degrades to "not found" instead of raising.
 */
export async function detectOllamaRuntimeStatus(
  options: RuntimeStatusOptions = {},
): Promise<LocalRuntimeStatus> {
  const fetchImpl = options.fetchImpl ?? timedFetch(options.timeoutMs ?? DETECT_TIMEOUT_MS);
  if (await probeOllamaEndpoint(fetchImpl)) return 'running';

  const execFileFn = options.execFileFn ?? execFileAsync;
  if (await probeOllamaOnPath(execFileFn)) return 'installed-stopped';

  const platform = options.platform ?? os.platform();
  const accessFn = options.accessFn ?? ((target: string) => fsPromises.access(target));
  for (const candidate of defaultInstallPaths(platform)) {
    if (await pathExists(candidate, accessFn)) return 'installed-stopped';
  }
  return 'absent';
}

/** `llm:localRuntimeStatus` — no vault access needed: this is "what's on
    this machine", the same kind of fact `machine-scan.ts` reports. */
export function runtimeStatusHandlers(
  services: Services,
  options: RuntimeStatusOptions = {},
): HandlerMap {
  return defineHandlers({
    'llm:localRuntimeStatus': async () => {
      void services;
      return detectOllamaRuntimeStatus(options);
    },
  });
}
