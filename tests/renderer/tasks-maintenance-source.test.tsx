// @vitest-environment jsdom
/* 072, D3, AC9 — "one store feeds both surfaces."
 *
 * `RunStrip` reads `gardener-progress.ts` directly; the tasks view model
 * (`tasks-view.ts`) reads the very same snapshot plus `tasks-store.ts`'s
 * `WorkTask[]`. Since 074, D5 those are one source all the way down: the
 * maintenance run is a `WorkTask` in the registry too, and the snapshot is
 * derived from it — so every scenario below is published over the one real
 * transport (`gardener-transport.ts`), not pushed into the progress store.
 *
 * If either surface ever grew its own parallel fetch of the work queue or the
 * maintenance snapshot, the two would eventually disagree — exactly the "two
 * answers" bug this story exists to end. This file renders
 * two independent consumers against the one store/event stream and asserts
 * they see the exact same state at the same time, including the case that
 * actually breaks a naive implementation: a subscriber that mounts *after*
 * the state already changed must see the current answer on its very first
 * render, not just future updates (071/042's regression class).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GardenerRunProgress, WorkTask } from '@shared/types';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { SbBridge } from '@renderer/lib/bridge';
import { RunStrip } from '@renderer/components/RunStrip';
import { t } from '@renderer/i18n';
import { setGardenerProgress } from '@renderer/lib/gardener-progress';
import { useWorkTasks } from '@renderer/lib/queries/tasks';
import { useGardenerProgress } from '@renderer/lib/gardener-progress';
import { maintenanceTaskRow, tasksBadgeCount } from '@renderer/lib/tasks-view';
import { publishGardenerRun, publishWorkQueue, publishedWorkQueue } from './gardener-transport';

type ProgressEvent = GardenerRunProgress;

function runningProgress(percent: number): ProgressEvent {
  return {
    phase: 'checks',
    check: 'orphan',
    done: 2,
    total: 9,
    running: true,
    stage: 'checks',
    percent,
    remaining: [],
    startedAt: '2026-09-07T10:00:00+02:00',
    trigger: 'user',
  };
}

function finishedProgress(): ProgressEvent {
  return { ...runningProgress(100), phase: 'done', check: null, running: false, stage: 'done' };
}

function workTask(id: string, state: WorkTask['state'] = 'running'): WorkTask {
  return {
    id,
    kind: 'ingest',
    lane: 'free',
    subject: { label: id, ref: null },
    state,
    progress: 0.5,
    message: null,
    hasResult: false,
    error: null,
    queuePosition: state === 'queued' ? 1 : null,
    queuedAt: '2026-09-07T09:00:00.000Z',
    startedAt: state === 'queued' ? null : '2026-09-07T09:00:01.000Z',
    finishedAt: null,
    detail: null,
    retryable: true,
  };
}

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

function installMock(handlers: SbHandlers = {}): void {
  window.sb = {
    invoke: async (channel: IpcChannel, payload?: unknown) => {
      const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
      return handler ? handler(payload) : channel === 'work:list' ? [] : null;
    },
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as SbBridge;
}

/** Stand-in for the two real surfaces (`RunStrip` and D4's tasks screen):
    each reads the store/event stream independently, exactly the way the two
    real components will, and renders the one number that must agree between
    them — the combined badge count. */
function Reader({ label }: { label: string }) {
  const tasks = useWorkTasks();
  const progress = useGardenerProgress();
  return <div data-testid={label}>{tasksBadgeCount(tasks, progress)}</div>;
}

function renderReader(label: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Reader label={label} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  installMock({ 'work:list': () => publishedWorkQueue() });
  publishGardenerRun(null);
  /* The queue alone cannot clear the derived snapshot between tests: nothing
     is subscribed to it while no component is mounted (074, D5), so the store
     is put back directly as well. */
  setGardenerProgress(finishedProgress());
});

afterEach(() => {
  delete window.sb;
});

/* 072 review cycle 2, finding 4: the story's Acceptance Tests mapping for AC9
 * names this file's "one store feeds both surfaces" test — but that name
 * belongs to the block below, which renders the *real* `RunStrip` next to
 * the tasks-view derivation and would fail if a second, independent source
 * ever crept in. This block only proves two identical `Reader` stand-ins
 * agree with each other (trivially true regardless of the real surfaces),
 * which is still a useful late-mounting-subscriber check for the store
 * itself — renamed so it no longer claims the AC9 mapping it wasn't. */
describe('the tasks store keeps every reader in sync (store-level, not AC9 itself)', () => {
  it('two independent readers observe the exact same task list at the same time', async () => {
    const first = renderReader('first');
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('0'));

    const second = renderReader('second');
    expect(screen.getByTestId('second').textContent).toBe('0');

    const others = [workTask('a', 'running'), workTask('b', 'queued')];
    publishWorkQueue(others);

    await waitFor(() => {
      expect(screen.getByTestId('first').textContent).toBe('2');
      expect(screen.getByTestId('second').textContent).toBe('2');
    });

    /* The run joins the very same queue (074, D2) — and must be counted once,
       not twice, even though it now arrives as a registry task *and* as the
       snapshot the badge adds its `+1` for. */
    publishGardenerRun(runningProgress(30), others);

    await waitFor(() => {
      expect(screen.getByTestId('first').textContent).toBe('3');
      expect(screen.getByTestId('second').textContent).toBe('3');
    });

    first.unmount();
    second.unmount();
  });

  it('a late-mounting subscriber sees the current state immediately, not just future updates', async () => {
    const first = renderReader('first');
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('0'));

    /* State changes while only one reader is mounted at all. */
    publishGardenerRun(runningProgress(10), [workTask('a', 'running')]);
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('2'));

    /* The late reader mounts only now — no further event fires before the
       assertion. A store that only pushed updates to already-mounted
       subscribers (the exact bug class 042/071 exist to prevent) would render
       this one at a stale "0" until the next event happened to arrive. */
    renderReader('late');

    expect(screen.getByTestId('late').textContent).toBe('2');

    first.unmount();
  });

  it('a task removed from queued state never contributes a queue position or a stale badge count', async () => {
    const first = renderReader('first');
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('0'));

    publishWorkQueue([workTask('a', 'queued')]);
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('1'));

    /* The task is removed from the queue: the registry's next `event:work-
       tasks` no longer lists it at all (071's "remove" contract) — the badge
       must drop back down, not keep counting a task that no longer exists. */
    publishWorkQueue([]);
    await waitFor(() => expect(screen.getByTestId('first').textContent).toBe('0'));

    first.unmount();
  });
});

/* 072 review, finding 3: the tests above prove two identical `Reader`
 * components agree with each other, which is trivially true regardless of
 * whether the real surfaces share a source — neither touches `RunStrip.tsx`.
 * This block renders the *real* `RunStrip` next to a stand-in for D4's tasks
 * screen maintenance row — not the whole `TaskRow` (which needs mutations
 * this test does not exercise), but the exact derivation `TaskRow` renders
 * unmodified: `tasks-view.ts`'s own `maintenanceTaskRow`/`maintenanceLabel`.
 * Both read `useGardenerProgress` off the one `gardener-progress.ts` store.
 * If `RunStrip` ever grew a second, independent subscription (or its own
 * copy of the label logic that drifted from `tasks-view.ts`'s), the two
 * assertions below would go red the moment the snapshot changed. */
function MaintenanceRow() {
  const progress = useGardenerProgress();
  const row = maintenanceTaskRow(progress, t);
  return <div data-testid="maintenance-row">{row?.subject.label ?? ''}</div>;
}

function renderBothSurfaces() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tasks']}>
        <RunStrip />
        <MaintenanceRow />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('one store feeds both surfaces (AC9)', () => {
  it('RunStrip and the tasks maintenance row show the identical, translated label for the same snapshot, and stay identical as it changes', () => {
    publishGardenerRun(runningProgress(30));
    const { unmount } = renderBothSurfaces();

    const runStripWhat = (): string | null | undefined =>
      document.querySelector('.sb-runstrip-what')?.textContent;
    const maintenanceRowLabel = (): string => screen.getByTestId('maintenance-row').textContent!;

    expect(runStripWhat()).toBe(maintenanceRowLabel());
    // Never the raw, untranslated finding-kind id — the exact bug this finding closed.
    expect(runStripWhat()).not.toBe('orphan');

    publishGardenerRun({ ...runningProgress(60), check: 'broken-link' });
    expect(runStripWhat()).toBe(maintenanceRowLabel());
    expect(runStripWhat()).not.toBe('broken-link');

    publishGardenerRun({ ...runningProgress(80), stage: 'audit', check: null });
    expect(runStripWhat()).toBe(maintenanceRowLabel());

    unmount();
  });
});
