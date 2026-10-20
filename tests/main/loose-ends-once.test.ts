/* 056: loose ends derive once per index, not once per surface (D3).
 *
 * `looseEndsDerived` (D1) is memoized by index identity; D2 wired the core
 * consumers (`reminders()`, `modelLooseEnds`) to it; this deliverable wires
 * the two gardener call sites and `journal:get`/`journal:interviewPlan`'s
 * IPC-level composition. This test proves the wiring holds end to end,
 * through the real handlers (`buildHandlers`, mirroring
 * `tests/main/journal-gardener-flow.test.ts`'s harness): the same rule runs
 * once per index and `today`, no matter how many surfaces ask for it.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { announcementsOf, findLooseEnds, resolutionCheck } from '@core/journal/loose-ends';
import type * as LooseEnds from '@core/journal/loose-ends';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW, day, freezeTime } from '../helpers/time';

/* The real rule, wrapped in spies — same pattern as
   `tests/core/journal/loose-ends-derived.test.ts` and
   `tests/core/overview/reminders.test.ts` — so the call counts show how
   often the derivation actually ran, and the output is still the rule's
   own. */
vi.mock('@core/journal/loose-ends', async (importOriginal) => {
  const actual = await importOriginal<typeof LooseEnds>();
  return {
    ...actual,
    findLooseEnds: vi.fn(actual.findLooseEnds),
    resolutionCheck: vi.fn(actual.resolutionCheck),
    announcementsOf: vi.fn(actual.announcementsOf),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  screen: { getAllDisplays: () => [], getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
  Notification: class {
    static isSupported(): boolean {
      return false;
    }
  },
}));

const findLooseEndsSpy = vi.mocked(findLooseEnds);
const resolutionCheckSpy = vi.mocked(resolutionCheck);
const announcementsOfSpy = vi.mocked(announcementsOf);

/* The day that announces something and never gets a follow-up: exactly the
   phrasing and date pattern `tests/core/journal/loose-ends.test.ts` and
   `loose-ends-derived.test.ts` use — `findDates`/`isForward` recognize the
   relative "morgen" against the day's own date. */
const NOTARY_DAY = day(-5);
const OTHER_DAY = day(-3);

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { forgetGardenerState } = await import('../../src/main/gardener-state');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions } = await import('../../src/main/ipc/overview-deps');
  const { cancelGardenerRun } = await import('../../src/main/gardener-run-state');
  const { buildHandlers } = await import('../../src/main/ipc/register-all');
  const { getWorkQueue, resetWorkQueue } = await import('../../src/main/work-queue');
  const { resetTaskResults } = await import('../../src/main/task-results');

  forgetSessions();
  forgetOverviewState();
  forgetGardenerState();
  cancelGardenerRun();
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) =>
    IndexService.open(new FsVaultStore(root), { now: () => new Date(NOW) }),
  );

  const handlers: Handlers = buildHandlers(services);
  vi.spyOn(services, 'sendEvent').mockImplementation(() => {});

  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, queue: getWorkQueue(services) };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('loose ends derive once (056, D3)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    findLooseEndsSpy.mockClear();
    resolutionCheckSpy.mockClear();
    announcementsOfSpy.mockClear();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-loose-ends-once-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* Deliberately no `overview.claudeProjectsDir`: `claudeSessions()`
       without one returns early and never touches the index (`catchUp`,
       `overview-deps.ts`), so the incidental index refresh a session read
       would trigger never happens here — every handler below reads the same
       `VaultIndex` object, which is exactly the state this test pins. */
    /* One announcement, one day, no follow-up since — the loose end every
       surface below should see the same instance of. */
    await harness.call('journal:setDay', { date: NOTARY_DAY, text: 'Morgen bin ich beim Notar.' });
    await harness.call('journal:setDay', { date: OTHER_DAY, text: 'Ein ruhiger Tag im Büro.' });
    findLooseEndsSpy.mockClear();
    resolutionCheckSpy.mockClear();
    announcementsOfSpy.mockClear();
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('loose ends derive once across journal:get, dashboard:data, reminders:list and the interview plan', async () => {
    const dayView = await harness.call('journal:get', { date: NOTARY_DAY });
    const dashboard = await harness.call('dashboard:data', undefined);
    const remindersList = await harness.call('reminders:list', undefined);
    const plan = await harness.call('journal:interviewPlan', { date: OTHER_DAY });

    expect(findLooseEndsSpy).toHaveBeenCalledTimes(1);

    expect(dayView?.looseEnds.some((entry) => entry.day === NOTARY_DAY)).toBe(true);
    /* A loose-end reminder's `date` is the announcement's `refDate` (the day
       it was due, not the day that announced it) — `path` is what still
       names the announcing day here. */
    expect(
      dashboard.reminders.some(
        (reminder) => reminder.source === 'loose-end' && reminder.path.includes(NOTARY_DAY),
      ),
    ).toBe(true);
    expect(
      remindersList.some(
        (reminder) => reminder.source === 'loose-end' && reminder.path.includes(NOTARY_DAY),
      ),
    ).toBe(true);
    expect(plan.looseEnd).not.toBeNull();
  });

  it('a vault change invalidates the derived loose ends', async () => {
    await harness.call('journal:get', { date: NOTARY_DAY });
    expect(findLooseEndsSpy).toHaveBeenCalledTimes(1);

    await harness.call('journal:setDay', {
      date: OTHER_DAY,
      text: 'Übermorgen räume ich den Keller auf.',
    });

    const after = await harness.call('journal:get', { date: NOTARY_DAY });
    expect(findLooseEndsSpy).toHaveBeenCalledTimes(2);
    expect(after?.looseEnds.some((entry) => entry.day === NOTARY_DAY)).toBe(true);
  });

  it('journal:get for one day does not re-derive the history', async () => {
    await harness.call('journal:get', { date: NOTARY_DAY });
    expect(findLooseEndsSpy).toHaveBeenCalledTimes(1);
    resolutionCheckSpy.mockClear();
    announcementsOfSpy.mockClear();

    await harness.call('journal:get', { date: OTHER_DAY });

    /* The warm derivation's `resolve` travels into `dayLooseEnds` (D3's whole
       point) instead of being rebuilt — `resolutionCheck` folds every day, so
       a second call here would mean the "once per index" promise broke for
       this path. */
    expect(resolutionCheckSpy).not.toHaveBeenCalled();
    /* `dayLooseEnds` and `answeredFor` (`journal-loose-ends.ts`) each read
       `announcementsOf` once for the requested day — never for every day in
       the vault. */
    expect(announcementsOfSpy.mock.calls.every(([source]) => source.day.date === OTHER_DAY)).toBe(
      true,
    );
    expect(findLooseEndsSpy).toHaveBeenCalledTimes(1);
  });

  it('the gardener check and the notifier read the same derivation', async () => {
    const dayView = await harness.call('journal:get', { date: NOTARY_DAY });
    expect(findLooseEndsSpy).toHaveBeenCalledTimes(1);
    const seeded = dayView?.looseEnds.find((entry) => entry.day === NOTARY_DAY);
    expect(seeded).toBeDefined();

    const report = await harness.call('gardener:run', {});
    expect(report.usedLlm).toBe(false);
    const looseEndFinding = report.findings.find((finding) => finding.kind === 'loose-end');
    /* `journal:get`'s loose end already carries `findingId('loose-end', <raw
       id>)` (`journal-loose-ends.ts`'s own wrapping) — the same formula
       `buildFinding` applies to the gardener check's raw finds, over the
       same cached derivation. Both must land on the same id. */
    expect(looseEndFinding?.id).toBe(seeded?.id);

    const { ReminderNotifier } = await import('../../src/main/reminder-notify');
    const show = vi.fn();
    const notifier = new ReminderNotifier(harness.services, {
      notifier: { show },
      now: () => new Date(NOW),
    });
    await notifier.check();

    /* Neither the gardener run nor the notifier's check added a call — both
       read the same cached derivation the first `journal:get` warmed. */
    expect(findLooseEndsSpy).toHaveBeenCalledTimes(1);
  });
});
