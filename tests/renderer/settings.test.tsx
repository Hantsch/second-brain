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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionMigrationEntry } from '@shared/ipc';
import type {
  LocalRuntimeStatus,
  ModelRef,
  ProviderConfig,
  Routing,
  SettingsSnapshot,
  TaskKind,
} from '@shared/types';
import { App } from '@renderer/App';
import type { SbBridge } from '@renderer/lib/bridge';
import { mockBridge } from '@renderer/lib/mock-bridge';
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
  /* 024 D8: what `vault:sectionPlan` currently finds for the tab's
     document-language plan — empty by default so the existing language
     tests see no card. */
  sectionPlanEntries: SectionMigrationEntry[];
}

let state: State;

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
    case 'llm:localRuntimeStatus':
      return state.runtimeStatus;
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
  state = {
    providers: [ollama()],
    routing: { tasks: {}, defaults: {} },
    snapshot: JSON.parse(JSON.stringify(settingsSnapshot)) as SettingsSnapshot,
    detected: { running: false, models: [] },
    runtimeStatus: 'absent',
    sectionPlanEntries: [],
  };
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
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

    expect(screen.getByText(/„Automatisch zuordnen" schlägt zu jeder Aufgabe/)).toBeTruthy();
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
    expect(screen.getByRole('button', { name: /Zur Karte „Lokale Laufzeit"/ })).toBeTruthy();
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

    expect(
      await screen.findByText('Auf diesem Rechner ist keine lokale Laufzeit installiert.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Jetzt holen' }));

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
     and a ten-digit byte count communicates neither. The bridge's `on()` is
     a no-op in this test file, so `event:pull-progress` chunks are pushed
     into `pullStore` directly instead of routed through it. */
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
