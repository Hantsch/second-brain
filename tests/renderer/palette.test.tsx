// @vitest-environment jsdom
/* Command palette search hits (story 005, D10): an area note has a real home
 * in-app — a hit under `areas/` navigates to the Notes screen with its section
 * open, instead of leaving the app. Every other hit keeps opening in the
 * default editor, exactly as before; that guarantee is worth its own test
 * since the branch sits in a hot path every search hit runs through.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { SearchHit } from '@shared/types';
import { CommandPalette } from '@renderer/components/CommandPalette';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

/* Own mock instead of the shared one from `tests/setup.ts`: a test under
   `tests/renderer/` only sees `src/renderer`, `src/shared` and itself
   (tsconfig.web) — the same reason `ask.test.tsx` and `notes.test.tsx` each
   carry their own. */
type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Mock {
  calls: { channel: IpcChannel; payload: unknown }[];
  payloadOf(channel: IpcChannel): unknown;
}

function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return {
    calls,
    payloadOf: (channel) => calls.find((entry) => entry.channel === channel)?.payload,
  };
}

const NOW = '2026-08-10T14:32:00+02:00';

const areaHit: SearchHit = {
  path: 'areas/gesundheit.md',
  title: 'Gesundheit',
  docType: 'area',
  module: null,
  score: 0.9,
  snippet: 'Zwei Wochen **Schlafprotokoll**: vor Mitternacht ins Bett wirkt mehr.',
  updated: NOW,
  tags: [],
};

const projectHit: SearchHit = {
  path: 'projects/work/nyota-auth0-migration/project.md',
  title: 'Nyota Auth0 Migration',
  docType: 'project',
  module: null,
  score: 0.8,
  snippet: 'Rollenkonzept liegt bei Stefan zur Freigabe.',
  updated: NOW,
  tags: [],
};

/* Reads the address the palette navigated to — the assertion cares about the
   route, not about which screen happens to render there. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPalette(handlers: Handlers, onClose: () => void) {
  const sb = installMock(handlers);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <CommandPalette onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { sb, ...rendered };
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

afterEach(() => {
  delete window.sb;
});

describe('Befehlspalette: Treffer aus der Suche', () => {
  it('navigiert bei einem Bereichs-Treffer auf die Notizen, statt die Datei zu öffnen', async () => {
    const onClose = vi.fn();
    const { sb } = renderPalette({ 'search:query': () => [areaHit] }, onClose);

    await userEvent.type(screen.getByRole('textbox'), 'Schlafprotokoll');
    const hit = await screen.findByRole('button', { name: /Gesundheit/ });
    await userEvent.click(hit);

    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/notes?a=gesundheit'),
    );
    /* The whole point of routing in-app: the external editor is not asked. */
    expect(sb.calls.some((call) => call.channel === 'shell:openPath')).toBe(false);
  });

  it('öffnet einen Treffer außerhalb von areas/ weiterhin im externen Editor', async () => {
    const onClose = vi.fn();
    const { sb } = renderPalette({ 'search:query': () => [projectHit] }, onClose);

    await userEvent.type(screen.getByRole('textbox'), 'Rollenkonzept');
    const hit = await screen.findByRole('button', { name: /Nyota Auth0 Migration/ });
    await userEvent.click(hit);

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(sb.payloadOf('shell:openPath')).toEqual({ path: projectHit.path }));
    /* No navigation away from wherever the palette was opened. */
    expect(screen.getByTestId('location').textContent).toBe('/dashboard');
  });
});
