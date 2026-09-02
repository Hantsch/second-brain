// @vitest-environment jsdom
/* 042, D8: the regression this deliverable exists to close.
 *
 * "Q1 — the established cause" named two defects, and this file is aimed at
 * the second one: `RunStrip`'s progress used to live in a `useState` inside
 * the component. Unmounting its host — navigating away from whichever screen
 * happened to render it — threw that state away, and `bridge().on` does not
 * replay past events, so a screen mounting again saw nothing at all until the
 * next `event:gardener-progress` tick, which during the `audit` stage can be
 * seconds out. The visible symptom was "the bar disappears when you come
 * back mid-run"; the cause was component lifetime, not a slow or missing
 * event. `RunStrip` now reads `useGardenerProgress`, backed by the
 * module-level store in `src/renderer/lib/gardener-progress.ts` — a store
 * that outlives every component. The test below unmounts and remounts the
 * strip's host mid-run, feeding no new event in between, and asserts the
 * values are still there on the very first render of the new instance.
 *
 * The later blocks (042 code review) close five more gaps: the stage label,
 * the "still to come" line, the ticking elapsed clock and the "no model
 * stage" note all used to be covered by `RunBar`'s own tests, deleted when
 * `RunStrip` replaced it and never re-homed; a stop/continue that fails now
 * has to surface an error instead of vanishing quietly; a run started some
 * OTHER way after a stop must clear the stale "stopped partway" offer
 * (AC5); and that offer must not double up with `GardenScreen`'s own
 * persisted banner while looking straight at `/garden`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStrip } from '@renderer/components/RunStrip';
import {
  dismissGardenerStopped,
  markGardenerStopped,
  setGardenerProgress,
} from '@renderer/lib/gardener-progress';
import { setLanguage } from '@renderer/i18n';
import type { IpcChannel, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { SbBridge } from '@renderer/lib/bridge';

type ProgressEvent = IpcEvents['event:gardener-progress'];

/** One step of a run that is going, distinguishable by its `percent`. */
function running(percent: number): ProgressEvent {
  return {
    phase: 'checks',
    check: 'orphan',
    done: 2,
    total: 9,
    running: true,
    stage: 'checks',
    percent,
    remaining: [],
    startedAt: '2026-08-22T10:00:00+02:00',
    trigger: 'user',
  };
}

/** A running snapshot with the fields a given test cares about overridden. */
function runningWith(overrides: Partial<ProgressEvent>): ProgressEvent {
  return { ...running(50), ...overrides };
}

/** The last thing a run says — finished, cancelled or failed, all the same. */
function finished(): ProgressEvent {
  return { ...running(100), phase: 'done', check: null, done: 9, running: false, stage: 'done' };
}

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Sent {
  channel: IpcChannel;
  payload: unknown;
}

let sent: Sent[] = [];

function calls(channel: IpcChannel): unknown[] {
  return sent.filter((entry) => entry.channel === channel).map((entry) => entry.payload);
}

/* `RunStrip` also mounts `useGardenerCancel`/`useGardenerRun` (the cancel and
 * continue buttons) — those only touch the bridge on click, but the hooks
 * still need one to exist for `QueryClientProvider` to construct around them
 * without throwing. Tests that click one of those buttons pass a handler for
 * the channel it reaches; every other channel resolves to `null`. */
function installMock(handlers: SbHandlers = {}): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    sent.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) return null;
    return handler(payload);
  });
  window.sb = {
    invoke,
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as SbBridge;
}

/** A fresh `QueryClient` per render mirrors a real navigation: a new screen
 * mounts, not a new app — the progress store is the only thing that must
 * survive that, which is exactly what this file checks. `path` puts the
 * strip behind a route context, since it now reads `useLocation()` to avoid
 * duplicating `GardenScreen`'s own "stopped partway" banner on `/garden` —
 * every render needs a router even when the test does not care which route. */
function renderStrip(path = '/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <RunStrip />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
  installMock();
  sent = [];
  /* The store lives outside React and outside test isolation — every test
     puts it back to "no run going, nothing stopped" itself, exactly like
     `queries.test.ts`. */
  setGardenerProgress(finished());
  dismissGardenerStopped();
});

afterEach(() => {
  delete window.sb;
  vi.useRealTimers();
});

describe('RunStrip', () => {
  it('renders nothing when no run is going and none was stopped', () => {
    const { container } = renderStrip();

    expect(container.innerHTML).toBe('');
  });

  it('keeps the running values after the host unmounts and remounts mid-run', () => {
    setGardenerProgress(running(37));
    const first = renderStrip();
    expect(screen.getByText('2 of 9')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37');

    /* This is the story's regression: navigate away (unmount) and back
       (mount a fresh instance), with no new `event:gardener-progress` in
       between. A `useState`-backed strip showed nothing at all here — the
       whole point of the module store is that the fresh instance's very
       first render already has the answer, synchronously, no event needed. */
    first.unmount();
    const second = renderStrip();

    expect(screen.getByText('2 of 9')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37');
    second.unmount();
  });

  it('shows a later live event after a remount, not a stale one from before it', () => {
    setGardenerProgress(running(10));
    const first = renderStrip();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10');
    first.unmount();

    /* An event can also land while nothing is mounted at all — the other half
       of the same defect, already covered for the store itself in
       `queries.test.ts`; here it is checked through the component that
       actually renders the number. */
    setGardenerProgress(running(65));
    renderStrip();

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('65');
  });

  it('names the running check by its stage label', () => {
    setGardenerProgress(runningWith({ stage: 'audit', check: null }));
    renderStrip();

    expect(screen.getByText('The model is interpreting the results')).toBeTruthy();
  });

  it('lists the stages still to come', () => {
    setGardenerProgress(runningWith({ stage: 'checks', remaining: ['audit', 'loose-ends'] }));
    renderStrip();

    expect(screen.getByText('Still to come: contradictions, loose ends')).toBeTruthy();
  });

  it('ticks the elapsed clock upward while a run is going', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00+02:00'));
    setGardenerProgress(runningWith({ startedAt: '2026-08-22T10:00:00+02:00' }));
    renderStrip();

    expect(screen.getByLabelText('Elapsed 0:00')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByLabelText('Elapsed 0:05')).toBeTruthy();
  });

  it('notes that no model stage exists for a run whose plan is checks only', () => {
    setGardenerProgress(runningWith({ stage: 'checks', remaining: [] }));
    renderStrip();

    expect(
      screen.getByText('No model stage — contradictions and loose ends are not checked.'),
    ).toBeTruthy();
  });

  it('cancels via gardener:cancel and offers "continue" once the run actually stops', async () => {
    setGardenerProgress(running(37));
    renderStrip();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel check' }));
    await waitFor(() => expect(calls('gardener:cancel')).toEqual([undefined]));

    /* The cancel mutation only marks the session flag; the run itself still
       has to report `running: false` — the same live event a real stop
       produces — before the strip's view changes to the offer. */
    setGardenerProgress(finished());

    expect(await screen.findByText('Stopped partway.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue check' })).toBeTruthy();
  });

  it('surfaces a rejected cancel instead of leaving the button spinner to settle quietly', async () => {
    installMock({
      'gardener:cancel': () => {
        throw Object.assign(new Error('boom'), { code: 'io' });
      },
    });
    setGardenerProgress(running(37));
    renderStrip();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel check' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    /* Nothing was marked stopped — the run is still shown as running, so the
       retry is just clicking cancel again. */
    expect(screen.getByRole('button', { name: 'Cancel check' })).toBeTruthy();
  });

  it('surfaces a rejected resume and keeps the stopped-partway offer for a retry', async () => {
    installMock({
      'gardener:run': () => {
        throw Object.assign(new Error('boom'), { code: 'io' });
      },
    });
    markGardenerStopped();
    renderStrip('/dashboard');

    await userEvent.click(screen.getByRole('button', { name: 'Continue check' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    /* 042 review, finding 1/2: a failed resume must not have discarded the
       offer up front — it is still there, next to the error, for a retry. */
    expect(screen.getByText('Stopped partway.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue check' })).toBeTruthy();
  });

  it('clears a stale "stopped partway" flag once a run goes some other way, and disappears when that run finishes (AC5)', async () => {
    setGardenerProgress(running(37));
    const { container } = renderStrip();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel check' }));
    await waitFor(() => expect(calls('gardener:cancel')).toEqual([undefined]));
    setGardenerProgress(finished());
    expect(await screen.findByText('Stopped partway.')).toBeTruthy();

    /* A fresh, unrelated run starts some other way — a plain "check now" on
       the maintenance screen, or a resume from its own report banner. Either
       way, this is a live progress snapshot that represents a run genuinely
       going, which must clear the stale flag from before (finding 1). */
    setGardenerProgress(running(5));
    await waitFor(() => expect(screen.queryByText('Stopped partway.')).toBeNull());

    /* That run finishes cleanly — the strip must not fall back into "stopped
       partway" for want of a reset flag; it simply disappears, exactly as it
       would after any other run that completed without ever being stopped. */
    setGardenerProgress(finished());

    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  describe("route suppression on /garden (avoids duplicating GardenScreen's own stopped-partway banner)", () => {
    it('renders nothing for the stopped-partway offer while looking at /garden', () => {
      markGardenerStopped();
      const { container } = renderStrip('/garden');

      expect(container.innerHTML).toBe('');
    });

    it('still renders the stopped-partway offer off /garden', () => {
      markGardenerStopped();
      renderStrip('/dashboard');

      expect(screen.getByText('Stopped partway.')).toBeTruthy();
    });

    it('still renders live progress on /garden — only the static offer is suppressed there', () => {
      setGardenerProgress(running(37));
      renderStrip('/garden');

      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37');
    });
  });
});
