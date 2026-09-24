// @vitest-environment jsdom
/* Der Einstellungs-Screen: hier macht der Nutzer die App scharf.
 *
 * Geprüft wird, was ihm dabei nicht passieren darf: eine Aufgabe, die in der
 * Tabelle fehlt; eine Auswahl, die nichts setzt; ein Vorschlag, der ohne
 * Zustimmung geschrieben wird; eine Sprachumstellung, die einen Neustart
 * verlangt. Dazu der Zustand, in dem er den Screen zuerst sieht — ohne jeden
 * Provider.
 *
 * Die Brücke ist eine Attrappe mit Zustand: `llm:setRoute` verändert das
 * Routing wirklich, `llm:suggestRouting` benutzt den echten Vorschlag aus
 * `core/llm`. Kein Netz, kein Dateisystem.
 */

import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionMigrationEntry } from '@shared/ipc';
import type {
  EngineBuildId,
  LocalRuntimeStatus,
  ModelRef,
  ProviderConfig,
  RecommendationSet,
  Routing,
  RuntimeId,
  SettingsSnapshot,
  TaskKind,
} from '@shared/types';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import {
  mockBridge,
  resetVramOverrideMock,
  seedMockScanned,
  setMockDetectedVramMb,
} from '@renderer/lib/mock-bridge';
import { settingsSnapshot, tasks as TASKS } from '@renderer/lib/mock-settings';
import { setLanguage } from '@renderer/i18n';
import { appendPull, clearPull } from '@renderer/lib/pullStore';

/* Der Aufgabenkatalog des Vertrags (`TaskKind` in src/shared/types/llm.ts). Der
   Renderer darf `src/core` nicht importieren, deshalb steht die Liste hier — und
   wird gegen die Fixtures der Mock-Brücke gehalten, damit sie nicht auseinanderläuft. */
const TASK_KINDS: readonly TaskKind[] = [
  'classify-dump',
  'title-tags',
  'extract-tasks',
  'summarize-source',
  'wiki-ingest',
  'query-answer',
  'query-rerank',
  'journal-chat',
  'project-status',
  'gardener-audit',
];

const MODELS = ['llama3.1:8b', 'qwen2.5:32b'];

function ollama(models: string[] = MODELS): ProviderConfig {
  return {
    id: 'ollama-1',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models,
    probe: { ok: true, at: '2026-08-10T12:00:00.000Z', latencyMs: 42, modelCount: models.length },
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

interface State {
  providers: ProviderConfig[];
  routing: Routing;
  snapshot: SettingsSnapshot;
  detected: { running: boolean; models: string[] };
  runtimeStatus: LocalRuntimeStatus;
  /* 033, D10: llama.cpp's own card reads its status independently of
     Ollama's — a separate field is what proves the two cards' queries don't
     collide, rather than both happening to read the same fixture. */
  llamaCppRuntimeStatus: LocalRuntimeStatus;
  /* 024 D8: what `vault:sectionPlan` currently finds for the tab's
     document-language plan — empty by default so the existing language
     tests see no card. */
  sectionPlanEntries: SectionMigrationEntry[];
  /* 032 D4: overrides the mock bridge's default recommendation fixture when
     set — lets a single test exercise a `beyond-this-machine` row without
     touching the shared fixture every other recommendation test relies on. */
  recommendation: RecommendationSet | null;
}

let state: State;

/* `event:install-progress` listeners registered via `bridge().on(...)` — a
   real map instead of the earlier no-op stub, so the llama.cpp install
   dialog's "done" event can actually be fired (033 review finding 3), the
   same pattern `sources.test.tsx`/`ask.test.tsx` use for their own events. */
let listeners: Map<string, Set<(payload: never) => void>>;

function emitEvent(event: string, payload: unknown): void {
  act(() => {
    for (const callback of listeners.get(event) ?? []) {
      (callback as (value: unknown) => void)(payload);
    }
  });
}

/** Brücke mit Zustand: Schreibvorgänge wirken, alles Übrige kommt aus den Fixtures. */
const invoke = vi.fn(async (channel: string, payload?: unknown): Promise<unknown> => {
  switch (channel) {
    case 'llm:providers':
      return state.providers;
    case 'llm:tasks':
      return TASKS;
    case 'llm:routing':
      return state.routing;
    case 'llm:setRoute': {
      const { task, ref } = payload as { task: keyof Routing['tasks']; ref: ModelRef | null };
      const tasks = { ...state.routing.tasks };
      if (ref) tasks[task] = ref;
      else delete tasks[task];
      state.routing = { ...state.routing, tasks };
      return state.routing;
    }
    case 'llm:setDefault': {
      const { tier, ref } = payload as { tier: keyof Routing['defaults']; ref: ModelRef | null };
      const defaults = { ...state.routing.defaults };
      if (ref) defaults[tier] = ref;
      else delete defaults[tier];
      state.routing = { ...state.routing, defaults };
      return state.routing;
    }
    /* Der Zugang antwortet und hat Modelle — genau der Fall, nach dem der Tab
       einen Routing-Vorschlag holen soll. */
    case 'llm:probe':
      return state.providers[0] ?? ollama();
    case 'llm:suggestRouting': {
      /* Genügt für die Vorschau: der Kern-Vorschlag ist in tests/core geprüft. */
      const provider = state.providers[0];
      const model = provider?.models[0];
      if (!provider || !model) return { tasks: {}, defaults: {} } satisfies Routing;
      const ref: ModelRef = { providerId: provider.id, model };
      const suggested: Routing = { tasks: {}, defaults: { balanced: ref } };
      for (const kind of TASK_KINDS) suggested.tasks[kind] = ref;
      return suggested;
    }
    case 'llm:recommendModels':
      if (state.recommendation) return state.recommendation;
      return (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(channel, payload);
    case 'llm:localRuntimeStatus': {
      const { runtime } = payload as { runtime: RuntimeId };
      return {
        runtime,
        status: runtime === 'llamacpp' ? state.llamaCppRuntimeStatus : state.runtimeStatus,
      };
    }
    /* llama.cpp's own plan, real enough to open its install dialog and
       exercise the build select (033, D10) — Ollama's plan keeps falling
       through to the honest "blocked" mock bridge default below. */
    case 'llm:runtimeInstallPlan': {
      const { runtime, buildId } = payload as { runtime: RuntimeId; buildId?: EngineBuildId };
      if (runtime !== 'llamacpp') {
        return (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(
          channel,
          payload,
        );
      }
      const build = buildId ?? 'cuda';
      const downloadMbByBuild: Record<EngineBuildId, number> = {
        cuda: 4200,
        vulkan: 1200,
        cpu: 800,
        macos: 900,
      };
      /* The `cpu` build is the one this fixture treats as "no longer fits" —
         exercising the case where changing the build select replans into a
         blocked plan (033 review finding 2) without needing a second disk
         fixture just for this. */
      const blocked = build === 'cpu';
      return {
        runtime,
        canInstall: !blocked,
        blockedReason: blocked ? 'insufficient-disk' : null,
        downloadMb: downloadMbByBuild[build],
        installerPath: 'C:/Users/demo/AppData/Roaming/Gaston/runtimes/llamacpp',
        modelDirHint: 'C:/Users/demo/AppData/Roaming/Gaston/models/gguf',
        build: {
          id: build,
          reason: {
            kind: 'gpu',
            gpuName: 'NVIDIA GeForce RTX 4070',
            confident: true,
            requestedBuild: 'cuda',
            actualBuild: 'cuda',
          },
          options: ['cuda', 'vulkan', 'cpu'],
        },
      };
    }
    /* Only llama.cpp: Ollama's download keeps falling through to the honest
       "browser mode can't install" mock bridge default below. */
    case 'llm:downloadRuntime': {
      const { runtime } = payload as { runtime: RuntimeId; buildId?: EngineBuildId };
      if (runtime !== 'llamacpp') {
        return (mockBridge.invoke as (c: string, p?: unknown) => Promise<unknown>)(
          channel,
          payload,
        );
      }
      return { downloadId: 'llamacpp-download-1' };
    }
    case 'llm:detectLocal':
      return [
        {
          presetId: 'ollama',
          label: 'Ollama',
          baseUrl: 'http://localhost:11434/v1',
          running: state.detected.running,
          models: state.detected.models,
          configured: false,
        },
      ];
    case 'llm:addProvider': {
      const input = payload as { label: string; baseUrl: string };
      const added = { ...ollama([]), label: input.label, baseUrl: input.baseUrl };
      state.providers = [...state.providers, added];
      return added;
    }
    case 'vault:sectionPlan': {
      const { to } = payload as { to: 'de' | 'en' };
      return { to, count: state.sectionPlanEntries.length, entries: state.sectionPlanEntries };
    }
    case 'vault:sectionMigrate': {
      const { entries } = payload as { to: 'de' | 'en'; entries: SectionMigrationEntry[] };
      const results = entries.map((entry) => ({
        path: entry.path,
        outcome: 'migrated' as const,
        renames: entry.renames.length,
        folds: entry.folds.length,
      }));
      /* The plan is empty once the migration ran against it — the same
         "recheck the reality" the real gateway (`vault:sectionPlan` re-read
         through the store) would find. */
      state.sectionPlanEntries = [];
      return { results, migrated: entries.length, conflicts: 0 };
    }
    case 'settings:get':
      return state.snapshot;
    case 'settings:setLanguages': {
      const next = payload as { ui?: 'de' | 'en'; documents?: 'de' | 'en' };
      const vault = state.snapshot.vault;
      state.snapshot = {
        app: { ...state.snapshot.app, uiLanguage: next.ui ?? state.snapshot.app.uiLanguage },
        vault: vault ? { ...vault, languages: { ...vault.languages, ...next } } : null,
      };
      return state.snapshot;
    }
    case 'settings:setApp': {
      const { patch } = payload as {
        patch: Partial<SettingsSnapshot['app']> & {
          customization?: Partial<SettingsSnapshot['app']['customization']>;
        };
      };
      state.snapshot = {
        ...state.snapshot,
        app: {
          ...state.snapshot.app,
          ...patch,
          customization: {
            ...state.snapshot.app.customization,
            ...patch.customization,
          },
        },
      };
      return state.snapshot;
    }
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

async function openTab(tab: string, heading = 'Einstellungen') {
  const rendered = renderAt(`#/settings?tab=${tab}`);
  await screen.findByRole('heading', { level: 1, name: heading });
  return rendered;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
  invoke.mockClear();
  resetVramOverrideMock();
  state = {
    providers: [ollama()],
    routing: { tasks: {}, defaults: {} },
    snapshot: JSON.parse(JSON.stringify(settingsSnapshot)) as SettingsSnapshot,
    detected: { running: false, models: [] },
    runtimeStatus: 'absent',
    llamaCppRuntimeStatus: 'absent',
    sectionPlanEntries: [],
    recommendation: null,
  };
  listeners = new Map();
  window.sb = {
    invoke,
    on: (event: string, callback: (payload: never) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(callback);
      listeners.set(event, set);
      return () => void set.delete(callback);
    },
    off: () => undefined,
  } as unknown as SbBridge;
});

afterEach(() => {
  delete window.sb;
});

describe('Einstellungen: Tabs', () => {
  it('führen in fünf Bereiche, Vault steht zuerst', async () => {
    await openTab('vault');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Vault',
      'Sprachen',
      'Modelle',
      'Verhalten',
      'Anpassung',
      'Info',
    ]);
    expect(screen.getByRole('tab', { name: 'Vault' }).getAttribute('aria-selected')).toBe('true');
    /* Die Kennzahlen des Index gehören in den Vault-Tab. */
    expect(await screen.findByText('Was im Vault steht')).toBeTruthy();
  });
});

describe('Einstellungen: Anpassung', () => {
  it('wählt Hintergrund und App-Symbol sofort aus', async () => {
    await openTab('customization');

    await userEvent.click(await screen.findByRole('radio', { name: 'Wissenskonstellation' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: {
          customization: { background: 'knowledge-constellation' },
        },
      }),
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Neuronaler Kern' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: {
          customization: { appIcon: 'neural-core' },
        },
      }),
    );
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openTab('customization');
    await screen.findByRole('radio', { name: 'Neuronaler Kern' });
    await expectNoViolations(container);
  });

  it('speichert beide Tray-Schalter auf App-Ebene', async () => {
    await openTab('customization');

    const closeToTray = await screen.findByRole('switch', {
      name: /^Beim Schließen des Fensters im Infobereich weiterlaufen/,
    });
    expect(
      screen.getByText(
        'Das Schließen des Fensters lässt Gaston im Infobereich weiterlaufen — die Tastenkombination, Erinnerungen und das Schnell-Erfassen bleiben aktiv.',
      ),
    ).toBeTruthy();
    await userEvent.click(closeToTray);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: { closeToTray: false },
      }),
    );

    const startMinimized = screen.getByRole('switch', { name: /^Im Infobereich starten/ });
    expect(
      screen.getByText('Gaston startet versteckt im Infobereich, statt das Fenster zu öffnen.'),
    ).toBeTruthy();
    await userEvent.click(startMinimized);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setApp', {
        patch: { startMinimized: true },
      }),
    );
  });
});

describe('Einstellungen: Aufgaben-Routing', () => {
  it('listet jede Aufgabe des Katalogs mit einem Auswahlfeld', async () => {
    await openTab('models');
    await screen.findByRole('table');

    /* Der Katalog, den der Kanal liefert, deckt jede Aufgabe des Vertrags ab. */
    expect(TASKS.map((task) => task.kind).sort()).toEqual([...TASK_KINDS].sort());
    const selects = screen.getAllByRole('combobox');
    /* Zehn Aufgaben plus drei Standard-Klassen. */
    expect(selects.length).toBe(TASK_KINDS.length + 3);
    expect(screen.getByRole('combobox', { name: 'Modell für Titel und Tags' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Modell für Tagebuch-Gespräch' })).toBeTruthy();
  });

  it('sagt ehrlich, wie viele Aufgaben ein Modell haben', async () => {
    await openTab('models');
    expect(
      await screen.findByText(`0 von ${TASK_KINDS.length} Aufgaben haben ein Modell.`),
    ).toBeTruthy();
    /* Was ohne Modell geht, steht in der Zeile der Aufgabe — nicht als
       Schachtelsatz über der Tabelle, den niemand liest. */
    expect(screen.getByText('Ohne Modell: Dump bleibt in der Inbox liegen')).toBeTruthy();
    expect(screen.getByText('Ohne Modell: Titel kommt aus der ersten Zeile')).toBeTruthy();
    expect(screen.queryByText(/Ohne Modell laufen:/)).toBeNull();
  });

  /* Ein Provider mit Modellen, aber keine Zuordnung: der Halbzustand, in dem die
     Inbox weiter „braucht ein Modell" sagt. Dann gehört das Teal dem Zuordnen. */
  it('macht „automatisch zuordnen" zum Fokuspunkt, solange keine Aufgabe ein Modell hat', async () => {
    await openTab('models');
    await screen.findByRole('table');

    expect(screen.getByText(/„Automatisch zuordnen“ schlägt zu jeder Aufgabe/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Automatisch zuordnen/ }).className).toContain(
      'gs-btn--primary',
    );
    expect(screen.getByRole('button', { name: /Provider hinzufügen/ }).className).toContain(
      'gs-btn--secondary',
    );
  });

  it('holt den Vorschlag von selbst, sobald ein Zugang antwortet', async () => {
    await openTab('models');
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: /Verbindung testen/ }));

    /* Die Vorschau steht da, geschrieben ist nichts — bestätigt wird von Hand. */
    const preview = await screen.findByRole('region', { name: 'Vorschlag' });
    expect(within(preview).getByRole('button', { name: /Übernehmen/ })).toBeTruthy();
    expect(invoke.mock.calls.some(([channel]) => channel === 'llm:setRoute')).toBe(false);
  });

  it('setzt die Route über die Auswahl', async () => {
    await openTab('models');
    const select = await screen.findByRole('combobox', { name: 'Modell für Titel und Tags' });

    await userEvent.selectOptions(select, `ollama-1|${MODELS[0]}`);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:setRoute', {
        task: 'title-tags',
        ref: { providerId: 'ollama-1', model: MODELS[0] },
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(`1 von ${TASK_KINDS.length} Aufgaben haben ein Modell.`),
      ).toBeTruthy(),
    );
  });

  /* In der Tabelle als kleine Marke, der ganze Satz im Titel: derselbe Satz
     zehnmal im Klartext machte jede Zeile 150 px hoch. */
  it('markiert vertrauliche Aufgaben mit einer Marke und dem Satz im Titel', async () => {
    await openTab('models');
    await screen.findByRole('table');
    const sensitive = TASKS.filter((task) => task.sensitive).length;
    const badges = screen.getAllByText('Persönlich');
    expect(badges.length).toBe(sensitive);
    expect(badges[0]?.getAttribute('title')).toBe(
      'Läuft über persönliche Inhalte — lokales Modell empfohlen.',
    );
  });

  it('zeigt den Vorschlag als Vorschau und übernimmt erst nach Bestätigung', async () => {
    await openTab('models');
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: /Automatisch zuordnen/ }));

    const preview = await screen.findByRole('region', { name: 'Vorschlag' });
    expect(within(preview).getByText(/Zuordnungen würden sich ändern/)).toBeTruthy();
    expect(within(preview).getAllByText('ohne Modell').length).toBeGreaterThan(0);
    /* Noch ist nichts geschrieben. */
    expect(invoke.mock.calls.some(([channel]) => channel === 'llm:setRoute')).toBe(false);

    await userEvent.click(within(preview).getByRole('button', { name: /Übernehmen/ }));

    await waitFor(() =>
      expect(invoke.mock.calls.filter(([channel]) => channel === 'llm:setRoute').length).toBe(
        TASK_KINDS.length,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Vorschlag' })).toBeNull());
    await waitFor(() => expect(screen.getByText('Jede Aufgabe hat ein Modell.')).toBeTruthy());
  });

  it('verwirft den Vorschlag, ohne etwas zu schreiben', async () => {
    await openTab('models');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /Automatisch zuordnen/ }));
    const preview = await screen.findByRole('region', { name: 'Vorschlag' });

    await userEvent.click(within(preview).getByRole('button', { name: 'Verwerfen' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Vorschlag' })).toBeNull());
    expect(invoke.mock.calls.some(([channel]) => channel === 'llm:setRoute')).toBe(false);
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openTab('models');
    await screen.findByRole('table');
    await expectNoViolations(container);
  });
});

describe('Einstellungen: Modellempfehlung', () => {
  /* `llm:recommendModels` fällt im obigen `invoke` durch zum Default-Zweig
     und damit auf die Attrappe (`mock-bridge.ts`) zurück — die liefert zehn
     realistische Zeilen, mit einer sensiblen Aufgabe ohne Treffer
     (`classify-dump`) und einer mit Treffer und Richtlinie (`journal-chat`).
     Die Attrappe nennt `openai`/`anthropic` als Provider-IDs — damit die
     Zeilen wirklich übernehmbar sind (nicht nur `ollama-1` aus dem globalen
     `beforeEach`), sind hier zusätzlich passende Provider konfiguriert;
     `wiki-ingest` bleibt bewusst ohne passenden Provider (Platzhalter
     `openai-compatible` aus `recommend.ts`s dokumentierter Abweichung für
     einen noch nicht eingerichteten Download). */
  beforeEach(() => {
    state.providers = [
      ollama(),
      { ...ollama(), id: 'anthropic', kind: 'anthropic', local: false, hasKey: true },
      { ...ollama(), id: 'openai', local: false, hasKey: true },
    ];
  });

  async function fetchRecommendations() {
    await openTab('models');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Empfehlungen holen' }));
    return screen.findAllByRole('listitem');
  }

  it('zeigt zu jeder der zehn Aufgaben Ziel, Begründung und – wo zutreffend – Kosten', async () => {
    const rows = await fetchRecommendations();
    expect(rows.length).toBe(TASK_KINDS.length);

    /* Kosten als Schätzung ausgewiesen, nie für ein lokales Modell. */
    expect(screen.getAllByText(/pro Lauf \(Schätzung\)/).length).toBeGreaterThan(0);
    /* Ein noch nicht installiertes, aber tragbares lokales Modell nennt den
       Namen des Ziels und den Download statt eines Kostenwerts. */
    expect(
      screen.getByText('openai-compatible / qwen2.5:32b — braucht einen Download von 18 GB'),
    ).toBeTruthy();
    /* Kein Provider für diesen Platzhalter eingerichtet — "Übernehmen" wäre
       ein Knopf, der nur fehlschlagen könnte. */
    expect(screen.getByText('Passenden Provider einrichten, um dies zu übernehmen.')).toBeTruthy();
    /* Die Kompromiss-Zeile erscheint nur, wenn Alternativen existieren, und
       nennt sie auch (statt nur "siehe Alternativen" zu behaupten). */
    expect(
      screen.getAllByText(/günstigere oder lokale Alternative.*llama3\.1:8b/).length,
    ).toBeGreaterThan(0);
  });

  it('nennt bei einem veralteten Katalog den Hinweis samt Datum', async () => {
    // Die Attrappe liefert `catalogueStale: true` mit `catalogueGeneratedAt: fx.NOW`
    // (2026-08-10) — der Hinweis muss beides sichtbar machen, nicht nur den
    // einen ohne den anderen.
    await fetchRecommendations();

    const note = screen.getByText(/Preise könnten veraltet sein/);
    expect(note.textContent).toContain('2026');
  });

  it('übernimmt eine einzelne Empfehlung über die Zeile', async () => {
    await fetchRecommendations();

    await userEvent.click(
      screen.getByRole('button', { name: 'Empfehlung für Titel und Tags übernehmen' }),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:setRoute', {
        task: 'title-tags',
        ref: { providerId: 'ollama-1', model: 'llama3.1:8b' },
      }),
    );
    expect(await screen.findByText('Übernommen')).toBeTruthy();
  });

  it('übernimmt jede Aufgabe mit erreichbarem, eingerichtetem Modell in einem Schritt', async () => {
    await fetchRecommendations();
    invoke.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Alle übernehmen' }));

    /* Sieben der zehn Aufgaben haben einen Treffer bei einem tatsächlich
       konfigurierten Provider — `classify-dump`/`project-status` bleiben
       ohne Modell, `wiki-ingest` nennt nur den Platzhalter eines noch nicht
       eingerichteten Downloads und wird deshalb übersprungen statt zu
       scheitern. */
    await waitFor(() =>
      expect(invoke.mock.calls.filter(([channel]) => channel === 'llm:setRoute').length).toBe(7),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      'llm:setRoute',
      expect.objectContaining({ task: 'wiki-ingest' }),
    );
  });

  /* 032 D4: a task whose minimum local size is beyond what this machine can
     carry gets no pick at all (`reasonKey: 'beyond-this-machine'`) — the row
     must say why in plain numbers and name the two honest options, and must
     never offer a button that could only write nonsense. `isAcceptable`
     already returns `false` for `pick: null`; this asserts that holds for a
     real shortfall row too, and that "accept all" still writes every other
     acceptable row while leaving this one untouched. */
  it('zeigt bei einer Aufgabe jenseits der Maschine die Zahlen und Optionen, aber keinen Übernehmen-Knopf', async () => {
    state.recommendation = {
      catalogueGeneratedAt: '2026-08-10T00:00:00.000Z',
      catalogueStale: false,
      tasks: [
        {
          task: 'classify-dump',
          pick: null,
          reasonKey: 'beyond-this-machine',
          tradeoffKey: null,
          costPerRun: null,
          policySource: null,
          policyReadAt: null,
          needsDownloadGb: null,
          alternatives: [],
          shortfall: { requiredParamsB: 32, machineParamsB: 8, cloudOptionAvailable: false },
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
    await openTab('models');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Empfehlungen holen' }));
    await screen.findAllByRole('listitem');

    expect(screen.getByText('Braucht mindestens 32 Mrd. Parameter.')).toBeTruthy();
    expect(screen.getByText('Diese Maschine trägt etwa 8 Mrd.')).toBeTruthy();
    expect(
      screen.getByText(
        'Auch dafür ist keine Cloud-Alternative eingerichtet — die Aufgabe bleibt ohne Modell.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Empfehlung für Dump einordnen übernehmen' }),
    ).toBeNull();

    invoke.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Alle übernehmen' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:setRoute', {
        task: 'title-tags',
        ref: { providerId: 'ollama-1', model: 'llama3.1:8b' },
      }),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      'llm:setRoute',
      expect.objectContaining({ task: 'classify-dump' }),
    );
  });

  it('verwirft die Empfehlung, ohne etwas zu schreiben', async () => {
    await fetchRecommendations();
    invoke.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(
      screen.queryByText('openai-compatible / qwen2.5:32b — braucht einen Download von 18 GB'),
    ).toBeNull();
    expect(invoke.mock.calls.some(([channel]) => channel === 'llm:setRoute')).toBe(false);
  });

  it('zeigt bei einer vertraulichen Aufgabe ohne Treffer die ehrliche Begründung statt einer Richtlinie', async () => {
    await fetchRecommendations();

    expect(
      screen.getByText(
        'Diese Aufgabe liest persönliche Inhalte, und kein erreichbares Modell erfüllt die Regel dafür — die Aufgabe bleibt ohne Modell.',
      ),
    ).toBeTruthy();
    /* Nur die vertrauliche Aufgabe mit Treffer (`journal-chat`) nennt eine
       Richtlinie — die ohne Treffer (`classify-dump`) tut es nicht. */
    expect(screen.getAllByText(/Richtlinie gelesen aus/).length).toBe(1);
  });

  it('hat keinen A11y-Verstoß', async () => {
    const rendered = await openTab('models');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Empfehlungen holen' }));
    await screen.findAllByRole('listitem');
    await expectNoViolations(rendered.container);
  });
});

describe('Einstellungen: ohne jeden Provider', () => {
  beforeEach(() => {
    state.providers = [];
  });

  it('nennt die drei Wege und leitet an, wenn nichts läuft', async () => {
    await openTab('models');
    expect(await screen.findByText('Noch kein Modell eingerichtet')).toBeTruthy();
    expect(screen.getByText('Lokal (Ollama)')).toBeTruthy();
    expect(screen.getByText(/API-Schlüssel/)).toBeTruthy();
    expect(screen.getByText('Ohne Modell weiterarbeiten')).toBeTruthy();
    expect(await screen.findByText('Kein lokales Modell gefunden.')).toBeTruthy();
    /* Kein Terminal-Befehl mehr — der geführte Weg lebt in der Karte
       „Lokale Laufzeit", auf die hier nur noch verwiesen wird. */
    expect(screen.queryByText('ollama pull llama3.1:8b')).toBeNull();
    expect(screen.getByRole('button', { name: /Zur Karte „Lokale Laufzeit“/ })).toBeTruthy();
    /* Die Tabelle bleibt trotzdem da: sie zeigt, was welche Aufgabe bräuchte. */
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('bietet eine gefundene lokale Runtime zur Übernahme an', async () => {
    state.detected = { running: true, models: ['llama3.1:8b', 'qwen2.5:32b', 'phi3:mini'] };
    await openTab('models');

    expect(
      await screen.findByText(
        'Ollama läuft auf diesem Rechner, 3 Modelle gefunden. Als lokalen Provider übernehmen?',
      ),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Als Provider übernehmen/ }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:addProvider', {
        label: 'Ollama',
        kind: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        local: true,
      }),
    );
  });

  it('hat auch im Einstiegszustand keinen A11y-Verstoß', async () => {
    const { container } = await openTab('models');
    await screen.findByText('Noch kein Modell eingerichtet');
    await expectNoViolations(container);
  });
});

/* Die Karte „Lokale Laufzeit" (019c D6): drei Zustände, ohne dass irgendetwas
   ohne Zustimmung passiert. `llm:runtimeInstallPlan`/`llm:startLocalRuntime`
   fallen unten im `invoke`-Switch durch zur echten Attrappe
   (`mock-bridge.ts`), die absichtlich ehrlich meldet: blockiert
   (`unsupported-platform`) bzw. nicht startbar (`spawn-failed`) — im
   Browser-Modus gibt es ja tatsächlich keine echte Laufzeit. */
describe('Einstellungen: Lokale Laufzeit', () => {
  it('bietet im Zustand „fehlt" das Holen an und nennt den Blockierungsgrund', async () => {
    state.runtimeStatus = 'absent';
    await openTab('models');

    /* Beide Karten sind ohne Zustand „fehlt" — llama.cpp defaults ebenso zu
       „absent" (033, D10), deshalb die Zwei statt eine Fundstelle. */
    expect(
      await screen.findAllByText('Auf diesem Rechner ist keine lokale Laufzeit installiert.'),
    ).toHaveLength(2);
    /* Ollamas Karte steht zuerst (`LOCAL_RUNTIMES`), also ihr „Jetzt holen". */
    await userEvent.click(screen.getAllByRole('button', { name: 'Jetzt holen' })[0] as HTMLElement);

    expect(
      await screen.findByText(/App-interne Installation deckt nur Windows und macOS ab/),
    ).toBeTruthy();
    /* Blockiert heißt: kein Download-Dialog wurde geöffnet. */
    expect(screen.queryByText('Lokale Laufzeit holen')).toBeNull();
    /* Der manuelle Pfad steht trotzdem da. */
    expect(screen.getByRole('button', { name: 'ollama.com öffnen' })).toBeTruthy();
  });

  it('bietet im Zustand „installiert, gestoppt" das Starten an und meldet einen Fehlschlag', async () => {
    state.runtimeStatus = 'installed-stopped';
    await openTab('models');

    expect(
      await screen.findByText('Ollama ist installiert, läuft aber gerade nicht.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Jetzt starten' }));

    expect(
      await screen.findByText(
        'Ollama ließ sich auf diesem Rechner nicht starten. Selbst starten, dann erneut prüfen.',
      ),
    ).toBeTruthy();
  });

  it('zeigt im Zustand „läuft" die Pull-Liste mit Downloadgröße', async () => {
    state.runtimeStatus = 'running';
    await openTab('models');

    expect(await screen.findByText('Ollama läuft auf diesem Rechner.')).toBeTruthy();
    /* Aus der Attrappe von `recommendModels` (`mock-bridge.ts`): der
       `wiki-ingest`-Pick ist ein lokales, noch nicht installiertes Modell
       mit 18 GB. */
    expect(await screen.findByText('qwen2.5:32b')).toBeTruthy();
    expect(screen.getByText('18 GB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'qwen2.5:32b holen' })).toBeTruthy();
  });

  /* F3: `pull.progress` must read in human units, not raw byte integers —
     the acceptance criterion is "shows the total size and what is left",
     and a ten-digit byte count communicates neither. Pulls read their
     progress from `pullStore` directly rather than from `event:pull-progress`
     (that split lives in `usePullMutations`/`llm-stream.ts`), so the chunk is
     pushed straight into the store here instead of emitted through the
     bridge. */
  it('zeigt den Pull-Fortschritt in lesbaren Einheiten statt Rohbytes', async () => {
    state.runtimeStatus = 'running';
    const completedBytes = 3 * 1024 * 1024 * 1024;
    const totalBytes = 5 * 1024 * 1024 * 1024;
    appendPull('test-pull-1', {
      modelId: 'qwen2.5:32b',
      status: 'downloading',
      completed: completedBytes,
      total: totalBytes,
      done: false,
    });
    try {
      await openTab('models');
      expect(await screen.findByText('qwen2.5:32b')).toBeTruthy();
      expect(await screen.findByText(/3 GB von 5 GB/)).toBeTruthy();
      expect(screen.queryByText(String(completedBytes))).toBeNull();
      expect(screen.queryByText(String(totalBytes))).toBeNull();
    } finally {
      clearPull('test-pull-1'); // module-level store — must not leak into other tests
    }
  });

  it('hat in keinem Zustand einen A11y-Verstoß', async () => {
    state.runtimeStatus = 'running';
    const { container } = await openTab('models');
    await screen.findByText('Ollama läuft auf diesem Rechner.');
    await screen.findByText('qwen2.5:32b');
    await expectNoViolations(container);
  });

  /* 033, D10: llama.cpp gets its own card, next to Ollama's — each reading
     its own status (proving the two runtimes' queries don't collide) and
     llama.cpp's naming what it is for, not just a bare URL (AC 1). */
  it('zeigt neben Ollama eine eigene Karte für llama.cpp mit eigenem Status und Zweck-Hinweis', async () => {
    state.runtimeStatus = 'installed-stopped';
    state.llamaCppRuntimeStatus = 'running';
    await openTab('models');

    expect(await screen.findByText('Lokale Laufzeit (Ollama)')).toBeTruthy();
    expect(screen.getByText('Lokale Laufzeit (llama.cpp)')).toBeTruthy();
    expect(screen.getByText('Ollama ist installiert, läuft aber gerade nicht.')).toBeTruthy();
    expect(screen.getByText('llama.cpp läuft auf diesem Rechner.')).toBeTruthy();
    expect(screen.getByText(/Kontrolle über GPU-Auslagerung und Kontextgröße/)).toBeTruthy();
  });

  /* The install dialog shows the GPU scan's preselected build with its
     reason, and lets it be changed — changing it must re-plan against Hugging
     Face's own numbers rather than only relabel the same size (guardrail 2).
     Review finding 1 (033): the select must show the just-picked build right
     away, not only once `replan` resolves — otherwise it can show a build
     that isn't what "confirm" would actually download. Review finding 2: a
     build that replans into a blocked plan must render its reason and
     disable confirm, not let the user press it into a generic error. */
  it('zeigt beim Holen von llama.cpp den vorgeschlagenen Build und plant beim Wechsel neu', async () => {
    await openTab('models');

    const getButtons = await screen.findAllByRole('button', { name: 'Jetzt holen' });
    expect(getButtons.length).toBe(2); // Ollama and llama.cpp each offer their own
    await userEvent.click(getButtons[1] as HTMLElement); // llama.cpp is the second card

    expect(await screen.findByText('Lokale Laufzeit holen')).toBeTruthy();
    // The structured reason (033, D2) is composed into German here, not
    // rendered as core's English fact (CLAUDE.md guardrail 7).
    expect(screen.getByText(/NVIDIA GeForce RTX 4070.*erkannt/)).toBeTruthy();
    const select = screen.getByLabelText('Build') as HTMLSelectElement;
    expect(select.value).toBe('cuda');
    expect(screen.getByText(/4,1 GB/)).toBeTruthy();
    const confirmButton = screen.getByRole('button', {
      name: 'Engine herunterladen',
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);

    await userEvent.selectOptions(select, 'vulkan');

    /* The select already shows "vulkan" here — before `waitFor` gives the
       `replan` mutation any chance to resolve — because it's bound to the
       `buildId` state set synchronously in `changeBuild`, not to
       `currentPlan.build.id`, which only updates on the mutation's
       `onSuccess`. */
    expect(select.value).toBe('vulkan');

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:runtimeInstallPlan', {
        runtime: 'llamacpp',
        buildId: 'vulkan',
      }),
    );
    expect(await screen.findByText(/1,2 GB/)).toBeTruthy();

    // Picking a build the replanned plan can't fit (this fixture's "cpu" is
    // the one that no longer fits) must render the blocked reason and
    // disable confirm — the user must still be able to pick a different
    // build (the select itself stays enabled) rather than press into a
    // generic error.
    await userEvent.selectOptions(select, 'cpu');
    expect(select.value).toBe('cpu');
    expect(
      await screen.findByText(
        'Nicht genug freier Speicherplatz für die Engine — Platz schaffen und erneut versuchen.',
      ),
    ).toBeTruthy();
    expect(confirmButton.disabled).toBe(true);
    expect(select.disabled).toBe(false);
  });

  /* Review finding 3 (033): a llama.cpp engine download that finishes without
     error really is the install completing (the binary is in place), so the
     card's status query must refresh on its own — not only once the user
     presses "Erneut prüfen". */
  it('aktualisiert den llama.cpp-Status, sobald der Engine-Download ohne Fehler fertig ist', async () => {
    await openTab('models');

    const getButtons = await screen.findAllByRole('button', { name: 'Jetzt holen' });
    await userEvent.click(getButtons[1] as HTMLElement);
    await screen.findByText('Lokale Laufzeit holen');

    await userEvent.click(screen.getByRole('button', { name: 'Engine herunterladen' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:downloadRuntime', {
        runtime: 'llamacpp',
        buildId: 'cuda',
      }),
    );

    const statusCallsBeforeDone = invoke.mock.calls.filter(
      ([channel]) => channel === 'llm:localRuntimeStatus',
    ).length;

    emitEvent('event:install-progress', {
      downloadId: 'llamacpp-download-1',
      downloadedMb: 4200,
      totalMb: 4200,
      done: true,
    });

    await waitFor(() => {
      const statusCallsAfterDone = invoke.mock.calls.filter(
        ([channel]) => channel === 'llm:localRuntimeStatus',
      ).length;
      expect(statusCallsAfterDone).toBeGreaterThan(statusCallsBeforeDone);
    });
  });
});

describe('Einstellungen: Sprachen', () => {
  it('wechselt die Oberflächensprache sofort', async () => {
    await openTab('languages');
    const select = await screen.findByLabelText('Oberfläche');

    await userEvent.selectOptions(select, 'en');

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('settings:setLanguages', { ui: 'en' }));
    /* Ohne Neustart: derselbe Screen trägt jetzt englische Texte. */
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getByLabelText('Interface')).toBeTruthy();
  });

  it('trennt Dokument- und Gesprächssprache', async () => {
    await openTab('languages');
    const documents = await screen.findByLabelText('Dokumentsprache');

    await userEvent.selectOptions(documents, 'en');

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setLanguages', { documents: 'en' }),
    );
    /* Die Oberfläche bleibt deutsch — die drei Einstellungen sind unabhängig. */
    expect(screen.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeTruthy();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openTab('languages');
    await screen.findByLabelText('Oberfläche');
    await expectNoViolations(container);
  });

  /* 024 D8: the card queries the plan itself and stays up as long as the
     plan finds old-language headings — not only right after a switch. */
  describe('mit alten Überschriften', () => {
    beforeEach(() => {
      state.sectionPlanEntries = [
        {
          path: 'projects/foo.md',
          hash: 'hash-1',
          renames: [{ kind: 'notes', from: 'Notes', to: 'Notizen' }],
          folds: [],
        },
      ];
    });

    it('zeigt die Warnung schon beim Öffnen des Tabs, ohne dass die Sprache erst umgeschaltet wird', async () => {
      await openTab('languages');
      expect(await screen.findByText('1 Datei trägt noch Überschriften in English.')).toBeTruthy();
      expect(invoke).toHaveBeenCalledWith('vault:sectionPlan', { to: 'de' });
    });

    it('stellt nach Bestätigung um und meldet das Ergebnis', async () => {
      await openTab('languages');
      await screen.findByText('1 Datei trägt noch Überschriften in English.');
      const plannedEntries = state.sectionPlanEntries; // the mock empties this once migrated

      await userEvent.click(screen.getByRole('button', { name: 'Überschriften umstellen' }));
      await userEvent.click(screen.getByRole('button', { name: 'Jetzt umstellen' }));

      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith('vault:sectionMigrate', {
          to: 'de',
          entries: plannedEntries,
        }),
      );
      expect(await screen.findByText('1 Datei umgestellt.')).toBeTruthy();

      /* Once done, the plan is empty again — closing the dialog (Escape,
         to dodge the ambiguous "Schließen" name shared by the window's own
         close button) leaves nothing behind to reopen. */
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByText(/trägt noch Überschriften/)).toBeNull());
    });

    it('hat keinen A11y-Verstoß', async () => {
      const { container } = await openTab('languages');
      await screen.findByText('1 Datei trägt noch Überschriften in English.');
      await expectNoViolations(container);
    });
  });
});

describe('Einstellungen: Verhalten und Info', () => {
  /* Jeder Schalter in diesem Tab hat einen Leser. Die drei, die keinen hatten
     (`capture.autoFileThreshold`, `journal.askMood`, `journal.extractFacts`), gibt
     es nicht mehr — sie sind aus den Einstellungen verschwunden, nicht stillgelegt.
     Deshalb steht hier weder ein Schieber noch ein „kommt später"-Rahmen. */
  it('zeigt keinen Schalter ohne Leser und keinen Platzhalter-Rahmen', async () => {
    const { container } = await openTab('behavior');
    await screen.findByLabelText(/Dumps nach dem Ablegen einordnen lassen/);

    expect(screen.queryByText('Schwelle für automatisches Ablegen')).toBeNull();
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(screen.queryByText(/Kommt mit dem Tagebuch/)).toBeNull();
    expect(screen.queryByText(/liest noch niemand/)).toBeNull();

    /* Und alles, was dasteht, ist bedienbar — kein abgeschaltetes Feld mehr. */
    for (const field of container.querySelectorAll('input, select, textarea')) {
      expect((field as HTMLInputElement).disabled, field.getAttribute('name') ?? '').toBe(false);
    }
  });

  /* Die Haltung des Coachs ist scharf: der Tagebuch-Screen liest sie als Vorgabe
     (`JournalScreen`: `stance = mode ?? settings.mode`). */
  it('schreibt die Grundhaltung des Coachs in die Vault-Einstellungen', async () => {
    await openTab('behavior');
    const analyze = await screen.findByLabelText(/Analysieren/);
    expect((analyze as HTMLInputElement).disabled).toBe(false);
    await userEvent.click(analyze);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setVault', {
        patch: { journal: { mode: 'analyze' } },
      }),
    );
  });

  /* Die beiden Pflege-Zahlen sind seit der Integration bedienbar: `stale-page`
     liest die Frist, `gardener-deps` den Schalter für die Deutung. */
  it('schreibt die Pflege-Einstellungen in die Vault-Einstellungen', async () => {
    await openTab('behavior');
    const days = await screen.findByLabelText('Eine Seite gilt als angestaubt nach');
    await userEvent.clear(days);
    await userEvent.type(days, '90');
    await userEvent.tab();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setVault', {
        patch: { gardener: { reviewAfterDays: 90 } },
      }),
    );

    await userEvent.click(screen.getByLabelText(/Befunde von einem Modell deuten lassen/));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setVault', {
        patch: { gardener: { useLlm: false } },
      }),
    );
  });

  it('nimmt eine Tastenkombination auf', async () => {
    await openTab('behavior');
    await userEvent.click(await screen.findByRole('button', { name: /Aufnehmen/ }));
    expect(screen.getByText('Tasten drücken, Esc bricht ab')).toBeTruthy();

    await userEvent.keyboard('{Control>}{Alt>}j{/Alt}{/Control}');

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:setVault', {
        patch: { capture: { quickCaptureShortcut: 'Control+Alt+J' } },
      }),
    );
  });

  it('sagt in der Info, wo die Schlüssel liegen', async () => {
    await openTab('about');
    expect(await screen.findByText(/keys.json/)).toBeTruthy();
    expect(screen.getByText(/nie in einem Log/)).toBeTruthy();
    expect(screen.getByText(/docs\/VAULT-FORMAT.md/)).toBeTruthy();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await openTab('behavior');
    await screen.findByLabelText(/Dumps nach dem Ablegen einordnen lassen/);
    await expectNoViolations(container);
  });
});

/* 028: die einzige editierbare Angabe der Maschinen-Karte. Die Attrappe hält
   den eingetragenen (und, testintern, den "erkannten") VRAM-Wert im Modul
   von `mock-bridge.ts` fest — `resetVramOverrideMock` im globalen
   `beforeEach` verhindert, dass ein Test in den nächsten hineinwirkt. */
describe('Einstellungen: Maschine (VRAM)', () => {
  async function scan() {
    const rendered = await openTab('models');
    await userEvent.click(screen.getByRole('button', { name: 'Diesen Rechner scannen' }));
    await screen.findByText('Arbeitsspeicher (RAM)');
    return rendered;
  }

  /* 035, D2 / review F5: every other test in this describe block clicks
     "Diesen Rechner scannen" first. This one starts from the state the real
     app is usually in — a machine already scanned in an earlier session —
     and checks that `llm:getMachineScan` alone (no click) is enough for the
     card to show facts, verdict and scan date on mount. */
  it('zeigt einen zuvor gespeicherten Scan sofort an, ohne dass "Scannen" geklickt wird', async () => {
    seedMockScanned();

    await openTab('models');

    expect(await screen.findByText(/Zuletzt gescannt:/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erneut scannen' })).toBeTruthy();
    expect(screen.getByText('Arbeitsspeicher (RAM)')).toBeTruthy();
    expect(screen.getByText('Grafikspeicher (VRAM)')).toBeTruthy();
    expect(invoke.mock.calls.some(([channel]) => channel === 'llm:scanMachine')).toBe(false);
  });

  it('bietet eine Eingabe an, solange der VRAM-Wert unbekannt ist', async () => {
    await scan();
    /* RAM, GPU, CPU und Speicherplatz sind in der Attrappe ebenfalls
       "unbekannt" — die Prüfung bleibt auf die VRAM-Zeile beschränkt. */
    const row = screen.getByText('Grafikspeicher (VRAM)').closest('div') as HTMLElement;
    expect(within(row).getByText('unbekannt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eintragen' })).toBeTruthy();
  });

  it('lehnt eine leere und eine nicht-numerische Eingabe ab, ohne den Kanal zu rufen', async () => {
    await scan();
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    const input = screen.getByLabelText('Grafikspeicher (VRAM)');

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Eine Zahl eingeben.')).toBeTruthy();

    await userEvent.type(input, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Eine Zahl in GB eingeben.')).toBeTruthy();

    expect(invoke.mock.calls.some(([channel]) => channel === 'llm:setVramOverride')).toBe(false);
    /* Nichts hat sich am Wert geändert — die Eingabe ist verworfen, nicht übernommen. */
    expect(screen.getByLabelText('Grafikspeicher (VRAM)')).toBeTruthy();
  });

  it('übernimmt einen gültigen Wert mit der Marke „von dir eingetragen“', async () => {
    await scan();
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    /* The field reads and writes GB (035, D3) — `16` GB is the stored 16384 MB. */
    await userEvent.type(screen.getByLabelText('Grafikspeicher (VRAM)'), '16');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:setVramOverride', { vramMb: 16384 }),
    );
    expect(await screen.findByText('16 GB')).toBeTruthy();
    expect(screen.getByText('Von dir eingetragen')).toBeTruthy();
  });

  it('setzt den Wert über „Löschen“ auf unbekannt zurück', async () => {
    await scan();
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    await userEvent.type(screen.getByLabelText('Grafikspeicher (VRAM)'), '16');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Von dir eingetragen');

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:setVramOverride', { vramMb: null }),
    );
    expect(await screen.findByRole('button', { name: 'Eintragen' })).toBeTruthy();
    expect(screen.queryByText('Von dir eingetragen')).toBeNull();
  });

  it('zeigt bei einem Widerspruch beide Aktionen, „Erkannten Wert verwenden“ löscht die Eingabe', async () => {
    setMockDetectedVramMb(8192);
    try {
      await scan();
      /* Erkannt, nicht eingetragen — noch kein Widerspruch, noch keine Marke. */
      expect(await screen.findByText('8 GB')).toBeTruthy();
      expect(screen.queryByText('Von dir eingetragen')).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
      /* The field prefills with the detected value in GB ("8") — replace it
         rather than appending, or the draft would read "816" instead of the
         intended "16". */
      const input = screen.getByLabelText('Grafikspeicher (VRAM)');
      await userEvent.clear(input);
      await userEvent.type(input, '16');
      await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
      await screen.findByText('Von dir eingetragen');

      expect(
        await screen.findByText(
          'Die Erkennung meldet inzwischen 8 GB, was von den 16 GB abweicht, die du eingetragen hast.',
        ),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Meins behalten' })).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: 'Erkannten Wert verwenden' }));

      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith('llm:setVramOverride', { vramMb: null }),
      );
      expect(screen.queryByText(/Die Erkennung meldet inzwischen/)).toBeNull();
      expect(screen.queryByText('Von dir eingetragen')).toBeNull();
      expect(await screen.findByText('8 GB')).toBeTruthy();
    } finally {
      setMockDetectedVramMb(null); // module-level lever — must not leak into other tests
    }
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await scan();
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    await expectNoViolations(container);
  });
});

/* 029, D4: the resource budget control, and the RAM/VRAM rows' planned
   figures it feeds. `mock-bridge.ts`'s `mockVramVerdict` computes a real
   VRAM-based verdict once a VRAM figure is known (via the override row
   above), which is what makes the planned-figure and "nothing fits"
   assertions below more than a stub. */
describe('Einstellungen: Maschine (Ressourcen-Budget)', () => {
  async function scan() {
    const rendered = await openTab('models');
    await userEvent.click(screen.getByRole('button', { name: 'Diesen Rechner scannen' }));
    await screen.findByText('Arbeitsspeicher (RAM)');
    return rendered;
  }

  it('zeigt den aktuellen Anteil mit Hinweistext und ändert ihn über den Schieberegler', async () => {
    await scan();
    expect(screen.getByText('80 %')).toBeTruthy();
    expect(
      screen.getByText(/Bemisst Modellempfehlungen an diesem Anteil von RAM und VRAM/),
    ).toBeTruthy();

    /* 035, D5: a slider replaced the text field + "Ändern" button — drag is
       a `change` (live) followed by a `pointerUp` (the single commit). */
    const slider = screen.getByRole('slider', {
      name: 'Anteil von RAM und VRAM für lokale Modelle',
    });
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.pointerUp(slider);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm:setResourceBudget', { percent: 50 }),
    );
    expect(await screen.findByText('50 %')).toBeTruthy();
  });

  /* The old text-field validation test ("lehnt eine leere/nicht-numerische/
     außerhalb liegende Eingabe ab") no longer has an equivalent: a native
     `input[type=range]` with `min`/`max`/`step` cannot produce an empty,
     non-numeric or out-of-range value in the first place (035, D5) — there
     is no error copy left to test here. The slider's own keyboard/commit
     behavior is covered in `tests/renderer/atoms/Slider.test.tsx`. */

  it('zeigt bei bekanntem VRAM die geplante Zahl neben dem realen Wert', async () => {
    await scan();
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    await userEvent.type(screen.getByLabelText('Grafikspeicher (VRAM)'), '16');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('16 GB');

    /* 16 GB − 1024 MB fixed reserve = 15 GB, × 80 % budget = 12 GB — the
       story's own example, not a raw 16 GB × 80 % = 12.8 GB. */
    const row = screen.getByText('Grafikspeicher (VRAM)').closest('div') as HTMLElement;
    expect(row.textContent).toContain('geplant mit 12 GB bei 80 % nach Reserve');
  });

  /* 035, D6: there is no more separate "nothing fits" line — the plain-
     language headline sentence itself says so, banded via
     `describeCapacityBand` into `verdict.band.none`, naming the limiting
     resource instead of a parameter count. */
  it('sagt in der Kopfzeile ehrlich, dass bei diesem Budget nichts Lokales passt', async () => {
    await scan();
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    await userEvent.type(screen.getByLabelText('Grafikspeicher (VRAM)'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText(
        'Der Grafikspeicher (VRAM) setzt die Grenze: dafür passt derzeit kein lokales Modell bequem auf diese Maschine.',
      ),
    ).toBeTruthy();
    /* No parameter counts or size tiers survive on the card (035, D6). */
    expect(screen.queryByText(/Größen, die bequem passen sollten/)).toBeNull();
    expect(screen.queryByText(/Mrd\. Parameter/)).toBeNull();
  });

  it('hat keinen A11y-Verstoß', async () => {
    const { container } = await scan();
    await expectNoViolations(container);
  });
});
