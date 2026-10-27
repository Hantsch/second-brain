/* Env-gated scripted update check for the e2e suite: the suite forbids real
   network requests, so `SB_E2E_UPDATE_FIXTURE` names the outcomes of successive
   checks. Unset, empty or invalid means "use the real checker".

   The value may instead name a JSON file (see `UpdateFileFixture`) that scripts
   the whole flow — check, download, install — offline. The file is re-read on
   every check and download so a spec can rewrite it between steps. */

import { existsSync, readFileSync } from 'node:fs';
import type { UpdateDistribution, UpdateProgress } from '../../shared/types/update';
import type { UpdateBackend } from './backend';
import type { UpdateCheckResult } from './checker';

const ENV_VAR = 'SB_E2E_UPDATE_FIXTURE';

export interface UpdateFileFixture {
  distribution: UpdateDistribution;
  latest: { version: string; notes: string } | null;
  download: { ticks: number; tickMs: number; outcome: 'ok' | 'offline' | 'checksum' };
}

export interface UpdateFileFixtureWiring {
  check: () => Promise<UpdateCheckResult>;
  backend: UpdateBackend;
  distribution: UpdateDistribution;
}

declare global {
  // Spec-visible record of install requests; the fixture never quits the app.
  var sbUpdateInstallCalls: unknown[] | undefined;
}

function parseFileFixture(file: string): UpdateFileFixture | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return undefined;
    const { distribution, latest, download } = raw as Partial<UpdateFileFixture>;
    if (distribution !== 'installed' && distribution !== 'portable') return undefined;
    if (
      latest !== null &&
      (typeof latest?.version !== 'string' || typeof latest.notes !== 'string')
    )
      return undefined;
    if (
      typeof download?.ticks !== 'number' ||
      typeof download.tickMs !== 'number' ||
      !['ok', 'offline', 'checksum'].includes(download.outcome)
    )
      return undefined;
    return { distribution, latest, download };
  } catch {
    return undefined;
  }
}

function isFilePath(raw: string): boolean {
  return raw.endsWith('.json') || existsSync(raw);
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Undefined unless the env var names a readable, valid fixture file. */
export function updateFileFixtureFor(currentVersion: string): UpdateFileFixtureWiring | undefined {
  const raw = process.env[ENV_VAR]?.trim();
  if (raw === undefined || raw.length === 0 || !isFilePath(raw)) return undefined;
  const initial = parseFileFixture(raw);
  if (initial === undefined) return undefined;

  const check = async (): Promise<UpdateCheckResult> => {
    const current = parseFileFixture(raw);
    if (current === undefined) return { kind: 'failed', reason: 'unknown' };
    if (current.latest === null || current.latest.version === currentVersion) {
      return { kind: 'up-to-date' };
    }
    return { kind: 'available', ...current.latest, releasedAt: null };
  };

  const backend: UpdateBackend = {
    async download(signal, onProgress, _expectedVersion) {
      const script = parseFileFixture(raw)?.download;
      if (script === undefined) return { kind: 'failed', reason: 'unknown' };
      for (let tick = 1; tick <= script.ticks; tick++) {
        await pause(script.tickMs, signal);
        if (signal.aborted) return { kind: 'failed', reason: 'cancelled' };
        const progress: UpdateProgress = {
          ratio: tick / script.ticks,
          bytesDone: tick,
          bytesTotal: script.ticks,
        };
        onProgress(progress);
      }
      if (signal.aborted) return { kind: 'failed', reason: 'cancelled' };
      if (script.outcome === 'ok') return { kind: 'done' };
      return { kind: 'failed', reason: script.outcome };
    },
    quitAndInstall() {
      (globalThis.sbUpdateInstallCalls ??= []).push({ at: new Date().toISOString() });
    },
    autoInstallOnAppQuit: false,
  };

  return { check, backend, distribution: initial.distribution };
}

const OUTCOMES: Record<string, UpdateCheckResult> = {
  offline: { kind: 'failed', reason: 'network' },
  http: { kind: 'failed', reason: 'http' },
  'up-to-date': { kind: 'up-to-date' },
  available: {
    kind: 'available',
    version: '99.0.0',
    notes: '### Added\n- Fixture release',
    releasedAt: null,
  },
};

/** One outcome per call; the last one repeats. */
export function updateFixtureFor(): (() => Promise<UpdateCheckResult>) | undefined {
  const raw = process.env[ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const names = raw.split(',').map((name) => name.trim());
  const script: UpdateCheckResult[] = [];
  for (const name of names) {
    const outcome = OUTCOMES[name];
    if (outcome === undefined) return undefined;
    script.push(outcome);
  }
  let next = 0;
  return async () => script[Math.min(next++, script.length - 1)]!;
}
