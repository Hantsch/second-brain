// @vitest-environment jsdom
/* Onboarding, D3 of story 031: the language choice above the header, and the
 * honest "no model configured" statement below the vault actions — both live
 * before any vault is open.
 *
 * The bridge here is a small state machine, like `tests/renderer/settings.test.tsx`
 * uses for its language tests: `settings:setApp` really writes the patch, so the
 * response fed back into the query cache is the same mechanism `LanguagesTab`
 * relies on to switch the UI language without a reload. Vault status starts
 * with `root: null` — the one condition under which `App` renders `OnboardingScreen`
 * at all — and `vault.settings` stays `null`, mirroring the real shape before any
 * vault has been opened (provider/routing configuration travels with the vault,
 * so there is architecturally nothing to configure yet).
 *
 * No network, no filesystem.
 */

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsSnapshot, VaultStatus } from '@shared/types';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
import { settingsSnapshot } from '@renderer/lib/mock-settings';
import { setLanguage } from '@renderer/i18n';

interface State {
  status: VaultStatus;
  snapshot: SettingsSnapshot;
}

let state: State;

/** Bridge with state: `settings:setApp` really writes the patch, everything
    else falls through to the shared mock bridge's fixtures. */
const invoke = vi.fn(async (channel: string, payload?: unknown): Promise<unknown> => {
  switch (channel) {
    case 'vault:status':
      return state.status;
    case 'vault:recent':
      return [{ path: 'C:/vaults/demo', name: 'Demo-Vault', exists: true }];
    case 'vault:choose':
      /* A cancelled folder dialog — the screen must not treat this as an error. */
      return null;
    case 'vault:create': {
      const { name } = payload as { path: string; name: string };
      state.status = { ...state.status, root: 'C:/vaults/new', name, ready: true };
      return state.status;
    }
    case 'settings:get':
      return state.snapshot;
    case 'settings:setApp': {
      const { patch } = payload as { patch: Partial<SettingsSnapshot['app']> };
      state.snapshot = {
        ...state.snapshot,
        app: {
          ...state.snapshot.app,
          ...patch,
          newVaultLanguages: {
            ...state.snapshot.app.newVaultLanguages,
            ...patch.newVaultLanguages,
          },
        },
      };
      return state.snapshot;
    }
    default:
      return (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(channel, payload);
  }
});

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = '#/dashboard';
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  invoke.mockClear();
  state = {
    status: {
      root: null,
      name: null,
      ready: false,
      docCount: 0,
      indexedAt: null,
      indexing: false,
      indexRefreshFailedAt: null,
    },
    snapshot: {
      ...(JSON.parse(JSON.stringify(settingsSnapshot)) as SettingsSnapshot),
      vault: null,
    },
  };
  state.snapshot.app.uiLanguage = 'de';
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
});

afterEach(() => {
  delete window.sb;
});

describe('Onboarding: Sprachwahl', () => {
  it('rendert Deutsch/English und schreibt die Wahl über settings:setApp', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' });

    const group = screen.getByRole('group', { name: 'Sprache' });
    expect(within(group).getByRole('button', { name: 'Deutsch' })).toBeTruthy();
    const english = within(group).getByRole('button', { name: 'English' });

    await userEvent.click(english);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: { uiLanguage: 'en', newVaultLanguages: { documents: 'en', conversation: 'en' } },
      }),
    );
  });

  it('wechselt die eigenen Texte sofort, ohne Neustart', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' });

    const group = screen.getByRole('group', { name: 'Sprache' });
    await userEvent.click(within(group).getByRole('button', { name: 'English' }));

    /* Same screen, same mount — just the language switched under it. */
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open a vault' })).toBeTruthy();
  });

  it('lässt unter "Erweitert" Dokument- und Gesprächssprache sowie Übersetzung einzeln setzen', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' });

    await userEvent.click(screen.getByRole('button', { name: 'Erweitert' }));

    const documents = screen.getByLabelText('Dokumentsprache');
    await userEvent.selectOptions(documents, 'English');
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: { newVaultLanguages: { documents: 'en' } },
      }),
    );

    const translate = screen.getByRole('switch', { name: /Fremdsprachige Quellen/ });
    expect(translate).toHaveProperty('checked', true);
    await userEvent.click(translate);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: { newVaultLanguages: { translateSources: false } },
      }),
    );

    /* The simple choice above stays untouched — it still writes all three at once. */
    expect(invoke).not.toHaveBeenCalledWith('settings:setApp', {
      patch: { uiLanguage: 'en', newVaultLanguages: { documents: 'en', conversation: 'en' } },
    });
  });
});

describe('Onboarding: kein Modell', () => {
  it('sagt ehrlich, dass kein Modell konfiguriert ist', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' });

    expect(await screen.findByText(/kein Modell eingerichtet/)).toBeTruthy();
  });

  it('sagt es auch auf Englisch, nach dem Sprachwechsel', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' });
    const group = screen.getByRole('group', { name: 'Sprache' });
    await userEvent.click(within(group).getByRole('button', { name: 'English' }));

    expect(await screen.findByText(/No model is configured/)).toBeTruthy();
  });
});

describe('Onboarding: Vault-Aktionen bleiben unverändert', () => {
  it('öffnen, anlegen und zuletzt geöffnet funktionieren weiter', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' });

    /* Open. */
    await userEvent.click(screen.getByRole('button', { name: 'Vault öffnen' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('vault:choose', undefined));

    /* Recent. */
    expect(screen.getByText('C:/vaults/demo')).toBeTruthy();

    /* Create. */
    await userEvent.click(screen.getByRole('button', { name: 'Neuen Vault anlegen' }));
    await userEvent.type(screen.getByLabelText('Name des neuen Vaults'), 'Mein Wissen');
    await userEvent.click(screen.getByRole('button', { name: 'Ordner wählen und anlegen' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('vault:create', { path: '', name: 'Mein Wissen' }),
    );
  });
});
