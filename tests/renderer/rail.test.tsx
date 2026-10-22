// @vitest-environment jsdom
/* 042, D5: the rail no longer carries its own maintenance-run indicator — a
   run going is now surfaced by `RunStrip` in the app shell (see
   `src/renderer/components/RunStrip.tsx`, mounted in `AppShell.tsx`), not by
   a rail entry. This file keeps the baseline smoke test that the rail
   renders its regular navigation and the vault indicator; the former
   `GardenerIndicator`-in-the-rail tests were removed with that component. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { VaultStatus } from '@shared/types';
import { Rail } from '@renderer/components/Rail';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { clearToasts, useToasts } from '@renderer/lib/toast';

type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const READY_STATUS: VaultStatus = {
  root: 'C:/vault',
  name: 'Demo-Vault',
  ready: true,
  indexing: false,
  indexRefreshFailedAt: null,
  indexedAt: '2026-08-10T09:00:00+02:00',
  docCount: 42,
};

/** Same idiom as `tests/renderer/garden.test.tsx`: a renderer-only stand-in for `window.sb`. */
function installMock(handlers: SbHandlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
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

function renderRail(hash = '/journal') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[hash]}>
        <Rail />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
});

afterEach(() => {
  delete window.sb;
  clearToasts();
});

function toastSnapshot() {
  return renderHook(() => useToasts()).result.current;
}

describe('Rail', () => {
  it('renders the vault indicator regardless of a maintenance run going', async () => {
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      /* 072, D3: the rail now reads the work queue for its tasks badge — an
         empty queue is the honest "nothing running or waiting" state. */
      'work:list': () => [],
    });

    renderRail('/journal');

    expect(
      await screen.findByRole('button', { name: 'Vault-Status, öffnet die Einstellungen' }),
    ).toBeTruthy();
    /* No dedicated rail entry for a run — that's RunStrip's job now (D3). */
    expect(screen.queryByRole('button', { name: /Wartungslauf läuft/ })).toBeNull();
  });

  /* 072, D1: the tasks entry is new in the rail's system group, before
     maintenance (garden), with only the agent action in between — checked in both languages because the
     order comes from `SCREENS` (language-independent) while the labels used
     to find each item are translated. */
  it('sits the tasks entry, then the agent action, above maintenance in both languages', async () => {
    for (const [language, tasksLabel, agentLabel, gardenLabel] of [
      ['de', 'Aufgaben', 'Agent', 'Pflege'],
      ['en', 'Tasks', 'Agent', 'Care'],
    ] as const) {
      setLanguage(language);
      installMock({
        'vault:status': () => READY_STATUS,
        'journal:list': () => [],
        'work:list': () => [],
      });

      const { container, unmount } = renderRail('/dashboard');
      await screen.findAllByRole('button', { name: /./ }); // wait for the first render pass

      const items = Array.from(container.querySelectorAll('.sb-rail-item'));
      const labels = items.map((item) => item.querySelector('span')?.textContent ?? '');
      const tasksIndex = labels.indexOf(tasksLabel);
      const agentIndex = labels.indexOf(agentLabel);
      const gardenIndex = labels.indexOf(gardenLabel);

      expect(tasksIndex, `${language}: tasks entry not found`).toBeGreaterThanOrEqual(0);
      /* The agent action sits between tasks and maintenance (rail agent entry). */
      expect(agentIndex, `${language}: agent must sit right after tasks`).toBe(tasksIndex + 1);
      expect(gardenIndex, `${language}: maintenance must follow the agent entry`).toBe(
        tasksIndex + 2,
      );

      /* D1 has no task data source yet — the badge lookup must read 0, not
         a second hardcoded branch that happens to always render nothing. */
      expect(items[tasksIndex]?.querySelector('.sb-rail-count')).toBeNull();

      unmount();
    }
  });

  /* 072 review, finding 2: the visible `Badge` next to the tasks entry is
     `aria-hidden` (it duplicates the accessible name below it), so a
     screen-reader user only ever learns the running+waiting count from the
     rail item's own `aria-label` — the same sentence mechanism the journal
     entry already had, generalized to the one other screen that now carries
     a live count instead of staying a `journal`-only special case. */
  it("speaks the tasks entry's running+waiting count to assistive tech, and stays silent about it at zero", async () => {
    setLanguage('en');
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      'work:list': () => [
        {
          id: 'a',
          kind: 'ingest',
          lane: 'free',
          subject: { label: 'A', ref: null },
          state: 'running',
          progress: 0.5,
          message: null,
          error: null,
          queuePosition: null,
          queuedAt: '2026-08-10T09:00:00.000Z',
          startedAt: '2026-08-10T09:00:00.000Z',
          finishedAt: null,
          hasResult: false,
          detail: null,
          retryable: true,
        },
        {
          id: 'b',
          kind: 'ingest',
          lane: 'free',
          subject: { label: 'B', ref: null },
          state: 'queued',
          progress: 0,
          message: null,
          error: null,
          queuePosition: 1,
          queuedAt: '2026-08-10T09:00:00.000Z',
          startedAt: null,
          finishedAt: null,
          hasResult: false,
          detail: null,
          retryable: true,
        },
      ],
    });

    renderRail('/dashboard');

    const tasksLink = await screen.findByRole('link', { name: /Tasks, 2 running or waiting/ });
    expect(tasksLink).toBeTruthy();
    // The visible pill stays a decoration — the sentence above is the one
    // and only place the count reaches assistive tech.
    expect(tasksLink.querySelector('.sb-rail-count')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the tasks entry its plain label, not a false "0 running" claim, when nothing is in flight', async () => {
    setLanguage('en');
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      'work:list': () => [],
    });

    renderRail('/dashboard');

    expect(await screen.findByRole('link', { name: 'Tasks' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /running or waiting/ })).toBeNull();
  });

  it('opens plain Claude in the vault, without a first prompt, from the agent entry', async () => {
    setLanguage('en');
    const launches: unknown[] = [];
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      'work:list': () => [],
      'agent:launchTerminal': (request) => {
        launches.push(request);
        return { ok: true, terminal: 'windows-terminal' };
      },
    });

    renderRail('/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: 'Agent' }));

    await waitFor(() => expect(launches).toEqual([undefined]));
    await waitFor(() =>
      expect(toastSnapshot()).toEqual([
        expect.objectContaining({
          kind: 'success',
          message: 'rail.agent.opened.windows-terminal',
        }),
      ]),
    );
  });

  it('says why Claude was not opened and leads to the agent settings', async () => {
    setLanguage('en');
    installMock({
      'vault:status': () => READY_STATUS,
      'journal:list': () => [],
      'work:list': () => [],
      'agent:launchTerminal': () => ({ ok: false, reason: 'setup-missing' }),
    });

    renderRail('/dashboard');
    fireEvent.click(await screen.findByRole('button', { name: 'Agent' }));

    await waitFor(() =>
      expect(toastSnapshot()).toEqual([
        expect.objectContaining({
          kind: 'warn',
          message: 'rail.agent.refused',
          description: 'rail.agent.reason.setup-missing',
          action: expect.objectContaining({ label: 'rail.agent.settings' }),
        }),
      ]),
    );
  });
});
