// @vitest-environment jsdom
/* LlamaEngineDetails (034, D4 + D5): the derived start plan with one
 * sentence per value, its warnings, the stop button, the foreign-engine
 * notice, and (D5) the advanced overrides. Rendered standalone (no `App`, no
 * `LocalRuntimeCard`) — the component needs nothing but a query client and
 * `window.sb`, mirroring `llamacpp-model-panel.test.tsx`'s setup.
 *
 * Covered: no-model state (nothing shown for the plan), all three derived
 * value sentences, the slow-floor-context warning, running+owned (stop
 * enabled), running+foreign (stop disabled, foreign sentence shown),
 * pressing stop calling the mutation, and (D5) entering/clearing the
 * GPU-layers override — `llm:setLlamaOverrides` returns the fresh plan
 * directly, so the readout flips to the manual wording without a second
 * `llm:llamaStartPlan` call.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppSettings,
  LlamaOverrides,
  LlamaStartPlan,
  LocalRuntimeStatus,
} from '@shared/types';
import { LlamaEngineDetails } from '@renderer/screens/settings/LlamaEngineDetails';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

let engineStatusImpl: () => {
  status: LocalRuntimeStatus;
  ownedByApp: boolean;
  port: number | null;
};
let planImpl: () => LlamaStartPlan | null;
let stopImpl: () => Promise<{ stopped: boolean }>;
let setOverridesImpl: (patch: Partial<LlamaOverrides>) => LlamaStartPlan | null;
/* 034, D6: the auto-start toggle reads `AppSettings.machine.llamaAutoStart`
   off the plain settings snapshot — `'manual'` by default, exactly the value
   the setting itself defaults to, so a test that never touches this still
   renders the toggle in its off state. */
let autoStartMode: 'manual' | 'on-demand';

const invoke = vi.fn(async (channel: string, payload?: unknown): Promise<unknown> => {
  switch (channel) {
    case 'llm:llamaEngineStatus':
      return engineStatusImpl();
    case 'llm:llamaStartPlan':
      return planImpl();
    case 'llm:stopLlamaEngine':
      return stopImpl();
    case 'llm:setLlamaOverrides':
      return setOverridesImpl(payload as Partial<LlamaOverrides>);
    case 'settings:get':
      return {
        app: { machine: { llamaAutoStart: autoStartMode } } as Partial<AppSettings>,
        vault: null,
      };
    case 'llm:setLlamaAutoStart':
      autoStartMode = payload as 'manual' | 'on-demand';
      return undefined;
    default:
      throw new Error(`unexpected channel in this test: ${channel}`);
  }
});

const DERIVED_PLAN: LlamaStartPlan = {
  gpuLayers: { value: 28, source: 'derived', reason: 'vram-fit:28/33' },
  contextTokens: { value: 8192, source: 'derived', reason: 'context-fits:8192' },
  threads: { value: 6, source: 'derived', reason: 'threads-budget:6/12' },
  warnings: [],
  argv: [],
};

function renderDetails() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LlamaEngineDetails />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
  invoke.mockClear();
  engineStatusImpl = () => ({ status: 'installed-stopped', ownedByApp: false, port: null });
  planImpl = () => null;
  stopImpl = async () => ({ stopped: true });
  setOverridesImpl = () => null;
  autoStartMode = 'manual';
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
});

afterEach(() => {
  delete window.sb;
});

/* 034, D6: the auto-start toggle — off by default, and flipping it writes
 * `'on-demand'` through the dedicated channel. */
describe('LlamaEngineDetails: Autostart', () => {
  it('rendert den Schalter standardmäßig aus', async () => {
    renderDetails();

    const toggle = (await screen.findByRole('switch', {
      name: /Automatisch starten/,
    })) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('ruft beim Einschalten die Mutation mit "on-demand" auf', async () => {
    renderDetails();

    const toggle = await screen.findByRole('switch', { name: /Automatisch starten/ });
    await userEvent.click(toggle);

    expect(invoke).toHaveBeenCalledWith('llm:setLlamaAutoStart', 'on-demand');
  });
});

describe('LlamaEngineDetails: Plan', () => {
  it('zeigt nichts an, solange kein Modell installiert ist', async () => {
    renderDetails();

    // The "advanced" disclosure is always there; the plan rows are not.
    await screen.findByText('Erweitert');
    expect(screen.queryByText(/Layern/)).toBeNull();
    expect(screen.queryByText(/Kontext:/)).toBeNull();
    expect(screen.queryByText(/Threads/)).toBeNull();
  });

  it('zeigt alle drei abgeleiteten Werte mit ihrem Satz', async () => {
    planImpl = () => DERIVED_PLAN;
    renderDetails();

    expect(await screen.findByText(/28 von 33 Layern laufen auf der GPU/)).toBeTruthy();
    expect(await screen.findByText(/Kontext: 8192 Tokens/)).toBeTruthy();
    expect(await screen.findByText(/6 von 12 CPU-Threads/)).toBeTruthy();
  });

  it('zeigt die slow-floor-context-Warnung', async () => {
    planImpl = () => ({
      ...DERIVED_PLAN,
      contextTokens: { value: 2048, source: 'floor', reason: 'context-floor:2048' },
      warnings: ['slow-floor-context'],
    });
    renderDetails();

    expect(
      await screen.findByText(
        'Läuft auf der CPU mit einem Kontext von 2048 Tokens — Antworten brauchen auf diesem Rechner mehrere Minuten.',
      ),
    ).toBeTruthy();
  });
});

describe('LlamaEngineDetails: Stopp', () => {
  it('zeigt einen aktivierten Stopp-Button, wenn die App die Engine selbst gestartet hat', async () => {
    engineStatusImpl = () => ({ status: 'running', ownedByApp: true, port: 11435 });
    renderDetails();

    const stopButton = (await screen.findByRole('button', {
      name: 'Jetzt stoppen',
    })) as HTMLButtonElement;
    expect(stopButton.disabled).toBe(false);
    expect(screen.queryByText(/nicht gestartet/)).toBeNull();
  });

  it('deaktiviert den Stopp-Button für eine fremde Engine und nennt den Grund', async () => {
    engineStatusImpl = () => ({ status: 'running', ownedByApp: false, port: 11435 });
    renderDetails();

    const stopButton = (await screen.findByRole('button', {
      name: 'Jetzt stoppen',
    })) as HTMLButtonElement;
    expect(stopButton.disabled).toBe(true);
    expect(
      await screen.findByText(
        'Diese App hat diese Engine nicht gestartet, daher kann sie von hier aus nicht gestoppt werden.',
      ),
    ).toBeTruthy();
  });

  it('ruft beim Klick die Stop-Mutation auf', async () => {
    engineStatusImpl = () => ({ status: 'running', ownedByApp: true, port: 11435 });
    renderDetails();

    await userEvent.click(await screen.findByRole('button', { name: 'Jetzt stoppen' }));

    expect(invoke).toHaveBeenCalledWith('llm:stopLlamaEngine', undefined);
  });
});

/* 034, D5: the advanced overrides. Only `gpuLayers` is exercised here —
 * `contextTokens` goes through the exact same `OverrideField` component with
 * the same commit/clear logic, differing only in which key of
 * `Partial<LlamaOverrides>` is sent, so a second, byte-for-byte identical
 * suite would not catch anything this one doesn't already. */
describe('LlamaEngineDetails: erweiterte Overrides', () => {
  const MANUAL_PLAN: LlamaStartPlan = {
    ...DERIVED_PLAN,
    gpuLayers: { value: 5, source: 'manual', reason: 'manual:5/33' },
  };

  it('sendet den eingegebenen Wert an die Override-Mutation und zeigt danach „von Hand gesetzt“', async () => {
    planImpl = () => DERIVED_PLAN;
    setOverridesImpl = (patch) => {
      expect(patch).toEqual({ gpuLayers: 5 });
      return MANUAL_PLAN;
    };
    renderDetails();

    const field = await screen.findByLabelText('GPU-Layer');
    await userEvent.type(field, '5');
    await userEvent.tab();

    expect(invoke).toHaveBeenCalledWith('llm:setLlamaOverrides', { gpuLayers: 5 });
    expect(await screen.findByText(/von Hand gesetzt/)).toBeTruthy();
  });

  it('kehrt nach dem Zurücksetzen zum abgeleiteten Wert zurück', async () => {
    planImpl = () => MANUAL_PLAN;
    setOverridesImpl = (patch) => {
      expect(patch).toEqual({ gpuLayers: null });
      return DERIVED_PLAN;
    };
    renderDetails();

    await screen.findByText(/von Hand gesetzt/);
    await userEvent.click(await screen.findByRole('button', { name: 'Zurücksetzen' }));

    expect(invoke).toHaveBeenCalledWith('llm:setLlamaOverrides', { gpuLayers: null });
    expect(await screen.findByText(/28 von 33 Layern laufen auf der GPU/)).toBeTruthy();
    expect(screen.queryByText(/von Hand gesetzt/)).toBeNull();
  });

  it('lehnt eine negative Eingabe ab, ohne die Mutation aufzurufen', async () => {
    planImpl = () => DERIVED_PLAN;
    renderDetails();

    const field = await screen.findByLabelText('GPU-Layer');
    await userEvent.type(field, '-1');
    await userEvent.tab();

    expect(await screen.findByText('Mindestens 0 eingeben.')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith('llm:setLlamaOverrides', expect.anything());
  });
});
