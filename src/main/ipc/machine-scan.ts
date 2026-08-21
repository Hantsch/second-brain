/* Machine capacity scan: main detects, core judges (a later deliverable turns
   these facts into a verdict). This file only gathers facts — no vault content,
   no user files, nothing that touches the vault at all.

   GPU detection shells out, and that is the risky part: a missing tool, a
   non-zero exit, output nobody can parse, or a process that never returns must
   all end as `gpuDetection: 'unknown'`. Nothing here may throw into the IPC
   handler, and nothing here may make the models tab wait. */

import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { judgeCapacity } from '@core/llm';
import type { CapacityVerdict, MachineFacts, MachineScanResult } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

/** The GPU slice of `MachineFacts` — a slice of the real shape, never a parallel one. */
type GpuFacts = Pick<MachineFacts, 'vramMb' | 'gpuName' | 'gpuDetection' | 'gpuDetectionReason'>;

/** Everything the cheap `os`-level detection fills in on its own. */
type BaseFacts = Omit<MachineFacts, keyof GpuFacts>;

/** Where Ollama keeps its downloaded models — used only to measure free space nearby.
    Same layout on posix and win32: `~/.ollama/models` (`%USERPROFILE%\.ollama\models`). */
function ollamaModelsDir(): string {
  return path.join(os.homedir(), '.ollama', 'models');
}

/** Bytes to whole megabytes, or `null` if the input isn't a finite number. */
function toMb(bytes: number): number | null {
  return Number.isFinite(bytes) ? Math.round(bytes / 1024 / 1024) : null;
}

/** Free space on the volume that would hold local models. Never throws.
    Exported for `ollama-install.ts` (019c, D2): the runtime install plan needs
    the same free-disk fact this scan already gathers, and duplicating the
    `statfs` probe would be the kind of copy the project's own rules forbid. */
export async function detectFreeDiskMb(): Promise<number | null> {
  const candidates = [ollamaModelsDir(), os.homedir(), os.tmpdir()];
  for (const dir of candidates) {
    try {
      const stats = await fs.statfs(dir);
      return toMb(stats.bsize * stats.bfree);
    } catch {
      // Directory may not exist (Ollama not installed) or statfs may be
      // unsupported here — try the next candidate.
    }
  }
  return null;
}

/** Cheap, cross-platform facts from Node's `os` module plus free disk space. */
async function detectCheapFacts(platform: string): Promise<BaseFacts> {
  return {
    totalRamMb: toMb(os.totalmem()),
    cpuCores: os.cpus().length || null,
    platform,
    arch: os.arch(),
    freeDiskMb: await detectFreeDiskMb(),
  };
}

// ── GPU detection ───────────────────────────────────────────────────────────

/** The slice of `child_process.execFile` this file uses — the seam tests fill with a fake. */
export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: ProbeOptions,
) => Promise<{ stdout: string }>;

interface ProbeOptions {
  readonly encoding: 'utf8';
  readonly timeout: number;
  readonly killSignal: NodeJS.Signals;
  readonly maxBuffer: number;
  readonly windowsHide: true;
}

/** Hard ceiling for one probe: an "unknown" after two seconds beats a tab that waits. */
const PROBE_TIMEOUT_MS = 2_000;

/** Watchdog above `execFile`'s own timeout. `timeout` kills the child, but the callback
    only comes once its pipes close too — a grandchild holding them open would keep the
    promise pending forever. After the watchdog the scan continues regardless. */
const PROBE_DEADLINE_MS = PROBE_TIMEOUT_MS + 500;

const PROBE_OPTIONS: ProbeOptions = {
  encoding: 'utf8',
  timeout: PROBE_TIMEOUT_MS,
  killSignal: 'SIGKILL',
  maxBuffer: 1024 * 1024,
  windowsHide: true,
};

/** The real `execFile`, promisified — the only place in this file that spawns anything. */
const execFileAsync: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout });
    });
  });

/** Closed vocabulary: these reach the UI, so they never carry tool output or paths. */
type GpuFailure =
  | 'unsupported-platform'
  | 'tool-missing'
  | 'timeout'
  | 'tool-failed'
  | 'unparseable-output'
  | 'no-gpu-found';

type ProbeRun = { ok: true; stdout: string } | { ok: false; reason: GpuFailure };

interface GpuProbe {
  readonly file: string;
  readonly args: readonly string[];
  readonly parse: (stdout: string) => GpuFacts;
}

/** `Get-CimInstance` over WMI — a hardcoded constant, never built from a variable. */
const WIN32_GPU_COMMAND =
  'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json';

/* One fixed argument vector per platform. Fixed on purpose: no shell, no string
   building, and nothing from the renderer reaches these calls — there is no input
   to interpolate, and none may ever be added. */
const GPU_PROBES: Readonly<Record<string, GpuProbe>> = {
  win32: {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', WIN32_GPU_COMMAND],
    parse: parseWin32Gpu,
  },
  darwin: {
    file: 'system_profiler',
    args: ['SPDisplaysDataType', '-json'],
    parse: parseDarwinGpu,
  },
  linux: { file: 'lspci', args: ['-mm'], parse: parseLinuxGpu },
};

function unknownGpu(reason: GpuFailure): GpuFacts {
  return { vramMb: null, gpuName: null, gpuDetection: 'unknown', gpuDetectionReason: reason };
}

function detectedGpu(gpuName: string, vramMb: number | null): GpuFacts {
  return { vramMb, gpuName, gpuDetection: 'detected' };
}

/** GPU name and VRAM for one platform. Resolves always, rejects never. */
export async function detectGpuFacts(
  platform: string,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<GpuFacts> {
  const probe = GPU_PROBES[platform];
  if (!probe) return unknownGpu('unsupported-platform');
  const run = await runProbe(execFileFn, probe);
  if (!run.ok) return unknownGpu(run.reason);
  try {
    return probe.parse(run.stdout);
  } catch {
    // A parser is never allowed to be the thing that breaks the scan, whatever a tool prints.
    return unknownGpu('unparseable-output');
  }
}

/** Runs one probe under both the `execFile` timeout and the watchdog. Never rejects. */
async function runProbe(execFileFn: ExecFileFn, probe: GpuProbe): Promise<ProbeRun> {
  let attempt: Promise<ProbeRun>;
  try {
    attempt = execFileFn(probe.file, probe.args, PROBE_OPTIONS).then(
      ({ stdout }): ProbeRun => ({ ok: true, stdout }),
      (error: unknown): ProbeRun => ({ ok: false, reason: failureReason(error) }),
    );
  } catch (error) {
    // Some failures arrive synchronously instead of as a rejection.
    return { ok: false, reason: failureReason(error) };
  }
  return await withDeadline(attempt);
}

function withDeadline(attempt: Promise<ProbeRun>): Promise<ProbeRun> {
  return new Promise<ProbeRun>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), PROBE_DEADLINE_MS);
    timer.unref();
    /* Whichever settles first wins; the later one is ignored, so a child that
       reports back after the deadline can no longer change the answer. */
    void attempt.then(
      (run) => {
        clearTimeout(timer);
        resolve(run);
      },
      () => {
        clearTimeout(timer);
        resolve({ ok: false, reason: 'tool-failed' });
      },
    );
  });
}

/** Why a probe failed, from what `execFile` puts on its error. */
function failureReason(error: unknown): GpuFailure {
  const details = asRecord(error);
  if (!details) return 'tool-failed';
  if (details['code'] === 'ENOENT') return 'tool-missing';
  // `timeout` kills the child: `killed`/`signal` is how a hit deadline looks from here.
  if (details['killed'] === true || typeof details['signal'] === 'string') return 'timeout';
  return 'tool-failed';
}

// ── Parsers (pure: stdout in, facts out) ────────────────────────────────────

/** `AdapterRAM` is a 32-bit WMI field, so every card of 4 GB or more saturates at
    exactly 4095 MB. Passing that on as the card's VRAM would be a wrong number, so
    at the ceiling the value stays `null` — the GPU name is still a fact. */
const WMI_ADAPTER_RAM_CEILING_MB = 4095;

export function parseWin32Gpu(stdout: string): GpuFacts {
  const entries = jsonRecords(stdout);
  if (entries === null) return unknownGpu('unparseable-output');
  /* Several controllers are normal (discrete plus integrated). Ranked by what WMI
     reports, so the card with the most memory wins before the ceiling rule applies. */
  let best: { name: string; reportedMb: number | null } | null = null;
  for (const entry of entries) {
    const name = asString(entry['Name']);
    if (name === null) continue;
    const reportedMb = positiveMb(entry['AdapterRAM']);
    if (best === null || (reportedMb ?? 0) > (best.reportedMb ?? 0)) best = { name, reportedMb };
  }
  if (best === null) return unknownGpu('no-gpu-found');
  const trustworthy = best.reportedMb !== null && best.reportedMb < WMI_ADAPTER_RAM_CEILING_MB;
  return detectedGpu(best.name, trustworthy ? best.reportedMb : null);
}

export function parseDarwinGpu(stdout: string): GpuFacts {
  const root = jsonRecords(stdout)?.[0];
  if (!root) return unknownGpu('unparseable-output');
  const displays = root['SPDisplaysDataType'];
  if (!Array.isArray(displays)) return unknownGpu('unparseable-output');
  for (const raw of displays) {
    const entry = asRecord(raw);
    if (!entry) continue;
    const name = asString(entry['sppci_model']) ?? asString(entry['_name']);
    if (name === null) continue;
    // system_profiler lists the primary adapter first. Anything else about this JSON
    // varies by generation, so nothing beyond the model name is assumed.
    return detectedGpu(name, darwinVramMb(entry));
  }
  return unknownGpu('no-gpu-found');
}

/** The VRAM key differs per generation (`spdisplays_vram`, `..._vram_shared`, and
    none at all on Apple Silicon's unified memory), so any of them counts — and none
    of them existing is a plain `null`, not a guess. */
function darwinVramMb(entry: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith('spdisplays_vram')) continue;
    const mb = parseSizeMb(asString(value));
    if (mb !== null) return mb;
  }
  return null;
}

const GPU_PCI_CLASS = /VGA compatible controller|3D controller|Display controller/i;

export function parseLinuxGpu(stdout: string): GpuFacts {
  const candidates: { pciClass: string; name: string }[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    // `lspci -mm` quotes its fields: unquoted slot, then class, vendor, device.
    const fields = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? '');
    const [pciClass, vendor = '', device = ''] = fields;
    if (pciClass === undefined || !GPU_PCI_CLASS.test(pciClass)) continue;
    const name = `${vendor} ${device}`.trim();
    if (name !== '') candidates.push({ pciClass, name });
  }
  /* On a hybrid laptop `lspci` lists the integrated chip first as "VGA compatible
     controller" and the discrete card as "3D controller". The discrete one is what a
     local model would run on, so where both exist it wins. */
  const picked = candidates.find((entry) => /3D controller/i.test(entry.pciClass)) ?? candidates[0];
  if (!picked) return unknownGpu('no-gpu-found');
  /* VRAM stays `null` on purpose: `lspci` doesn't report it, and getting it would mean
     vendor-specific paths (`nvidia-smi`, `/sys/class/drm/.../mem_info_vram_total`). An
     honest unknown beats a guess — the name alone already identifies the card. */
  return detectedGpu(picked.name, null);
}

// ── Small parsing helpers ───────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}

function positiveMb(value: unknown): number | null {
  return typeof value === 'number' && value > 0 ? toMb(value) : null;
}

/** JSON objects out of a tool's stdout. `null` means "not parseable at all"; an empty
    list means "parsed, but no object in it". `ConvertTo-Json` emits a bare object for
    one controller and an array for several, so both are accepted. */
function jsonRecords(stdout: string): Record<string, unknown>[] | null {
  if (stdout.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null);
}

/** `"1536 MB"` / `"8 GB"` — the shapes system_profiler prints. */
function parseSizeMb(text: string | null): number | null {
  const match = text === null ? null : /^(\d+(?:[.,]\d+)?)\s*(MB|GB)$/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1]?.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(match[2]?.toUpperCase() === 'GB' ? amount * 1024 : amount);
}

// ── Handler ─────────────────────────────────────────────────────────────────

/** Test seam: production passes nothing, tests inject a platform and a fake exec. */
export interface MachineScanDeps {
  platform?: string;
  execFileFn?: ExecFileFn;
}

/** Both detections combined into one `MachineFacts`. Shared by the
 *  `'llm:scanMachine'` handler and `scanCapacityVerdict` below, so the two
 *  never run the detection logic differently. */
async function detectMachineFacts(deps: MachineScanDeps): Promise<MachineFacts> {
  const platform = deps.platform ?? os.platform();
  const execFileFn = deps.execFileFn ?? execFileAsync;
  const [base, gpu] = await Promise.all([
    detectCheapFacts(platform),
    detectGpuFacts(platform, execFileFn),
  ]);
  return { ...base, ...gpu };
}

/** The same detections as `'llm:scanMachine'`, judged, without the raw facts
 *  — what `recommendModels` (main/llm-bridge.ts) needs a verdict for, without
 *  duplicating the GPU/RAM detection code. Never throws, same guarantee as
 *  the detections it combines. */
export async function scanCapacityVerdict(deps: MachineScanDeps = {}): Promise<CapacityVerdict> {
  return judgeCapacity(await detectMachineFacts(deps));
}

export function machineScanHandlers(services: Services, deps: MachineScanDeps = {}): HandlerMap {
  return defineHandlers({
    'llm:scanMachine': async (): Promise<MachineScanResult> => {
      void services; // not needed for a machine scan — no vault access here
      const facts = await detectMachineFacts(deps);
      return { facts, verdict: judgeCapacity(facts), scannedAt: new Date().toISOString() };
    },
  });
}
