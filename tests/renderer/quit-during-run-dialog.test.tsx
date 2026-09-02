// @vitest-environment jsdom
/* The close-during-a-run warning (042, D7): no automated coverage existed for
 * this before the review that flagged it. What matters here is not that the
 * dialog renders, but that the two ways out actually do what their contract
 * comment promises:
 *
 * - "Stop run and close" calls `gardener:cancel` and only confirms the close
 *   (`window:confirmClose`) once that resolves — never optimistically, and
 *   never at all if the cancel fails (the dialog stays open with an error).
 * - "Cancel" — and `Escape`, wired to the same handler by the `Dialog` atom —
 *   call `window:cancelClose`, never touch `window:confirmClose`, and close
 *   the dialog locally.
 *
 * Mirrors `interview-dialog.test.tsx`'s harness shape, extended with an event
 * registry (`tests/renderer/queries.test.ts`'s `wire()` pattern) since this
 * dialog listens for `event:close-requested` rather than taking `open` as a
 * prop.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import { QuitDuringRunDialog } from '@renderer/components/QuitDuringRunDialog';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Mock {
  payloadsOf(channel: IpcChannel): unknown[];
  emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
}

/** Same shape as `interview-dialog.test.tsx`'s `installMock`, plus the event
    registry from `queries.test.ts`'s `wire()` — this dialog needs both: it
    calls channels (`gardener:cancel`, `window:confirmClose`/`cancelClose`)
    and listens for an event (`event:close-requested`). */
function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
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

/** A `gardener:cancel` the test controls: it does not resolve or reject until
    the test says so — this is what makes the ordering assertion (confirm only
    after cancel resolves) actually provable rather than assumed. */
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
    'gardener:cancel': () => undefined,
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

/** Two buttons share the accessible name "Cancel": the dialog's own header
    `x` (its `aria-label` is `closeLabel`, i.e. `garden.quit.cancel`) and the
    footer's secondary button. The footer one is what a user actually reads
    as "Cancel" — it renders after the header in DOM order. */
function footerCancelButton(): HTMLElement {
  const matches = screen.getAllByRole('button', { name: 'Cancel' });
  return matches[matches.length - 1] as HTMLElement;
}

async function openDialog(sb: Mock): Promise<void> {
  sb.emit('event:close-requested', undefined);
  await screen.findByText('A maintenance run is still going.');
}

afterEach(() => {
  delete window.sb;
});

describe('QuitDuringRunDialog', () => {
  it('stays hidden until event:close-requested fires, then shows title and body', async () => {
    setLanguage('en');
    const sb = renderDialog();

    expect(screen.queryByText('A maintenance run is still going.')).toBeNull();

    await openDialog(sb);

    expect(
      screen.getByText(
        'Stopping it now ends it cleanly, the same way the strip’s own stop button would. Closing without stopping is not offered — a write could still be in progress.',
      ),
    ).toBeTruthy();
  });

  it('confirms the close only after gardener:cancel resolves, never before', async () => {
    setLanguage('en');
    const gate = deferred<void>();
    const sb = renderDialog({ 'gardener:cancel': () => gate.promise });
    await openDialog(sb);

    await userEvent.click(screen.getByRole('button', { name: 'Stop run and close' }));

    /* The cancel call is in flight and unresolved: confirming the close this
       early would be exactly the optimistic close the contract comment rules
       out. */
    await waitFor(() => expect(sb.payloadsOf('gardener:cancel')).toHaveLength(1));
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);

    gate.resolve();

    await waitFor(() => expect(sb.payloadsOf('window:confirmClose')).toHaveLength(1));
  });

  it('does not confirm the close and shows an error when gardener:cancel rejects', async () => {
    setLanguage('en');
    const gate = deferred<void>();
    const sb = renderDialog({ 'gardener:cancel': () => gate.promise });
    await openDialog(sb);

    await userEvent.click(screen.getByRole('button', { name: 'Stop run and close' }));
    gate.reject(Object.assign(new Error('boom'), { code: 'io' }));

    expect(await screen.findByText('That did not work')).toBeTruthy();
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);
    /* The dialog stays open on a failure — guardrail 1, never a silent
       failure — so the title is still there behind the error. */
    expect(screen.getByText('A maintenance run is still going.')).toBeTruthy();
  });

  it('cancel calls window:cancelClose, never window:confirmClose, and closes the dialog', async () => {
    setLanguage('en');
    const sb = renderDialog();
    await openDialog(sb);

    await userEvent.click(footerCancelButton());

    await waitFor(() => expect(sb.payloadsOf('window:cancelClose')).toHaveLength(1));
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);
    expect(sb.payloadsOf('gardener:cancel')).toEqual([]);
    expect(screen.queryByText('A maintenance run is still going.')).toBeNull();
  });

  it('Escape behaves exactly like cancel: window:cancelClose, no confirm, dialog closes', async () => {
    setLanguage('en');
    const sb = renderDialog();
    await openDialog(sb);

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(sb.payloadsOf('window:cancelClose')).toHaveLength(1));
    expect(sb.payloadsOf('window:confirmClose')).toEqual([]);
    expect(sb.payloadsOf('gardener:cancel')).toEqual([]);
    expect(screen.queryByText('A maintenance run is still going.')).toBeNull();
  });
});
