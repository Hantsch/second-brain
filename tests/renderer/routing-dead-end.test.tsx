// @vitest-environment jsdom
/* 067, D2: a `pick === null` recommendation row must not be a dead end
 * (AC1). Every reason key ends the same way — reason sentence, pointer
 * sentence, "Assign manually" button — and the button really moves focus to
 * the matching row's select in the routing table above, not just claim to.
 * A row with a pick stays exactly as it was: no pointer, no button.
 *
 * German throughout, matching `settings.test.tsx`'s convention — the mock
 * bridge's settings snapshot ships `uiLanguage: 'de'`, so that is what the
 * app actually renders on mount without an extra language switch.
 */

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig, RecommendationSet, Routing } from '@shared/types';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
import { tasks as TASKS } from '@renderer/lib/mock-settings';
import { setLanguage } from '@renderer/i18n';

function ollama(): ProviderConfig {
  return {
    id: 'ollama-1',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: ['llama3.1:8b'],
    probe: { ok: true, at: '2026-08-10T12:00:00.000Z', latencyMs: 42, modelCount: 1 },
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

/* Two rows: one without a pick (a non-sensitivity reason, per the story's
   Decisions — the dead end looks identical for `no-reachable-model` and
   `beyond-this-machine`), one with a real, acceptable pick. */
const RECOMMENDATION: RecommendationSet = {
  catalogueGeneratedAt: '2026-08-10T00:00:00.000Z',
  catalogueStale: false,
  tasks: [
    {
      task: 'classify-dump',
      pick: null,
      reasonKey: 'no-reachable-model',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
      shortfall: null,
    },
    {
      task: 'title-tags',
      pick: { providerId: 'ollama-1', model: 'llama3.1:8b' },
      reasonKey: 'best-fit-for-task',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
      shortfall: null,
    },
  ],
};

let routing: Routing;

const invoke = vi.fn(async (channel: string, payload?: unknown): Promise<unknown> => {
  switch (channel) {
    case 'llm:providers':
      return [ollama()];
    case 'llm:tasks':
      return TASKS;
    case 'llm:routing':
      return routing;
    case 'llm:setRoute': {
      const { task, ref } = payload as { task: string; ref: unknown };
      routing = { ...routing, tasks: { ...routing.tasks, [task]: ref } };
      return routing;
    }
    case 'llm:recommendModels':
      return RECOMMENDATION;
    default:
      return (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(channel, payload);
  }
});

function renderAt(hash: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.location.hash = hash;
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

async function openModelsTab() {
  const rendered = renderAt('#/settings?tab=models');
  await screen.findByRole('heading', { level: 1, name: 'Einstellungen' });
  return rendered;
}

async function fetchRecommendations() {
  await openModelsTab();
  await screen.findByRole('table');
  await userEvent.click(screen.getByRole('button', { name: 'Empfehlungen holen' }));
  return screen.findAllByRole('listitem');
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  invoke.mockClear();
  routing = { tasks: {}, defaults: {} };
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
});

describe('Einstellungen: Aufgaben-Routing, die Sackgassen-Empfehlungszeile', () => {
  it('a no-pick row shows the reason and a way out', async () => {
    await fetchRecommendations();

    // The no-pick row: reason sentence, pointer sentence, and a real button.
    expect(
      screen.getByText('Kein Modell, das du derzeit erreichen kannst, passt zu dieser Aufgabe.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Weise ein Modell direkt in der Aufgaben-Routing-Tabelle oben zu.'),
    ).toBeTruthy();
    const assignButton = screen.getByRole('button', {
      name: 'Modell für Dump einordnen manuell zuordnen',
    });
    expect(assignButton).toBeTruthy();

    // The row with a pick is unchanged: no pointer, no manual-assign button.
    expect(
      screen.queryByRole('button', { name: /Modell für Titel und Tags manuell zuordnen/ }),
    ).toBeNull();
    // Only the one pointer sentence exists — proves it isn't rendered for
    // the picked row too, just hidden by some other assertion's scope.
    expect(
      screen.getAllByText('Weise ein Modell direkt in der Aufgaben-Routing-Tabelle oben zu.')
        .length,
    ).toBe(1);

    const select = screen.getByRole('combobox', {
      name: 'Modell für Dump einordnen',
    }) as HTMLSelectElement;
    expect(select).not.toBe(document.activeElement);

    await userEvent.click(assignButton);

    // Clicking "Manuell zuordnen" moves focus to that task's own routing
    // select — the real, clickable way out the story asks for, not just a
    // sentence with nothing behind it.
    await waitFor(() => expect(document.activeElement).toBe(select));
  });
});
