// @vitest-environment jsdom
/* The close-during-a-run warning (042/074, D7): no automated coverage existed
 * for this before the review that flagged it, and 074 generalised the dialog
 * from "the gardener, always" to "whichever registered task(s) are actually
 * running". What matters here is not that the dialog renders, but that:
 *
 * - it names the running task kind(s), read off the live work queue
 *   (`useWorkTasks()`, fed by `event:work-tasks` — see `gardener-transport.ts`
 *   for why a maintenance run is published that way since 074, D5);
 * - "Stop and close" cancels every running task (`tasks:cancel`, one call per
 *   task) and only confirms the close (`window:confirmClose`) once ALL of
 *   them have actually resolved — never optimistically, and never at all if
 *   any of them fails (the dialog stays open with an error);
 * - "Cancel" — and `Escape`, wired to the same handler by the `Dialog` atom —
 *   call `window:cancelClose`, never touch `window:confirmClose` or
 *   `tasks:cancel`, and close the dialog locally.
 *
 * Mirrors `interview-dialog.test.tsx`'s harness shape, extended with an event
 * registry (`tests/renderer/queries.test.ts`'s `wire()` pattern) since this
 * dialog listens for `event:close-requested` rather than taking `open` as a
 * prop, and with `gardener-transport.ts`'s queue-publishing helpers since the
 * dialog now reads the work queue instead of a gardener-only progress store.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { WorkTask } from '@shared/types';
import { QuitDuringRunDialog } from '@renderer/components/QuitDuringRunDialog';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { publishGardenerRun, publishWorkQueue, publishedWorkQueue } from './gardener-transport';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Mock {
  payloadsOf(channel: IpcChannel): unknown[];
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
}

/** Same shape as `interview-dialog.test.tsx`'s `installMock`, plus the event
    registry from `queries.test.ts`'s `wire()` — this dialog needs both: it
    calls channels (`tasks:cancel`, `window:confirmClose`/`cancelClose`,
    `work:list`) and listens for an event (`event:close-requested`).
    `work:list` is not optional: mounting the dialog subscribes `useWorkTasks`
    to the work queue, which seeds itself from that channel — answering with
    whatever was published (`publishedWorkQueue()`) is what keeps the seed
    from contradicting a scenario a test already set up. */
function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      if (channel === 'work:list') return publishedWorkQueue();
      throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = {
    invoke,
    on: (event: string, callback: (payload: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), callback]);
      return () => undefined;
    },
    off: () => undefined,
  } as unknown as SbBridge;
  return {
    payloadsOf: (channel) =>
      calls.filter((entry) => entry.channel === channel).map((e) => e.payload),
    emit: (event, payload) => {
      for (const callback of listeners.get(event) ?? []) callback(payload as unknown);
    },
  };
}

/** A `tasks:cancel` the test controls: it does not resolve or reject until the
    test says so — this is what makes the ordering assertion (confirm only
    after every cancel resolves) actually provable rather than assumed. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderDialog(handlers: Handlers = {}): Mock {
  const sb = installMock({
    'tasks:cancel': () => true,
    'window:confirmClose': () => undefined,
    'window:cancelClose': () => undefined,
    ...handlers,
  });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <QuitDuringRunDialog />
    </QueryClientProvider>,
  );
  return sb;
}

/** A running maintenance task, the same shape `gardener-run-state.ts` mirrors
    onto the registry (see `gardener-transport.ts`'s `gardenerWorkTask`). */
function runningGardenerTask(): WorkTask {
  return {
    id: 'gardener-task',
    kind: 'gardener',
    lane: 'model',
    subject: { label: 'Maintenance run', ref: null },
    state: 'running',
    progress: 0.5,
    message: null,
    error: null,
    queuePosition: null,
    hasResult: false,
    queuedAt: '2026-08-22T10:00:00+02:00',
    startedAt: '2026-08-22T10:00:00+02:00',
    finishedAt: null,
    detail: null,
    // Mirrors the real registry task (`WorkRegistry.startExternal`, 074 D2).
    retryable: false,
  };
}

/** A second running task of a different kind — used to prove the dialog names
    (and stops) more than just the gardener once more than one lane is busy. */
function runningIngestTask(): WorkTask {
  return {
    id: 'ingest-task',
    kind: 'ingest',
    lane: 'free',
    subject: { label: 'Some source', ref: null },
    state: 'running',
    progress: 0.2,
    message: null,
    error: null,
    queuePosition: null,
    hasResult: false,
    queuedAt: '2026-08-22T10:00:00+02:00',
    startedAt: '2026-08-22T10:00:00+02:00',
    finishedAt: null,
    detail: null,
    // Mirrors the real registry task (`WorkRegistry.startExternal`, 074 D4).
    retryable: false,
  };
}

/** Two buttons share the accessible name "Cancel": the dialog's own header
    `x` (its `aria-label` is `closeLabel`, i.e. `garden.quit.cancel`) and the
    footer's secondary button. The footer one is what a user actually reads
    as "Cancel" — it renders after the header in DOM order. */
function footerCancelButton(): HTMLElement {
  const matches = screen.getAllByRole('button', { name: 'Cancel' });
  return matches[matches.length - 1] as HTMLElement;
}

async function openDialog(sb: Mock, title: string): Promise<void> {
  sb.emit('event:close-requested', undefined);
  await screen.findByText(title);
}

beforeEach(() => {
  /* The work queue is module-level state that outlives any one test — start
     every test from "nothing running", the same as `run-strip.test.tsx`. */
  publishGardenerRun(null);
});

afterEach(() => {
  delete window.sb;
});

describe('QuitDuringRunDialog', () => {
  it('stays hidden until event:close-requested fires, then names the one running task kind', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask()]);
    const sb = renderDialog();

    expect(screen.queryByText('Still running: Maintenance.')).toBeNull();

    await openDialog(sb, 'Still running: Maintenance.');

    expect(
      screen.getByText(
        'Stopping it now ends it cleanly. Closing without stopping is not offered — a write could still be in progress.',
      ),
    ).toBeTruthy();
  });

  it('names every running task kind, comma-separated, when more than one lane is busy', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask(), runningIngestTask()]);
    const sb = renderDialog();

    await openDialog(sb, 'Still running: Maintenance, Take in source.');
  });

  it('confirms the close only after every running task has been cancelled, never before', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask()]);
    const gate = deferred<boolean>();
    const sb = renderDialog({ 'tasks:cancel': () => gate.promise });
    await openDialog(sb, 'Still running: Maintenance.');

    await userEvent.click(screen.getByRole('button', { name: 'Stop and close' }));

    /* The cancel call is in flight and unresolved: confirming the close this
       early would be exactly the optimistic close the contract comment rules
       out. */
    await waitFor(() => expect(sb.payloadsOf('tasks:cancel')).toEqual([{ id: 'gardener-task' }]));
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);

    gate.resolve(true);

    await waitFor(() => expect(sb.payloadsOf('window:confirmClose')).toHaveLength(1));
  });

  it('cancels every running task before confirming, when more than one is running', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask(), runningIngestTask()]);
    const sb = renderDialog();
    await openDialog(sb, 'Still running: Maintenance, Take in source.');

    await userEvent.click(screen.getByRole('button', { name: 'Stop and close' }));

    await waitFor(() =>
      expect(sb.payloadsOf('tasks:cancel')).toEqual(
        expect.arrayContaining([{ id: 'gardener-task' }, { id: 'ingest-task' }]),
      ),
    );
    await waitFor(() => expect(sb.payloadsOf('window:confirmClose')).toHaveLength(1));
  });

  it('does not confirm the close and shows an error when a cancel rejects', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask()]);
    const gate = deferred<boolean>();
    const sb = renderDialog({ 'tasks:cancel': () => gate.promise });
    await openDialog(sb, 'Still running: Maintenance.');

    await userEvent.click(screen.getByRole('button', { name: 'Stop and close' }));
    gate.reject(Object.assign(new Error('boom'), { code: 'io' }));

    expect(await screen.findByText('That did not work')).toBeTruthy();
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);
    /* The dialog stays open on a failure — guardrail 1, never a silent
       failure — so the title is still there behind the error. */
    expect(screen.getByText('Still running: Maintenance.')).toBeTruthy();
  });

  it('cancel calls window:cancelClose, never window:confirmClose or tasks:cancel, and closes the dialog', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask()]);
    const sb = renderDialog();
    await openDialog(sb, 'Still running: Maintenance.');

    await userEvent.click(footerCancelButton());

    await waitFor(() => expect(sb.payloadsOf('window:cancelClose')).toHaveLength(1));
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);
    expect(sb.payloadsOf('tasks:cancel')).toEqual([]);
    expect(screen.queryByText('Still running: Maintenance.')).toBeNull();
  });

  it('Escape behaves exactly like cancel: window:cancelClose, no confirm, dialog closes', async () => {
    setLanguage('en');
    publishWorkQueue([runningGardenerTask()]);
    const sb = renderDialog();
    await openDialog(sb, 'Still running: Maintenance.');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(sb.payloadsOf('window:cancelClose')).toHaveLength(1));
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);
    expect(sb.payloadsOf('tasks:cancel')).toEqual([]);
    expect(screen.queryByText('Still running: Maintenance.')).toBeNull();
  });
});
