/* The run-duration seam: `SB_E2E_STAGE_DELAY_MS` (066, D4).
 *
 * Without a model the stage plan is a single `checks` stage over ten mechanical
 * checks, so a maintenance run is over before an e2e spec could navigate away
 * and come back to it. The seam holds the checks stage open — and because it is
 * production code in the main process, two things have to stay true:
 *
 *   - **Unset is untouched.** Nothing about the run may change when the variable
 *     is missing, empty, `0`, negative, or not a number at all. Proven by faking
 *     `setTimeout` and *only* `setTimeout`: `setImmediate` stays real, so the
 *     run's own `tick()` between checks still turns, but any timer the seam
 *     created would never fire. A run that finishes under that clock awaited no
 *     timer — and the case with a real delay below shows that this clock does
 *     catch one, so the proof is not vacuous.
 *   - **Cancel stays prompt.** With a five-second delay set, a stop must not
 *     cost five seconds. The fake clock is never advanced by a single
 *     millisecond in that test: the run is parked in the pause, `gardener:cancel`
 *     releases it, and the timer never fires. Only the abort can have ended the
 *     wait.
 *
 * The seam is read when `ipc/gardener-run.ts` loads, so each case needs a fresh
 * module graph (`vi.resetModules()`), not just a different environment.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKS } from '@core/gardener';
import type { IpcChannel, IpcEventName, IpcRequest, IpcResponse } from '@shared/ipc';
import type { GardenerRunProgress, WorkTask } from '@shared/types';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW_MS, freezeTime } from '../helpers/time';

/* No windows and no encryption in the test — the same stub the other main
   process tests use. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
}));

const STAGE_DELAY_ENV = 'SB_E2E_STAGE_DELAY_MS';

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

/* Since 074 D2 a published step travels as the `detail` of the run's mirrored
   work task, over `event:work-tasks` — the same numbers, one producer. */
type Progress = GardenerRunProgress;

/** The state the slot was claimed with: running, but not yet over a stage plan.
    Not a step the run reported, so it is not counted as one. */
function isClaimSeed(step: Progress): boolean {
  return step.running && step.total === 0;
}

/**
 * A main process with the maintenance channels over a real temporary vault, on
 * a module graph loaded *after* `delay` was put into the environment.
 */
async function createHarness(userDataDir: string, delay: string | undefined) {
  vi.stubEnv(STAGE_DELAY_ENV, delay);
  vi.resetModules();

  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { forgetGardenerState } = await import('../../src/main/gardener-state');
  const { cancelGardenerRun, gardenerRunSnapshot } =
    await import('../../src/main/gardener-run-state');
  const { gardenerHandlers } = await import('../../src/main/ipc/gardener');

  /* State from an earlier case must not survive into this graph. */
  forgetGardenerState();
  cancelGardenerRun();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) =>
    IndexService.open(new FsVaultStore(root), { now: () => new Date(NOW_MS) }),
  );

  const checks: Progress[] = [];
  const last: { progress: Progress | null; task: WorkTask | null } = {
    progress: null,
    task: null,
  };
  let onChecks: (() => void) | null = null;
  services.sendEvent = ((name: IpcEventName, payload: unknown) => {
    if (name !== 'event:work-tasks') return;
    const task = (payload as WorkTask[]).filter((entry) => entry.kind === 'gardener').at(-1);
    if (task === undefined) return;
    last.task = task;
    const step = task.detail as Progress | null;
    /* Every state change reports the whole list, so the same step can arrive
       more than once — it counts once. */
    if (step === null || step === last.progress || isClaimSeed(step)) return;
    last.progress = step;
    if (step.phase !== 'checks') return;
    checks.push(step);
    onChecks?.();
  }) as typeof services.sendEvent;

  const handlers: Handlers = { ...gardenerHandlers(services) };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  /** Resolves as soon as the run reports the check it is about to make. */
  const firstCheck = new Promise<void>((resolve) => {
    if (checks.length > 0) resolve();
    onChecks = resolve;
  });

  return { services, call, checks, last, firstCheck, gardenerRunSnapshot };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/**
 * Fake `setTimeout` — and nothing else. `Date` stays frozen as everywhere in
 * these tests, `setImmediate` stays real so the run keeps turning, and the fake
 * clock is never advanced: a timer created under it does not fire, full stop.
 */
function freezeTimeouts(): void {
  vi.useFakeTimers({ now: NOW_MS, toFake: ['Date', 'setTimeout'] });
}

/** Let the event loop turn a few times, as far as a run can get without a timer. */
async function turns(count = 25): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('the maintenance run duration seam', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness | null = null;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-delay-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await harness?.services.closeVault();
    harness = null;
    vi.unstubAllEnvs();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  async function open(delay: string | undefined): Promise<Harness> {
    harness = await createHarness(userDataDir, delay);
    await harness.services.openVault(vault.root);
    return harness;
  }

  /* Every value that is not a positive integer means "no delay" — and means it
     without throwing, because a mistyped variable must not keep the shipped run
     from starting. `undefined` is the case that matters most: it is how the app
     runs for every user. */
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['zero', '0'],
    ['negative', '-250'],
    ['fractional', '1.5'],
    ['not a number', 'soon'],
  ])(
    'awaits no timer between checks when the seam is %s — the run is the run it always was',
    async (_label, delay) => {
      const run = await open(delay);

      /* Under a clock whose timers never fire, this only returns if the run
         never waited for one. If it hangs, the seam leaked into a normal run. */
      freezeTimeouts();
      const report = await run.call('gardener:run', {});

      expect(report.complete).toBe(true);
      expect(run.checks.length).toBe(CHECKS.length);
      expect(run.last.progress).toMatchObject({ phase: 'done', running: false });
      expect(run.gardenerRunSnapshot()).toBeNull();
    },
  );

  it('holds the checks stage for the delay it was given — and lets cancel through at once', async () => {
    const run = await open('5000');
    freezeTimeouts();

    let settled = false;
    const running = run.call('gardener:run', {});
    void running.then(
      () => (settled = true),
      () => (settled = true),
    );

    /* The run reports the first check and then parks in the pause. The clock is
       never advanced, so the five seconds cannot pass on their own — this is the
       control that shows the case above is not vacuous. */
    await run.firstCheck;
    await turns();
    expect(settled).toBe(false);
    expect(run.checks.length).toBe(1);

    /* Only the abort can end the wait now. It does, and it does so without a
       single millisecond of the delay elapsing. */
    await run.call('gardener:cancel', undefined);
    await running.catch(() => null);

    expect(settled).toBe(true);
    /* Nothing ran on after the stop, and nothing keeps claiming a run — the
       mirrored task ends as cancelled, not as a run that quietly completed. */
    expect(run.checks.length).toBe(1);
    expect(run.last.task).toMatchObject({ state: 'cancelled' });
    expect(run.gardenerRunSnapshot()).toBeNull();
  });
});
