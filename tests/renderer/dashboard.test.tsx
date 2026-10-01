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
  ModuleSize,
  OverviewSettings,
  Project,
  Reminder,
  VaultSettings,
} from '@shared/types';
import { DashboardScreen } from '@renderer/screens/dashboard/DashboardScreen';
import {
  dropIndex,
  gridColumns,
  moveTile,
  gridPlacements,
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
import { LooseEndsTile } from '@renderer/components/tiles/LooseEndsTile';
import { QuickCaptureTile } from '@renderer/components/tiles/QuickCaptureTile';
import { RecentWorkTile } from '@renderer/components/tiles/RecentWorkTile';
import { StaleProjectsTile } from '@renderer/components/tiles/StaleProjectsTile';
import { TodosTile } from '@renderer/components/tiles/TodosTile';
import { ToastHost } from '@renderer/components/ToastHost';
import { UpcomingMentionsTile } from '@renderer/components/tiles/UpcomingMentionsTile';
import { WaitingOnTile } from '@renderer/components/tiles/WaitingOnTile';
import { setLanguage } from '@renderer/i18n';
import { formatDate } from '@renderer/lib/format';
import { clearToasts } from '@renderer/lib/toast';
import type { SbBridge } from '@renderer/lib/bridge';
import {
  NOW,
  TODAY,
  codexSession,
  dashboardFixture,
  day,
  emptyDashboard,
  layoutOf,
  projects,
  reminders,
  sessions,
  stamp,
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
      indexRefreshFailedAt: null,
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
        newVaultLanguages: { documents: 'de', conversation: 'de', translateSources: true },
        window: { width: 1440, height: 900 },
        startMinimized: false,
        closeToTray: true,
        onboarded: true,
        machine: {
          vramOverrideMb: null,
          resourceBudgetPercent: 80,
          llamaAutoStart: 'manual',
          llamaOverrides: { gpuLayers: null, contextTokens: null },
        },
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

/** Die Zeile, deren Titelknopf diesen Text trägt. */
function rowOf(title: string): HTMLElement {
  const row = screen.getByRole('button', { name: title }).closest('.sb-line');
  if (row === null) throw new Error('Zeile ohne Rahmen: ' + title);
  return row as HTMLElement;
}

/** Der Kopf einer Kachel — Titel, Zahl, Alarm. */
function headOf(title: string): HTMLElement {
  const head = screen.getByRole('heading', { name: title }).closest('.sb-tile-head');
  if (head === null) throw new Error('Kachel ohne Kopf: ' + title);
  return head as HTMLElement;
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
    expect(ids).toHaveLength(15);
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

  /* Zwei schmale Kacheln neben einer hohen stehen übereinander, statt dass die
     zweite eine eigene Reihe aufmacht — genau diese Reihe sprengte bei
     1152×720 das Budget von zwei Bildschirmen. */
  it('stapelt im zweispaltigen Gitter zwei schmale Kacheln neben einer hohen', () => {
    const sizes = DEFAULT_DASHBOARD_TILES.filter((tile) => tile.hidden !== true).map(
      (tile) => tile.size,
    );
    const rows = (placed: readonly ModuleSize[], columns: number): number[] =>
      gridPlacements(placed, columns).map((placement) => placement.rows);
    /* Steht an | Warte auf, Zuletzt gearbeitet, Todos Arbeit (zwei Reihen) | Pflege
       über Kommende Erwähnungen. */
    expect(rows(sizes, 2)).toEqual([1, 1, 1, 2, 1, 1]);
    /* Die drei Kacheln des Stapels füllen ihre Zellen, sonst niemand. */
    expect(gridPlacements(sizes, 2).map((placement) => placement.stacked)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    /* Vier Spalten und eine Spalte stapeln nicht. */
    expect(rows(sizes, 4)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(rows(sizes, 1)).toEqual([1, 1, 1, 1, 1, 1]);
    /* Nur zwei schmale stapeln: eine mittlere als dritte bekommt ihre eigene Reihe. */
    expect(rows(['md', 'sm', 'md'], 2)).toEqual([1, 1, 1]);
    /* Eine breite Kachel füllt ihre Reihe allein; gezählt wird ab der nächsten. */
    expect(rows(['xl', 'md', 'sm', 'sm'], 2)).toEqual([1, 2, 1, 1]);
    /* Eine Kachel, die allein in ihrer Reihe steht, verschiebt die Zählung nicht. */
    expect(rows(['md', 'xl', 'sm', 'sm', 'sm'], 2)).toEqual([1, 1, 2, 1, 1]);
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

    expect(await screen.findByText('„Inbox“ ausgeblendet')).toBeTruthy();
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

    /* Ein heute fälliges Todo, eine ausstehende Antwort — gezählt, nicht
       geschätzt. Überfällig steht bewusst nicht in der Zeile: keine Kachel
       zeigt alle fünf Quellen, also könnte der Sprung sein Versprechen nicht
       halten. Das tragen jetzt die Kacheln selbst. */
    const jump = screen.getByRole('button', { name: '1 heute fällig' });
    expect(screen.getByRole('button', { name: '1 Antwort ausstehend' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /überfällig$/ })).toBeNull();
    await userEvent.click(jump);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Steht an verschieben');
  });

  it('markiert die überfällige Zeile selbst, nicht nur die Kachel', async () => {
    mount({ layout: layoutOf(['deadlines', 'waiting-on']) });
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Steht an' });

    /* Die Zahl im Kopf sagt "eine" — welche das ist, muss an der Zeile stehen.
       Das Dreieck trägt die Aussage, das Rot betont sie nur: eine Zeile, die
       sich allein durch ihre Farbe von den anderen unterscheidet, ist für ein
       Auge, das die Farbe nicht sieht, gar nicht markiert. */
    const overdueRow = rowOf('Rollen-Mapping dokumentieren');
    expect(within(overdueRow).getByText('Überfällig')).toBeTruthy();
    expect(overdueRow.querySelector('.sb-line-open--overdue')).not.toBeNull();

    /* Und die Zeile ohne Frist bleibt ruhig. */
    const calmRow = rowOf('Nyota Auth0 Migration');
    expect(within(calmRow).queryByText('Überfällig')).toBeNull();
    expect(calmRow.querySelector('.sb-line-open--overdue')).toBeNull();
  });

  it('nennt überfällige Einträge im Kopf der Kachel, die sie hält', async () => {
    mount({ layout: layoutOf(['deadlines', 'waiting-on', 'todos-work']) });
    wrap(<DashboardScreen />);
    await screen.findByRole('heading', { name: 'Steht an' });

    /* Je Kachel gezählt, nicht über alle Kacheln summiert: "Steht an" hält das
       überfällige Todo, "Warte auf" die überfällige Antwort. */
    expect(headOf('Steht an').textContent).toContain('1 überfällig');
    expect(headOf('Warte auf').textContent).toContain('1 überfällig');
    expect(headOf('Todos Arbeit').textContent).toContain('1 überfällig');
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
    name: 'Agent-Sitzungen',
    node: <ClaudeSessionsTile />,
    filled: 'feature/rollen',
    emptyText: /Keine Sitzung in den letzten Tagen/,
    emptyWith: { data: { ...dashboardFixture, sessions: [] } },
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

  it('zeigt eine Codex-Sitzung in „Zuletzt gearbeitet" mit ihrem Detailtext', async () => {
    mount({
      data: {
        ...dashboardFixture,
        recentWork: [
          ...dashboardFixture.recentWork,
          {
            at: stamp(-1, '11:30'),
            kind: 'codex-session' as const,
            title: 'Terraform-Drift geprüft',
            detail: 'Codex-Sitzung, 6 Nachrichten',
            path: null,
            project: 'nyota-auth0-migration',
            scope: null,
          },
        ],
      },
    });
    wrap(<RecentWorkTile />);
    expect(await screen.findByText('Terraform-Drift geprüft')).toBeTruthy();
    expect(screen.getByText('Codex-Sitzung, 6 Nachrichten')).toBeTruthy();
  });

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
    await userEvent.type(screen.getByLabelText('Frage an Gaston'), 'Was weiß ich über X?');
    await userEvent.click(screen.getByRole('button', { name: 'Fragen' }));

    expect(screen.getByTestId('location').textContent).toBe(
      '/ask?q=Was%20wei%C3%9F%20ich%20%C3%BCber%20X%3F',
    );
  });

  it('sagt bei abgeschaltetem Mitlesen beider CLIs, dass es aus ist — nicht „keine Sitzungen"', async () => {
    mount({ overview: { useClaudeSessions: false, useCodexSessions: false } });
    wrap(<ClaudeSessionsTile />);
    expect(
      await screen.findByText('Das Mitlesen der Agent-Sitzungen ist ausgeschaltet.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Keine Sitzung/)).toBeNull();
  });

  it('ist nicht aus, solange nur eine der beiden CLIs abgeschaltet ist', async () => {
    mount({ overview: { useClaudeSessions: false, useCodexSessions: true } });
    wrap(<ClaudeSessionsTile />);
    await screen.findByText('feature/rollen');
    expect(screen.queryByText(/Mitlesen der Agent-Sitzungen ist ausgeschaltet/)).toBeNull();
  });

  it('zeigt eine Codex-Sitzung mit eigenem Agent-Label, getrennt von Claude', async () => {
    mount({ data: { ...dashboardFixture, sessions: [...sessions, codexSession] } });
    wrap(<ClaudeSessionsTile />);

    const codexLabel = await screen.findByText('Codex');
    expect(codexLabel.closest('.sb-line')?.textContent).toContain('Terraform-Drift geprüft');
    /* Die Claude-Sitzungen bleiben mit ihrem eigenen Label stehen. */
    expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0);
  });

  it('ordnet eine Codex-Sitzung über agents:link einem Projekt zu', async () => {
    const linked: { agent: string; projectKey: string; project: string }[] = [];
    mount({
      data: { ...dashboardFixture, sessions: [codexSession] },
      extra: {
        'agents:link': (request) => {
          linked.push(request);
          return undefined;
        },
      },
    });
    wrap(<ClaudeSessionsTile />);

    await userEvent.click(await screen.findByRole('button', { name: 'Projekt zuordnen' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Nyota-Auth0-Infrastructure/ }),
      'hochbeet-bauen',
    );

    await waitFor(() =>
      expect(linked).toEqual([
        {
          agent: 'codex',
          projectKey: 'c:/development/kunde/nyota-auth0-infrastructure',
          project: 'hochbeet-bauen',
        },
      ]),
    );
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
    expect(screen.getByText('3 Befunde')).toBeTruthy();
  });

  it('verkauft einen gestoppten Lauf nicht als aktuelle Befundzahl (021b D5)', async () => {
    mount({
      data: { ...dashboardFixture, healthKnown: true, health: 84, findingCount: 3 },
      extra: {
        'gardener:report': () => ({
          ranAt: '2026-08-22T09:00:00.000Z',
          usedLlm: false,
          complete: false,
          missingStages: ['loose-ends'],
          healthAsOf: '2026-08-20T09:00:00.000Z',
          findings: [],
          health: 84,
          healthKnown: true,
          advice: [],
        }),
      },
    });
    wrap(<GardenerTile />);
    expect(await screen.findByText('84')).toBeTruthy();
    expect(screen.getByText(/Letzte Prüfung gestoppt/)).toBeTruthy();
    expect(screen.queryByText('3 Befunde')).toBeNull();
  });

  it('behauptet nach einer ersten, gestoppten Prüfung keinen Wert (021b)', async () => {
    /* Der Lauf wurde gestoppt, bevor je einer vollständig war: es gibt keinen
       eingefrorenen Wert, also sagt die Kachel „noch nicht geprüft" — statt
       eine Zahl aus einer halben Prüfung zu zeigen. */
    mount({
      data: { ...dashboardFixture, healthKnown: false, health: 0, findingCount: 0 },
      extra: {
        'gardener:report': () => ({
          ranAt: '2026-08-22T09:00:00.000Z',
          usedLlm: false,
          complete: false,
          missingStages: ['audit', 'loose-ends'],
          findings: [],
          health: 0,
          healthKnown: false,
          advice: [],
        }),
      },
    });
    wrap(<GardenerTile />);
    expect(await screen.findByText(/Noch nicht geprüft/)).toBeTruthy();
    expect(screen.queryByText(/Stand/)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('nennt einen Lauf mit Ausschnitt anders als einen gestoppten (021c D5)', async () => {
    mount({
      data: { ...dashboardFixture, healthKnown: true, health: 84, findingCount: 3 },
      extra: {
        'gardener:report': () => ({
          ranAt: '2026-08-22T09:00:00.000Z',
          usedLlm: false,
          complete: false,
          scope: { kinds: ['orphan'] },
          healthAsOf: '2026-08-20T09:00:00.000Z',
          findings: [],
          health: 84,
          healthKnown: true,
          advice: [],
        }),
      },
    });
    wrap(<GardenerTile />);
    /* Der eingefrorene Wert bleibt stehen, mit seinem Datum. */
    expect(await screen.findByText('84')).toBeTruthy();
    expect(screen.getByText(/Stand 20\. Aug\. 2026/)).toBeTruthy();
    /* Der Wortlaut ist der eines Ausschnitts, nicht der eines Abbruchs — und
       die drei Befunde dieses Teillaufs stehen nirgends als aktuelle Zahl. */
    expect(screen.getByText(/Letzte Prüfung: nur Verwaiste Seiten/)).toBeTruthy();
    expect(screen.queryByText(/Letzte Prüfung gestoppt/)).toBeNull();
    expect(screen.queryByText('3 Befunde')).toBeNull();
  });

  it('nennt bei einem Ausschnitt über zwei Arten den Umfang, nicht „gestoppt" (021c review finding 5)', async () => {
    /* Über die reguläre "check only this"-Kontrolle entsteht heute nur ein
       Ein-Art-Umfang, aber die IPC-Vertrag erlaubt mehrere — und die Kachel
       darf dafür nicht auf die Abbruch-Formulierung zurückfallen. */
    mount({
      data: { ...dashboardFixture, healthKnown: true, health: 84, findingCount: 7 },
      extra: {
        'gardener:report': () => ({
          ranAt: '2026-08-22T09:00:00.000Z',
          usedLlm: false,
          complete: false,
          scope: { kinds: ['orphan', 'stale-page'] },
          healthAsOf: '2026-08-20T09:00:00.000Z',
          findings: [],
          health: 84,
          healthKnown: true,
          advice: [],
        }),
      },
    });
    wrap(<GardenerTile />);
    expect(
      await screen.findByText(/Letzte Prüfung: nur Verwaiste Seiten, Angestaubte Seiten/),
    ).toBeTruthy();
    expect(screen.queryByText(/Letzte Prüfung gestoppt/)).toBeNull();
    expect(screen.queryByText('7 Befunde')).toBeNull();
  });

  it('nennt bei einem Modul-Ausschnitt das Modul, nicht die Art', async () => {
    mount({
      data: { ...dashboardFixture, healthKnown: true, health: 84, findingCount: 5 },
      extra: {
        'gardener:report': () => ({
          ranAt: '2026-08-22T09:00:00.000Z',
          usedLlm: false,
          complete: false,
          scope: { module: 'hochbeet' },
          healthAsOf: '2026-08-20T09:00:00.000Z',
          findings: [],
          health: 84,
          healthKnown: true,
          advice: [],
        }),
      },
    });
    wrap(<GardenerTile />);
    expect(await screen.findByText(/Letzte Prüfung: nur Modul hochbeet/)).toBeTruthy();
    expect(screen.queryByText(/Letzte Prüfung gestoppt/)).toBeNull();
    expect(screen.queryByText('5 Befunde')).toBeNull();
  });

  it('lässt bei fehlendem Stand das Datum weg, statt es leer hinzuschreiben', async () => {
    mount({
      data: { ...dashboardFixture, healthKnown: true, health: 84, findingCount: 3 },
      extra: {
        'gardener:report': () => ({
          ranAt: '2026-08-22T09:00:00.000Z',
          usedLlm: false,
          complete: false,
          missingStages: ['loose-ends'],
          findings: [],
          health: 84,
          healthKnown: true,
          advice: [],
        }),
      },
    });
    wrap(<GardenerTile />);
    expect(await screen.findByText('Letzte Prüfung gestoppt')).toBeTruthy();
    expect(screen.queryByText(/Stand/)).toBeNull();
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

// ── „Warte auf" zeigt keine losen Enden mehr (022, D3) ──────────────────────

describe('Warte auf — loses Ende gehört nicht mehr hierher', () => {
  const looseEndReminder: Reminder = {
    id: 'loose-end:abc123',
    source: 'loose-end',
    urgency: 'open',
    title: 'Notartermin',
    date: day(-4),
    daysOut: -4,
    scope: 'private',
    path: `journal/${day(-6).slice(0, 4)}/${day(-6).slice(5, 7)}/${day(-6)}.md`,
    project: null,
    who: null,
  };

  it('zeigt ein loses Ende nicht, auch wenn die Erinnerungs-Liste eins enthält', async () => {
    mount({ extra: { 'reminders:list': () => [...reminders, looseEndReminder] } });
    wrap(<WaitingOnTile />);
    await screen.findByText('Stefan');
    expect(screen.queryByText('Notartermin')).toBeNull();
  });
});

// ── Lose Enden: Link nur bei bekanntem Tag (Story 026, D4) ─────────────────

describe('Lose Enden — Link nur, wenn der Tag feststeht', () => {
  const resolvable: Reminder = {
    id: 'loose-end:resolvable',
    source: 'loose-end',
    urgency: 'open',
    title: 'Notartermin',
    date: day(-4),
    daysOut: -4,
    scope: 'private',
    path: `journal/${day(-6).slice(0, 4)}/${day(-6).slice(5, 7)}/${day(-6)}.md`,
    project: null,
    who: null,
  };

  /* Kein Tagesdatum im Pfad — in einem echten Vault kommt das bei losen Enden
     nicht vor (die Quelle liest immer aus einer Tagesdatei), aber der Code muss
     trotzdem keinen Link auf ein leeres Datum anbieten. */
  const unresolvable: Reminder = {
    id: 'loose-end:unresolvable',
    source: 'loose-end',
    urgency: 'open',
    title: 'Ohne Tagesdatum',
    date: day(-4),
    daysOut: -4,
    scope: 'private',
    path: 'journal/notiz-ohne-datum.md',
    project: null,
    who: null,
  };

  it('bleibt mit bekanntem Tag ein Knopf und springt zum Tageseintrag', async () => {
    mount({ extra: { 'reminders:list': () => [resolvable] } });
    wrap(
      <>
        <LooseEndsTile />
        <Location />
      </>,
    );

    const opener = await screen.findByText('Notartermin');
    expect(opener.tagName).toBe('BUTTON');

    await userEvent.click(opener);
    expect(screen.getByTestId('location').textContent).toBe(`/journal?d=${day(-6)}`);
  });

  it('zeigt den Titel als Text ohne Knopf und ohne Sprung, wenn der Pfad kein Tagesdatum trägt', async () => {
    mount({ extra: { 'reminders:list': () => [unresolvable] } });
    wrap(
      <>
        <LooseEndsTile />
        <Location />
      </>,
    );

    const label = await screen.findByText('Ohne Tagesdatum');
    expect(label.tagName).toBe('SPAN');

    /* Die Zeile behält ihren Knopf für "ruhig stellen" — nur der Titel selbst
       ist keiner mehr, also bleibt genau einer statt zwei übrig. */
    const row = label.closest('.sb-line');
    if (row === null) throw new Error('Zeile ohne Rahmen: Ohne Tagesdatum');
    expect(within(row as HTMLElement).getAllByRole('button')).toHaveLength(1);
    expect(within(row as HTMLElement).queryByRole('link')).toBeNull();

    /* Ein Klick auf den Text tut nichts — kein `?d=` mit leerem Wert. */
    await userEvent.click(label);
    expect(screen.getByTestId('location').textContent).toBe('/');
  });
});

// ── Kommende Erwähnungen: sichtbar, bevor der Tag kommt (Story 070, D3) ─────

describe('Kommende Erwähnungen', () => {
  const mention: Reminder = {
    id: 'loose-end:kommend',
    source: 'upcoming-mention',
    urgency: 'upcoming',
    title: 'Zahnarzttermin',
    date: day(4),
    daysOut: 4,
    scope: 'private',
    path: `journal/${day(-1).slice(0, 4)}/${day(-1).slice(5, 7)}/${day(-1)}.md`,
    project: null,
    who: null,
  };

  it('nennt Zieltag und springt zum Tageseintrag der Ankündigung', async () => {
    mount({ extra: { 'reminders:list': () => [mention] } });
    wrap(
      <>
        <UpcomingMentionsTile />
        <Location />
      </>,
    );

    expect(await screen.findByText(`für ${formatDate(day(4), 'de')}`)).toBeTruthy();

    const opener = screen.getByText('Zahnarzttermin');
    expect(opener.tagName).toBe('BUTTON');

    await userEvent.click(opener);
    expect(screen.getByTestId('location').textContent).toBe(`/journal?d=${day(-1)}`);
  });

  it('zeigt den Leerzustand, solange nichts angekündigt ist', async () => {
    mount({ extra: { 'reminders:list': () => [] } });
    wrap(<UpcomingMentionsTile />);
    expect(
      await screen.findByText('Keine kommende Erwähnung. Noch nichts angekündigt.'),
    ).toBeTruthy();
  });
});

// ── Favoriten in den Projekt-Kacheln (Story 013, D5) ────────────────────────

describe('Favoriten in den Projekt-Kacheln', () => {
  /* Kopiert das erste Fixture-Projekt als Vorlage — nur die für den jeweiligen
     Test wichtigen Felder werden überschrieben. Die Assertion ist sicher: das
     Fixture-Array ist fest und nicht leer. */
  const template = projects[0]!;
  function project(overrides: Partial<Project> & Pick<Project, 'slug' | 'title'>): Project {
    return { ...template, nextStep: null, waitingOn: [], deadline: null, ...overrides };
  }

  it('zeigt einen Favoriten in „Laufende Projekte", auch wenn die Priorität ihn abschneiden würde', async () => {
    const custom: Project[] = [
      project({
        slug: 'p1',
        title: 'Projekt eins',
        status: 'active',
        priority: 1,
        favorite: false,
      }),
      project({
        slug: 'p2',
        title: 'Projekt zwei',
        status: 'active',
        priority: 2,
        favorite: false,
      }),
      project({
        slug: 'p3',
        title: 'Projekt drei',
        status: 'active',
        priority: 3,
        favorite: false,
      }),
      project({
        slug: 'p4',
        title: 'Projekt vier',
        status: 'active',
        priority: 4,
        favorite: false,
      }),
      project({
        slug: 'p5',
        title: 'Favorit hinten',
        status: 'active',
        priority: 5,
        favorite: true,
      }),
      /* Nicht aktiv, aber Favorit: der Aktiv-Filter muss ihn trotzdem aussortieren. */
      project({
        slug: 'p6',
        title: 'Fertiges Projekt',
        status: 'done',
        priority: 1,
        favorite: true,
      }),
    ];
    mount({ extra: { 'projects:list': () => custom } });
    wrap(<ActiveProjectsTile />);

    /* Nach Priorität allein läge „Favorit hinten" (Platz 5) außerhalb der
       sichtbaren vier Zeilen — der Favoritenvorzug muss ihn davor holen. */
    expect(await screen.findByText('Favorit hinten')).toBeTruthy();
    /* Aber die Kachel bleibt bei „aktiv": ein abgeschlossenes Projekt taucht
       nicht auf, egal ob es ein Favorit ist. */
    expect(screen.queryByText('Fertiges Projekt')).toBeNull();
  });

  it('zeigt einen Favoriten in „Stagnierende Projekte", auch wenn die Slug-Reihenfolge ihn abschneiden würde', async () => {
    const slugs = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
    const custom: Project[] = [
      ...slugs.slice(0, 6).map((slug, index) =>
        project({
          slug,
          title: `Stagnierend ${index + 1}`,
          status: 'paused',
          stale: true,
          favorite: false,
          priority: 3,
        }),
      ),
      project({
        slug: 's7',
        title: 'Favorit ganz hinten',
        status: 'paused',
        stale: true,
        favorite: true,
        priority: 3,
      }),
      /* Stagnierend, aber nicht in `staleProjects` gelistet — muss draußen bleiben. */
      project({
        slug: 'nicht-gelistet',
        title: 'Nicht in der Liste',
        status: 'paused',
        stale: true,
        favorite: false,
        priority: 3,
      }),
    ];
    mount({
      data: { ...dashboardFixture, staleProjects: slugs },
      extra: { 'projects:list': () => custom },
    });
    wrap(<StaleProjectsTile />);

    /* Nach der Slug-Reihenfolge allein läge „Favorit ganz hinten" (Platz 7)
       außerhalb der sichtbaren sechs Zeilen. */
    expect(await screen.findByText('Favorit ganz hinten')).toBeTruthy();
    /* Nur was in `staleProjects` steht — ein Favorit erfindet keine Zeile. */
    expect(screen.queryByText('Nicht in der Liste')).toBeNull();
  });
});

/* Der Tag der Fixtures steht fest; sonst prüft der Test morgen etwas anderes. */
describe('Fixtures', () => {
  it('rechnet gegen einen festen Tag', () => {
    expect(TODAY).toBe('2026-08-10');
    expect(dashboardFixture.todos.work[0]?.dueInDays).toBeLessThan(0);
  });
});
