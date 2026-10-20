/* The last machine scan, remembered between two app starts (035, D1).

   Machine-local and derived, like the index: this file may be deleted at any
   time — the card then falls back to its honest "never scanned" state and its
   scan button, and nothing is lost. It lives in `userData`, never in the
   vault: RAM, VRAM, GPU and core count belong to this machine, not to the
   notes on it.

   What is stored are the *pre-override* facts — exactly what detection
   measured, before the manually entered VRAM figure (028) and before the
   resource budget (029) are applied. Both are re-applied on every read, so a
   stored result can never contradict the settings as they are now. Storing the
   merged facts instead would freeze a manual figure into the stored "detected"
   value, and clearing the override later could not undo it.

   Mirrors `secrets.ts`: own `version`, `readJson` / `writeJsonAtomic`. */

import { join } from 'node:path';
import type { MachineDetection, MachineFacts } from '@shared/types';
import { readJson, writeJsonAtomic } from './fs-json';

const CACHE_FILE = 'machine-scan.json';
const CACHE_VERSION = 1;

/** One remembered scan: when it ran, and what it measured. */
export interface MachineScanCacheEntry {
  /** ISO timestamp of the scan that produced `facts` — never "now" on a read. */
  scannedAt: string;
  /** Detection's raw output: no VRAM override and no budget folded in. */
  facts: MachineFacts;
}

interface MachineScanCacheFile extends MachineScanCacheEntry {
  version: number;
}

export interface MachineScanCache {
  /** The remembered scan, or `null` for "never scanned" — which is also what a
   *  missing, corrupt or foreign-version file counts as, never an error. */
  read(): Promise<MachineScanCacheEntry | null>;
  /** Remembers a scan. Never throws: a scan that can't be written down is
   *  still a scan, it just costs a rescan after the next start. */
  write(entry: MachineScanCacheEntry): Promise<void>;
}

// ── Validation (a hand-edited or half-written file must read as "no scan") ───

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

const NUMERIC_FACTS = ['totalRamMb', 'cpuCores', 'freeDiskMb', 'vramMb'] as const;
const TEXT_FACTS = ['platform', 'arch', 'gpuName'] as const;
const DETECTIONS: readonly MachineDetection[] = ['not-attempted', 'detected', 'unknown'];

/** The required part of `MachineFacts`, checked field by field. The optional
 *  merge fields (`manualVramMb` and friends) are deliberately not accepted
 *  here — they are never stored, because the merge happens on read. */
function asFacts(value: unknown): MachineFacts | null {
  if (!isRecord(value)) return null;
  if (!NUMERIC_FACTS.every((key) => isNumberOrNull(value[key]))) return null;
  if (!TEXT_FACTS.every((key) => isStringOrNull(value[key]))) return null;
  const detection = value['gpuDetection'];
  if (!DETECTIONS.includes(detection as MachineDetection)) return null;
  // Every field above has been checked individually; the cast only drops the
  // index signature `readJson` handed us.
  return value as unknown as MachineFacts;
}

function asEntry(stored: unknown): MachineScanCacheEntry | null {
  if (!isRecord(stored) || stored['version'] !== CACHE_VERSION) return null;
  const scannedAt = stored['scannedAt'];
  if (typeof scannedAt !== 'string' || Number.isNaN(Date.parse(scannedAt))) return null;
  const facts = asFacts(stored['facts']);
  return facts === null ? null : { scannedAt, facts };
}

/** Builds the cache over `<userDataDir>/machine-scan.json`. */
export function createMachineScanCache(userDataDir: string): MachineScanCache {
  const file = join(userDataDir, CACHE_FILE);
  return {
    async read(): Promise<MachineScanCacheEntry | null> {
      // `readJson` already turns "missing" and "not parseable" into `null`.
      return asEntry(await readJson<unknown>(file));
    },
    async write(entry: MachineScanCacheEntry): Promise<void> {
      const payload: MachineScanCacheFile = { version: CACHE_VERSION, ...entry };
      try {
        await writeJsonAtomic(file, payload);
      } catch (error) {
        console.warn('[machine-scan] scan not remembered:', error);
      }
    },
  };
}
