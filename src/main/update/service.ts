/* Decides whether an update check runs and owns the resulting `UpdateState`.

   Electron-free: the checker, the clock, the support verdict and the storage
   directory are injected. The service never compares versions — "newer" is the
   checker's verdict; the only version test here is whether the stored record
   was written by the build that is running now.

   The 24 h window is measured from `lastSuccessAt` alone, and only a successful
   check writes it, so a failed check can never close the window. For the same
   reason a failure keeps the last known offer: an update found yesterday still
   shows after an offline start today. */

import type { UpdateDistribution, UpdateOffer, UpdateState, UpdateStatus } from '@shared/types';
import type { UpdateCheckResult } from './checker';
import { loadUpdateRecord, saveUpdateRecord } from './store';
import type { UpdateRecord } from './store';

export const UPDATE_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_STARTUP_DELAY_MS = 3_000;

export interface UpdateSupport {
  supported: boolean;
  disabledReason: UpdateState['disabledReason'];
}

export interface UpdateServiceOptions {
  /** Directory holding the remembered check (`userData`). */
  dir: string;
  now?: () => Date;
  check: () => Promise<UpdateCheckResult>;
  currentVersion: string;
  distribution: UpdateDistribution;
  /** Asked on every call, so a verdict that settles after construction (demo mode) is honoured. */
  isSupported: () => UpdateSupport;
  timeoutMs?: number;
  onStateChange?: (state: UpdateState) => void;
}

export interface UpdateService {
  getState(): Promise<UpdateState>;
  /** A manual check ignores the 24 h window; an automatic one respects it. Never rejects. */
  check(options: { manual: boolean }): Promise<UpdateState>;
  /** Returns at once; the single automatic attempt of this process runs after `delayMs`. */
  scheduleStartupCheck(delayMs?: number): void;
  stop(): void;
}

type Known = Pick<UpdateRecord, 'update' | 'error' | 'lastCheckedAt' | 'lastSuccessAt'>;

const NOTHING_KNOWN: Known = {
  update: null,
  error: null,
  lastCheckedAt: null,
  lastSuccessAt: null,
};

function deriveStatus(known: Known): UpdateStatus {
  if (known.error !== null) return 'error';
  if (known.update !== null) return 'available';
  if (known.lastSuccessAt !== null) return 'up-to-date';
  return 'idle';
}

/** An unparseable or future timestamp (a clock corrected backwards) cannot be trusted to keep the window shut. */
function isWindowOpen(lastSuccessAt: string | null, nowMs: number): boolean {
  if (lastSuccessAt === null) return true;
  const last = Date.parse(lastSuccessAt);
  if (Number.isNaN(last)) return true;
  const elapsed = nowMs - last;
  return elapsed < 0 || elapsed >= UPDATE_CHECK_WINDOW_MS;
}

function offerOf(result: UpdateCheckResult): UpdateOffer | null {
  if (result.kind !== 'available') return null;
  return { version: result.version, notes: result.notes, releasedAt: result.releasedAt };
}

export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  const now = options.now ?? ((): Date => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let known: Known = NOTHING_KNOWN;
  let checking = false;
  let restoring: Promise<void> | undefined;
  let inFlight: Promise<UpdateState> | undefined;
  let startupScheduled = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPublished = '';

  function compose(): UpdateState {
    const { supported, disabledReason } = options.isSupported();
    return {
      status: checking ? 'checking' : deriveStatus(known),
      supported,
      disabledReason: supported ? null : disabledReason,
      distribution: options.distribution,
      currentVersion: options.currentVersion,
      ...known,
    };
  }

  function publish(): UpdateState {
    const state = compose();
    const serialized = JSON.stringify(state);
    if (serialized === lastPublished) return state;
    lastPublished = serialized;
    try {
      options.onStateChange?.(state);
    } catch (error) {
      console.warn('[update] state listener failed:', error);
    }
    return state;
  }

  function ensureRestored(): Promise<void> {
    restoring ??= (async () => {
      const record = await loadUpdateRecord(options.dir);
      if (record === null) return;
      const { update, error, lastCheckedAt, lastSuccessAt } = record;
      // A record from another build may offer the very version now running, and its success
      // must not keep the window shut for the new build.
      known =
        record.checkedWith === options.currentVersion
          ? { update, error, lastCheckedAt, lastSuccessAt }
          : { update: null, error, lastCheckedAt, lastSuccessAt: null };
      publish();
    })();
    return restoring;
  }

  /** Never rejects and never outlasts `timeoutMs`; a late answer after a timeout is ignored. */
  async function callChecker(): Promise<UpdateCheckResult> {
    const answered = Promise.resolve()
      .then(() => options.check())
      .catch((): UpdateCheckResult => ({ kind: 'failed', reason: 'unknown' }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<UpdateCheckResult>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'failed', reason: 'timeout' }), timeoutMs);
    });
    try {
      return await Promise.race([answered, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function runAttempt(): Promise<UpdateState> {
    checking = true;
    publish();
    try {
      const result = await callChecker();
      const at = now().toISOString();
      known =
        result.kind === 'failed'
          ? { ...known, error: result.reason, lastCheckedAt: at }
          : { update: offerOf(result), error: null, lastCheckedAt: at, lastSuccessAt: at };
      await saveUpdateRecord(options.dir, {
        version: 1,
        checkedWith: options.currentVersion,
        ...known,
      });
    } finally {
      checking = false;
    }
    return publish();
  }

  async function check({ manual }: { manual: boolean }): Promise<UpdateState> {
    if (!options.isSupported().supported) return compose();
    await ensureRestored();
    if (inFlight !== undefined) return inFlight;
    if (!manual && !isWindowOpen(known.lastSuccessAt, now().getTime())) return compose();
    // Assigned synchronously after the last await, so a second caller always sees it and joins.
    const attempt = runAttempt()
      .catch(() => publish())
      .finally(() => {
        inFlight = undefined;
      });
    inFlight = attempt;
    return attempt;
  }

  async function getState(): Promise<UpdateState> {
    if (options.isSupported().supported) await ensureRestored();
    return compose();
  }

  function scheduleStartupCheck(delayMs = DEFAULT_STARTUP_DELAY_MS): void {
    if (startupScheduled) return;
    startupScheduled = true;
    startupTimer = setTimeout(() => {
      startupTimer = undefined;
      void check({ manual: false }).catch(() => undefined);
    }, delayMs);
  }

  function stop(): void {
    if (startupTimer !== undefined) clearTimeout(startupTimer);
    startupTimer = undefined;
  }

  return { getState, check, scheduleStartupCheck, stop };
}
