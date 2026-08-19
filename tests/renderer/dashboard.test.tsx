// @vitest-environment jsdom
/* Das Dashboard mit verschiebbaren Modulen.
 *
 * Der Prüfstein dieses Screens: **behauptet ein Schalter etwas, das nicht
 * passiert?** Deshalb steht hier vor allem, was nach einer Bedienung wirklich
 * gespeichert wird — und was eine Kachel sagt, wenn sie nichts weiß:
 *
 * - Verschieben per Zeiger und per Tastatur ergibt genau die Reihenfolge, die
 *   danach in `dashboard:setLayout` steht. Esc speichert nichts.
 * - Breite ändern und Ausblenden wirken, die Auswahl blendet ein und aus.
 * - Jede Kachel rendert mit Fixture-Daten und hat einen echten Leerzustand.
 * - Die Pflege-Kachel behauptet keinen Gesundheitswert, solange keiner vorliegt.
 * - Todos Arbeit zeigt keine privaten Todos.
 * - axe findet nichts, auch nicht am Gitter mit seiner Tastaturbedienung.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { DEFAULT_DASHBOARD_TILES } from '@shared/types';
import type {
  DashboardData,
  DashboardLayout,
  OverviewSettings,
  VaultSettings,
} from '@shared/types';
import { DashboardScreen } from '@renderer/screens/dashboard/DashboardScreen';
import {
  dropIndex,
  gridColumns,
  moveTile,
  resizeTile,
  setTileHidden,
  shiftTile,
  tileRows,
  verticalStep,
  visibleTiles,
} from '@renderer/screens/dashboard/layout';
import { ActiveProjectsTile } from '@renderer/components/tiles/ActiveProjectsTile';
import { AskTile } from '@renderer/components/tiles/AskTile';
import { ClaudeSessionsTile } from '@renderer/components/tiles/ClaudeSessionsTile';
import { DeadlinesTile } from '@renderer/components/tiles/DeadlinesTile';
import { GardenerTile } from '@renderer/components/tiles/GardenerTile';
import { InboxTile } from '@renderer/components/tiles/InboxTile';
import { JournalStreakTile } from '@renderer/components/tiles/JournalStreakTile';
import { QuickCaptureTile } from '@renderer/components/tiles/QuickCaptureTile';
import { RecentWorkTile } from '@renderer/components/tiles/RecentWorkTile';
import { StaleProjectsTile } from '@renderer/components/tiles/StaleProjectsTile';
import { TodosTile } from '@renderer/components/tiles/TodosTile';
import { ToastHost } from '@renderer/components/ToastHost';
import { WaitingOnTile } from '@renderer/components/tiles/WaitingOnTile';
import { setLanguage } from '@renderer/i18n';
import { clearToasts } from '@renderer/lib/toast';
import type { SbBridge } from '@renderer/lib/bridge';
import {
  NOW,
  TODAY,
  dashboardFixture,
  emptyDashboard,
  layoutOf,
  projects,
  reminders,
  sessions,
} from './dashboard-fixtures';

/** Antworten je Kanal. Was fehlt, wird zum Fehler — so fällt Fehlendes auf. */
type SbHandlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

/* Eigene Attrappe statt `tests/setup.ts`: ein Test unter `tests/renderer/` darf
   nur `src/renderer`, `src/shared` und sich selbst sehen (tsconfig.web). */
function installMock(handlers: SbHandlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

/** Zeigt die Adresse, damit ein Klick prüfbar wird, der navigiert. */
function Location() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, { resultTypes: ['violations'] });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

interface Harness {
  /** Was der Hauptprozess wirklich gespeichert bekommen hat. */
  saved: DashboardLayout[];
}

/** Vault-Einstellungen, soweit das Dashboard sie liest. */
function vaultSettings(overview: Partial<OverviewSettings>): VaultSettings {
  return {
    version: 1,
    languages: { ui: 'de', documents: 'de', conversation: 'de', translateSources: true },
    capture: {
      quickCaptureShortcut: 'Control+Shift+Space',
      autoClassify: true,
      closeAfterCapture: true,
    },
    overview: {
      staleAfterDays: 14,
      deadlineHorizonDays: 14,
      waitingNudgeDays: 5,
      useClaudeSessions: true,
      claudeProjectsDir: '',
      useCodexSessions: true,
      codexSessionsDir: '',
      notifications: true,
      dismissedAgentProjects: [],
      showEmptySessionsTab: false,
      ...overview,
    },
    journal: { mode: 'tips' },
    gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
    providers: [],
    routing: { tasks: {}, defaults: {} },
    dashboard: layoutOf([]),
    preferredTags: [],
  };
}

/** Die Attrappe mit allem, was das Dashboard fragt. */
function mount(
  options: {
    data?: DashboardData;
    layout?: DashboardLayout;
    overview?: Partial<OverviewSettings>;
    extra?: SbHandlers;
  } = {},
): Harness {
  const saved: DashboardLayout[] = [];
  const layout = options.layout ?? layoutOf(['recent-work', 'waiting-on', 'inbox', 'gardener']);
  const handlers: SbHandlers = {
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 12,
      indexedAt: NOW,
      indexing: false,
    }),
    'dashboard:layout': () => layout,
    'dashboard:setLayout': (request: IpcRequest<'dashboard:setLayout'>) => {
      saved.push(request.layout);
      return request.layout;
    },
    'dashboard:data': () => options.data ?? dashboardFixture,
    'reminders:list': () => reminders,
    'reminders:snooze': () => undefined,
    'claude:sessions': () => sessions,
    'projects:list': () => projects,
    'capture:inbox': () => [],
    'todos:list': () => [],
    'settings:get': () => ({
      app: {
        version: 1,
        lastVault: 'C:/vaults/demo',
        recentVaults: [],
        theme: 'dark' as const,
        customization: { background: 'none' as const, appIcon: 'knowledge-garden' as const },
        uiLanguage: 'de' as const,
        window: { width: 1440, height: 900 },
        startMinimized: false,
        onboarded: true,
      },
      vault: options.overview === undefined ? null : vaultSettings(options.overview),
    }),
    ...options.extra,
  };
  installMock(handlers);
  return { saved };
}

/** Die Griffe in der Reihenfolge, in der sie im Gitter stehen. */
function handles(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /verschieben$/ });
}

function order(): string[] {
  return handles().map((handle) => handle.getAttribute('aria-label') ?? '');
}

beforeEach(() => {
  setLanguage('de');
  /* Der Meldungsspeicher lebt außerhalb von React: ohne das hier trüge ein Test
     die Meldung des vorigen mit sich. */
  clearToasts();
});

afterEach(() => {
  delete window.sb;
});

// ── Die Rechnung hinter dem Gitter ──────────────────────────────────────────

describe('Anordnung als Rechnung', () => {
  const layout = layoutOf(['recent-work', 'waiting-on', 'inbox']);

  it('verschiebt an eine Position, gezählt ohne die Kachel selbst', () => {
    const moved = moveTile(layout, 'recent-work', 2);
    expect(visibleTiles(moved).map((tile) => tile.id)).toEqual([
      'waiting-on',
      'inbox',
      'recent-work',
    ]);
  });

  it('klemmt einen Zug über den Rand statt ihn zu verlieren', () => {
    const moved = moveTile(layout, 'inbox', 99);
    expect(visibleTiles(moved).map((tile) => tile.id)).toEqual([
      'recent-work',
      'waiting-on',
      'inbox',
    ]);
  });

  it('tauscht mit dem Nachbarn, wenn eine Pfeiltaste kommt', () => {
    const right = shiftTile(layout, 'recent-work', 1);
    expect(visibleTiles(right).map((tile) => tile.id)).toEqual([
      'waiting-on',
      'recent-work',
      'inbox',
    ]);
    expect(visibleTiles(shiftTile(right, 'recent-work', -1)).map((tile) => tile.id)).toEqual([
      'recent-work',
      'waiting-on',
      'inbox',
    ]);
  });

  it('ändert die Breite und blendet aus, ohne ein Modul zu verlieren', () => {
    expect(resizeTile(layout, 'inbox', 'xl').tiles.find((tile) => tile.id === 'inbox')?.size).toBe(
      'xl',
    );
    const hidden = setTileHidden(layout, 'recent-work', true);
    expect(visibleTiles(hidden).map((tile) => tile.id)).toEqual(['waiting-on', 'inbox']);
    expect(hidden.tiles).toHaveLength(layout.tiles.length);
    expect(
      visibleTiles(setTileHidden(hidden, 'recent-work', false)).map((tile) => tile.id),
    ).toEqual(['waiting-on', 'inbox', 'recent-work']);
  });

  it('deckt mit der Startanordnung jedes Modul genau einmal ab', () => {
    const ids = DEFAULT_DASHBOARD_TILES.map((tile) => tile.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(13);
  });

  it('zählt die Zielposition zeilenweise: über dem Zeiger kommt vorher', () => {
    const rects = [
      { top: 0, bottom: 100, left: 0, width: 200 },
      { top: 0, bottom: 100, left: 200, width: 200 },
      { top: 120, bottom: 220, left: 0, width: 200 },
    ];
    expect(dropIndex(rects, 10, 50)).toBe(0);
    expect(dropIndex(rects, 150, 50)).toBe(1);
    expect(dropIndex(rects, 350, 50)).toBe(2);
    expect(dropIndex(rects, 10, 300)).toBe(3);
  });
});

// ── Das Gitter im Screen ────────────────────────────────────────────────────

describe('Dashboard-Gitter', () => {
  it('stellt die Module in der Reihenfolge der gespeicherten Anordnung', async () => {
    mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    expect(order()).toEqual([
      'Zuletzt gearbeitet verschieben',
      'Warte auf verschieben',
      'Inbox verschieben',
      'Pflege verschieben',
    ]);
    /* Ausgeblendetes steht nicht im Gitter. */
    expect(screen.queryByRole('heading', { name: 'Todos Arbeit' })).toBeNull();
  });

  it('speichert nach dem Ziehen genau die Reihenfolge, die entstanden ist', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    const handle = handles()[0]!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10 });
    /* In jsdom ist jedes Rechteck leer; ein Zeiger unterhalb davon liegt hinter
       allen Kacheln — die Kachel landet also am Ende. */
    fireEvent.pointerMove(window, { clientX: 400, clientY: 900 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 900 });

    await waitFor(() => expect(harness.saved).toHaveLength(1));
    expect(harness.saved[0]!.tiles.filter((tile) => tile.hidden !== true).map((t) => t.id)).toEqual(
      ['waiting-on', 'inbox', 'gardener', 'recent-work'],
    );
    expect(order()[3]).toBe('Zuletzt gearbeitet verschieben');
  });

  /* Die Lücke ist eine Vorschau, und eine Vorschau darf nicht mehr Platz zeigen
     als die Kachel nimmt: bei 1152 px (zwei Spalten) belegt eine md-Kachel eine
     Spalte — die Lücke war doppelt so breit wie das Ziel. */
  it('bemisst die Ziellücke nach den Spalten des Fensters', async () => {
    const before = window.innerWidth;
    try {
      mount();
      wrap(<DashboardScreen />);
      await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

      window.innerWidth = 1152;
      fireEvent(window, new Event('resize'));
      /* „Warte auf" ist die md-Kachel; sm wäre in beiden Gittern eine Spalte. */
      fireEvent.pointerDown(handles()[1]!, { button: 0, clientX: 10, clientY: 10 });
      const gap = () => document.querySelector('.sb-tile-gap')?.getAttribute('style') ?? '';
      expect(gap()).toContain('span 1');

      window.innerWidth = 1440;
      fireEvent(window, new Event('resize'));
      expect(gap()).toContain('span 2');
      fireEvent.pointerUp(window, { clientX: 400, clientY: 900 });
    } finally {
      window.innerWidth = before;
    }
  });

  /* Optimistisch heißt: die neue Reihenfolge steht sofort da. Scheitert das
     Speichern, muss die alte zurückkommen — sonst zeigt das Gitter etwas, das in
     der Datei nicht steht. */
  it('nimmt die Anordnung zurück, wenn das Speichern scheitert', async () => {
    mount({
      extra: {
        'dashboard:setLayout': () => {
          throw Object.assign(new Error('kaputt'), { code: 'io' });
        },
      },
    });
    /* Die Meldung erscheint über `ToastHost` — in der Hülle steht er ohnehin. */
    wrap(
      <>
        <DashboardScreen />
        <ToastHost />
      </>,
    );
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    handles()[0]!.focus();
    await userEvent.keyboard(' {ArrowRight}{Enter}');

    await waitFor(() => expect(order()[0]).toBe('Zuletzt gearbeitet verschieben'));
    expect(await screen.findByText('Die Anordnung ließ sich nicht speichern.')).toBeTruthy();
  });

  it('verschiebt per Tastatur, sagt es an und speichert erst beim Ablegen', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    const handle = handles()[0]!;
    handle.focus();
    await userEvent.keyboard(' ');
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('Verschiebemodus. Zuletzt gearbeitet, Position 1 von 4.');
    expect(handle.getAttribute('aria-pressed')).toBe('true');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('status').textContent).toBe('Zuletzt gearbeitet, Position 2 von 4.');
    expect(order()).toEqual([
      'Warte auf verschieben',
      'Zuletzt gearbeitet verschieben',
      'Inbox verschieben',
      'Pflege verschieben',
    ]);
    /* Bis zum Ablegen ist nichts geschrieben. */
    expect(harness.saved).toHaveLength(0);

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(harness.saved).toHaveLength(1));
    expect(harness.saved[0]!.tiles.filter((tile) => tile.hidden !== true).map((t) => t.id)).toEqual(
      ['waiting-on', 'recent-work', 'inbox', 'gardener'],
    );
    expect(screen.getByRole('status').textContent).toContain('liegt auf Position 2 von 4');
  });

  /* Eine Pfeiltaste, die seitwärts schiebt, macht das Ausprobieren unmöglich:
     `ArrowDown` muss um eine Reihe gehen, nicht um eine Position. */
  it('rechnet die senkrechten Pfeiltasten in Reihen, nicht in Positionen', async () => {
    const layout = layoutOf(['recent-work', 'waiting-on', 'inbox', 'gardener', 'deadlines']);
    /* Vier Spalten: „Zuletzt gearbeitet" ist ganze Zeile, dann passen „Warte auf"
       (2) plus die zwei schmalen daneben, „Steht an" bricht um. */
    expect(tileRows(layout, 4).map((row) => row.length)).toEqual([1, 3, 1]);
    expect(verticalStep(layout, 'waiting-on', 4, 1)).toBe(3);
    expect(verticalStep(layout, 'waiting-on', 4, -1)).toBe(-1);
    /* Ein Schritt nach unten geht um eine ganze Reihe, nicht um einen Platz. */
    expect(visibleTiles(shiftTile(layout, 'waiting-on', 3)).map((tile) => tile.id)).toEqual([
      'recent-work',
      'inbox',
      'gardener',
      'deadlines',
      'waiting-on',
    ]);
    /* Und die Spaltenzahl kommt aus denselben Schwellen wie das CSS. */
    expect([gridColumns(1440), gridColumns(1152), gridColumns(900)]).toEqual([4, 2, 1]);
  });

  it('zeigt den Verschiebemodus sichtbar an, nicht nur für den Screenreader', async () => {
    mount();
    const { container } = wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    expect(container.querySelector('.sb-movebar')).toBeNull();
    handles()[0]!.focus();
    await userEvent.keyboard(' ');

    const bar = container.querySelector('.sb-movebar');
    expect(bar?.textContent).toContain('Zuletzt gearbeitet, Position 1 von 4');
    expect(bar?.textContent).toContain('Esc bricht ab');
    expect(bar?.className).not.toContain('sb-visually-hidden');
  });

  /* Der Modus war eine Falle: Tab sprang weg, die Vorschau blieb stehen, und
     danach ging weder Esc noch die Maus. */
  it('beendet den Verschiebemodus, wenn der Fokus den Griff verlässt', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    handles()[0]!.focus();
    await userEvent.keyboard(' {ArrowRight}');
    expect(order()[0]).toBe('Warte auf verschieben');

    await userEvent.keyboard('{Tab}');

    /* Kein angehobener Zustand mehr, die Vorschau ist zurückgenommen, nichts
       gespeichert — und es steht da, dass abgebrochen wurde. */
    await waitFor(() => expect(order()[0]).toBe('Zuletzt gearbeitet verschieben'));
    expect(document.querySelectorAll('.sb-tile--lifted')).toHaveLength(0);
    expect(harness.saved).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('Abgebrochen');

    /* Und die Maus fasst wieder an. */
    const handle = handles()[0]!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 10, clientY: 400 });
    fireEvent.pointerUp(window);
    await waitFor(() => expect(harness.saved).toHaveLength(1));
  });

  it('nimmt mit Esc zurück und speichert nichts', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    handles()[0]!.focus();
    await userEvent.keyboard(' {ArrowRight}{Escape}');

    expect(order()[0]).toBe('Zuletzt gearbeitet verschieben');
    expect(harness.saved).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('Abgebrochen');
  });

  it('ändert die Breite über das Kartenmenü', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    await userEvent.click(screen.getByRole('button', { name: 'Menü von Inbox' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Ganze Zeile/ }));

    await waitFor(() => expect(harness.saved).toHaveLength(1));
    expect(harness.saved[0]!.tiles.find((tile) => tile.id === 'inbox')?.size).toBe('xl');
  });

  /* Ein Menü, das nur die Maus kennt, versteckt die halbe Funktion. */
  it('bedient das Kartenmenü mit der Tastatur', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    const menu = screen.getByRole('button', { name: 'Menü von Inbox' });
    menu.focus();
    await userEvent.keyboard('{Enter}');
    /* Geöffnet heißt: der erste Eintrag hat den Fokus. */
    expect(document.activeElement?.getAttribute('role')).toBe('menuitemradio');
    expect(document.activeElement?.textContent).toContain('Schmal');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => expect(harness.saved).toHaveLength(1));
    expect(harness.saved[0]!.tiles.find((tile) => tile.id === 'inbox')?.size).toBe('lg');
    /* Nach der Wahl liegt der Fokus wieder auf dem Knopf, nicht im Nichts. */
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menü von Inbox' }));

    await userEvent.keyboard('{Enter}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menü von Inbox' }));
  });

  it('blendet über das Kartenmenü aus — und die Auswahl wieder ein', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    await userEvent.click(screen.getByRole('button', { name: 'Menü von Inbox' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ausblenden' }));

    await waitFor(() => expect(harness.saved).toHaveLength(1));
    expect(harness.saved[0]!.tiles.find((tile) => tile.id === 'inbox')?.hidden).toBe(true);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Inbox' })).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Module' }));
    const dialog = await screen.findByRole('dialog', { name: 'Module des Dashboards' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Inbox/ }));

    await waitFor(() => expect(harness.saved).toHaveLength(2));
    expect(harness.saved[1]!.tiles.find((tile) => tile.id === 'inbox')?.hidden).toBeUndefined();
  });

  /* Verschwinden ohne Wort ist der Zustand, in dem Nutzer glauben, sie hätten
     etwas kaputtgemacht. */
  it('sagt beim Ausblenden, was verschwand — und nimmt es zurück', async () => {
    const harness = mount();
    wrap(
      <>
        <DashboardScreen />
        <ToastHost />
      </>,
    );
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    await userEvent.click(screen.getByRole('button', { name: 'Menü von Inbox' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ausblenden' }));

    expect(await screen.findByText('„Inbox" ausgeblendet')).toBeTruthy();
    expect(screen.getByText(/steht weiter in der Auswahl/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

    await waitFor(() => expect(harness.saved).toHaveLength(2));
    /* Zurück heißt: genau die Anordnung von vorher, nicht hinten angehängt. */
    expect(harness.saved[1]!.tiles.filter((tile) => tile.hidden !== true).map((t) => t.id)).toEqual(
      ['recent-work', 'waiting-on', 'inbox', 'gardener'],
    );
    await screen.findByRole('heading', { name: 'Inbox' });
  });

  it('setzt die Anordnung auf die Startaufstellung zurück', async () => {
    const harness = mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    await userEvent.click(screen.getByRole('button', { name: 'Module' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Anordnung zurücksetzen' }));

    await waitFor(() => expect(harness.saved).toHaveLength(1));
    expect(harness.saved[0]!.tiles.map((tile) => tile.id)).toEqual(
      DEFAULT_DASHBOARD_TILES.map((tile) => tile.id),
    );
  });

  it('fasst den Tag zusammen und springt zur zuständigen Kachel', async () => {
    mount({ layout: layoutOf(['deadlines', 'waiting-on']) });
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Steht an' });

    /* Zwei überfällige (ein Todo, eine Antwort), ein heute fälliges Todo, eine
       ausstehende Antwort — gezählt, nicht geschätzt. */
    const jump = screen.getByRole('button', { name: '2 überfällig' });
    expect(screen.getByRole('button', { name: '1 heute fällig' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 Antwort ausstehend' })).toBeTruthy();
    await userEvent.click(jump);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Steht an verschieben');
  });

  it('hat keinen A11y-Verstoß, auch nicht im Verschiebemodus', async () => {
    mount({ layout: layoutOf(['recent-work', 'waiting-on', 'deadlines', 'todos-work']) });
    const { container } = wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });
    await expectNoViolations(container);

    handles()[0]!.focus();
    await userEvent.keyboard(' ');
    await expectNoViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'Menü von Warte auf' }));
    await expectNoViolations(container);
  });

  it('sagt beim leeren Vault, was hier erscheinen wird', async () => {
    mount({ data: emptyDashboard, extra: { 'reminders:list': () => [] } });
    wrap(<DashboardScreen />);
    expect(await screen.findByText('Noch keine Spur im Vault')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Module des Dashboards' })).toBeNull();
  });

  it('sagt es, wenn jedes Modul ausgeblendet ist', async () => {
    mount({ layout: layoutOf([]) });
    wrap(<DashboardScreen />);
    expect(await screen.findByText(/Alle Module sind ausgeblendet/)).toBeTruthy();
  });
});

// ── Der Streifen für Unabgelegtes (Story 006, D6) ───────────────────────────

describe('Streifen für Unabgelegtes', () => {
  it('zeigt die Zahl der unabgelegten Dumps und springt in den Notizen-Filter', async () => {
    mount();
    wrap(
      <>
        <DashboardScreen />
        <Location />
      </>,
    );
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    /* `dashboardFixture.inboxCount` ist 2 — dieselbe Zahl, die auch die
       Inbox-Kachel und der Filter-Link auf Notizen lesen. */
    const strip = screen.getByRole('button', { name: '2 nicht abgelegt' });
    await userEvent.click(strip);
    expect(screen.getByTestId('location').textContent).toBe('/notes?filter=unfiled');
  });

  it('fehlt ganz, wenn nichts unabgelegt ist — keine Meldung „0 nicht abgelegt"', async () => {
    mount({ data: { ...dashboardFixture, inboxCount: 0 } });
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Zuletzt gearbeitet' });

    expect(screen.queryByText(/nicht abgelegt/)).toBeNull();
  });

  it('lässt die Inbox-Kachel unangetastet, wenn der Streifen dazukommt', async () => {
    mount();
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Inbox' });

    /* Zwei Wege zum selben Filter: der Streifen über dem Gitter und der Fuß
       der Inbox-Kachel — beide bleiben nebeneinander bestehen. */
    expect(screen.getByRole('button', { name: '2 nicht abgelegt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zur Inbox' })).toBeTruthy();
  });
});

// ── Die Kacheln einzeln ─────────────────────────────────────────────────────

/** Jede datengetriebene Kachel: mit Bestand und mit einem echten Leerzustand. */
const DATA_TILES: {
  name: string;
  node: ReactNode;
  filled: string | RegExp;
  emptyText: RegExp;
  /** Was leer sein muss, damit die Kachel leer ist. */
  emptyWith: Parameters<typeof mount>[0];
}[] = [
  {
    name: 'Zuletzt gearbeitet',
    node: <RecentWorkTile />,
    filled: 'Nyota Auth0 Migration',
    emptyText: /Noch keine Arbeitsspur/,
    emptyWith: { data: emptyDashboard },
  },
  {
    name: 'Claude-Sessions',
    node: <ClaudeSessionsTile />,
    filled: 'feature/rollen',
    emptyText: /Keine Sitzung in den letzten Tagen/,
    emptyWith: { extra: { 'claude:sessions': () => [] } },
  },
  {
    name: 'Stagnierende Projekte',
    node: <StaleProjectsTile />,
    filled: 'Hochbeet bauen',
    emptyText: /Kein Projekt liegt länger/,
    emptyWith: { data: emptyDashboard },
  },
  {
    name: 'Laufende Projekte',
    node: <ActiveProjectsTile />,
    filled: 'Nyota Auth0 Migration',
    emptyText: /Kein laufendes Projekt/,
    emptyWith: { extra: { 'projects:list': () => [] } },
  },
  {
    name: 'Warte auf',
    node: <WaitingOnTile />,
    filled: 'Freigabe des Rollenkonzepts',
    emptyText: /Du wartest auf niemanden/,
    emptyWith: { data: emptyDashboard },
  },
  {
    name: 'Steht an',
    node: <DeadlinesTile />,
    filled: 'Rollen-Mapping dokumentieren',
    emptyText: /Keine Frist in den nächsten/,
    emptyWith: { extra: { 'reminders:list': () => [] } },
  },
];

describe('Kacheln', () => {
  for (const tile of DATA_TILES) {
    it(`zeigt „${tile.name}" mit Bestand`, async () => {
      mount();
      wrap(tile.node);
      expect((await screen.findAllByText(tile.filled)).length).toBeGreaterThan(0);
    });

    it(`sagt bei „${tile.name}" ehrlich, wenn nichts da ist`, async () => {
      mount(tile.emptyWith);
      wrap(tile.node);
      expect(await screen.findByText(tile.emptyText)).toBeTruthy();
    });
  }

  it('erfasst einen Gedanken mit Ctrl+Enter und bietet den Rückweg an', async () => {
    const dumped: string[] = [];
    const discarded: string[] = [];
    mount({
      extra: {
        'capture:dump': (request) => {
          dumped.push(request.text);
          return {
            path: 'inbox/2026-08-10-1432-gedanke.md',
            id: 'dump-neu',
            title: 'Gedanke',
            text: request.text,
            created: NOW,
            origin: request.origin,
            status: 'raw' as const,
            ageDays: 0,
            wordCount: 2,
            tags: [],
            scope: null,
            filedInto: null,
            filedAt: null,
          };
        },
        'capture:discard': (request) => {
          discarded.push(request.path);
          return { undoToken: 'undo-1' };
        },
      },
    });
    wrap(<QuickCaptureTile />);

    const field = screen.getByLabelText('Gedanke');
    await userEvent.type(field, 'Pipeline prüft Migrationen');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(dumped).toEqual(['Pipeline prüft Migrationen']));
    expect((field as HTMLTextAreaElement).value).toBe('');

    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(discarded).toEqual(['inbox/2026-08-10-1432-gedanke.md']));
    /* Der Gedanke steht wieder im Feld — nicht „irgendwo gespeichert, aber weg". */
    await waitFor(() =>
      expect((screen.getByLabelText('Gedanke') as HTMLTextAreaElement).value).toBe(
        'Pipeline prüft Migrationen',
      ),
    );
  });

  it('gibt die Frage an den Fragen-Screen weiter', async () => {
    mount();
    wrap(
      <>
        <AskTile />
        <Location />
      </>,
    );
    await userEvent.type(
      screen.getByLabelText('Frage an das Second Brain'),
      'Was weiß ich über X?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fragen' }));

    expect(screen.getByTestId('location').textContent).toBe(
      '/ask?q=Was%20wei%C3%9F%20ich%20%C3%BCber%20X%3F',
    );
  });

  it('sagt bei abgeschaltetem Mitlesen, dass es aus ist — nicht „keine Sitzungen"', async () => {
    mount({ overview: { useClaudeSessions: false } });
    wrap(<ClaudeSessionsTile />);
    expect(
      await screen.findByText('Das Mitlesen der Claude-Sessions ist ausgeschaltet.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Keine Sitzung/)).toBeNull();
  });

  /* Der Fuß der Kachel ist der sichtbare Weg von den letzten Sitzungen in die
     ganze Liste. Sie ist seit Story 008 kein eigener Screen mehr, sondern hängt
     unter Projekte — zeigte der Link weiter auf `/agents`, liefe der Nutzer in
     die Umleitung statt in den Screen. */
  it('führt vom Fuß der Sessions-Kachel auf die Sitzungen unter Projekte', async () => {
    mount();
    wrap(
      <>
        <ClaudeSessionsTile />
        <Location />
      </>,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Alle Agent-Sitzungen öffnen' }),
    );

    expect(screen.getByTestId('location').textContent).toBe('/projects/sessions');
  });

  it('ordnet eine Sitzung einem Projekt zu', async () => {
    const linked: { sessionId: string; project: string }[] = [];
    mount({
      extra: {
        'claude:link': (request) => {
          linked.push(request);
          return undefined;
        },
      },
    });
    wrap(<ClaudeSessionsTile />);

    await userEvent.click(await screen.findByRole('button', { name: 'Projekt zuordnen' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /spielwiese/ }),
      'hochbeet-bauen',
    );

    await waitFor(() =>
      expect(linked).toEqual([{ sessionId: 'session-2', project: 'hochbeet-bauen' }]),
    );
  });

  it('trennt Arbeit und Privat: in Arbeit steht kein privates Todo', async () => {
    mount();
    wrap(<TodosTile scope="work" />);
    expect(await screen.findByText('Rollen-Mapping dokumentieren')).toBeTruthy();
    expect(screen.queryByText('Hochbeet-Erde bestellen')).toBeNull();
    /* Gruppiert nach Fälligkeit, nicht als eine lange Liste. */
    expect(screen.getByText('Überfällig')).toBeTruthy();
  });

  it('zeigt privat, was privat ist', async () => {
    mount();
    wrap(<TodosTile scope="private" />);
    expect(await screen.findByText('Hochbeet-Erde bestellen')).toBeTruthy();
    expect(screen.queryByText('Rollen-Mapping dokumentieren')).toBeNull();
  });

  it('nennt im Leerzustand, was hier erscheinen wird', async () => {
    mount({ data: emptyDashboard });
    wrap(<TodosTile scope="work" />);
    expect(await screen.findByText('Kein offenes Todo im Arbeitsbereich.')).toBeTruthy();
  });

  it('behauptet ohne Pflegelauf keinen Gesundheitswert', async () => {
    mount({ data: { ...dashboardFixture, healthKnown: false, health: 0, findingCount: 0 } });
    wrap(<GardenerTile />);
    expect(await screen.findByText(/Noch nicht geprüft/)).toBeTruthy();
    expect(screen.queryByText('100')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('Gesundheit')).toBeNull();
  });

  it('zeigt den Pflegewert, sobald einer vorliegt', async () => {
    mount({ data: { ...dashboardFixture, healthKnown: true, health: 84, findingCount: 3 } });
    wrap(<GardenerTile />);
    expect(await screen.findByText('84')).toBeTruthy();
    expect(screen.getByText('3 Ergebnisse')).toBeTruthy();
  });

  it('zeigt die Serie und den Stimmungsverlauf mit Textalternative', async () => {
    mount();
    wrap(<JournalStreakTile />);
    expect(await screen.findByText('3 Tage in Folge')).toBeTruthy();
    const spark = screen.getByRole('img');
    expect(spark.getAttribute('aria-label')).toContain('3, 4, 2');
  });

  it('sagt beim Tagebuch ohne Eintrag, was die Serie hält', async () => {
    mount({ data: emptyDashboard });
    wrap(<JournalStreakTile />);
    expect(await screen.findByText(/Ein Eintrag am Tag hält die Serie/)).toBeTruthy();
  });

  it('zählt die Inbox und nennt die ältesten Dumps', async () => {
    mount({
      extra: {
        'capture:inbox': () => [
          {
            path: 'inbox/2026-08-01-alt.md',
            id: 'dump-alt',
            title: 'Ältester Gedanke',
            text: 'x',
            created: '2026-08-01T09:00:00+02:00',
            origin: 'window' as const,
            status: 'raw' as const,
            ageDays: 9,
            wordCount: 1,
            tags: [],
            scope: null,
            filedInto: null,
            filedAt: null,
          },
        ],
      },
    });
    wrap(<InboxTile />);
    expect(await screen.findByText('2 Dumps liegen hier')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ältester Gedanke' })).toBeTruthy();
  });

  it('sagt bei leerer Inbox, dass sie leer ist', async () => {
    mount({ data: emptyDashboard });
    wrap(<InboxTile />);
    expect(await screen.findByText(/Die Inbox ist leer/)).toBeTruthy();
  });
});

/* Der Tag der Fixtures steht fest; sonst prüft der Test morgen etwas anderes. */
describe('Fixtures', () => {
  it('rechnet gegen einen festen Tag', () => {
    expect(TODAY).toBe('2026-08-10');
    expect(dashboardFixture.todos.work[0]?.dueInDays).toBeLessThan(0);
  });
});
