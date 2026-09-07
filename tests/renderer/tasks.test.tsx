// @vitest-environment jsdom
/* Der Aufgaben-Screen (Story 072, D4): drei feste Gruppen statt einer Liste.
 *
 * Geprueft wird:
 * - AC3: jede Gruppe steht unter ihrer eigenen Ueberschrift, mit dem Inhalt,
 *   den ihr Zustand verlangt — laufend zeigt Art, Betreff, Fortschritt und
 *   verstrichene Zeit; wartend die Warteschlangenposition; abgeschlossen das
 *   Ergebnis und die Dauer.
 * - AC7: eine leere Warteschlange zeigt den Leerzustand, nie einen Spinner —
 *   und den Leerzustand auch nicht, bevor die erste Antwort ueberhaupt da ist.
 * - AC8: ein Akzent, Satzfall, kein Emoji, keine rohe Tailwind-Palettenklasse —
 *   per Quellcode-Scan plus axe-core ueber den gerenderten Baum.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { WorkTask } from '@shared/types';
import { TasksScreen } from '@renderer/screens/tasks/TasksScreen';
import { setLanguage } from '@renderer/i18n';
import { deTasks } from '@renderer/i18n/de-tasks';
import { enTasks } from '@renderer/i18n/en-tasks';
import { resetWorkTasksStoreForTests } from '@renderer/lib/tasks-store';
import type { SbBridge } from '@renderer/lib/bridge';

const NOW = '2026-08-10T14:32:00+02:00';

type SbHandlers = {
  [K in IpcChannel]?: (payload: IpcRequest<K>) => IpcResponse<K> | unknown;
};

/** `window.sb` als Attrappe. Was fehlt, wird zum IpcError — nie zu Stille. */
function installSbMock(handlers: SbHandlers): void {
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) {
      throw Object.assign(new Error(`kein Handler fuer ${channel}`), { code: 'invalid' });
    }
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

async function expectNoA11yViolations(container: Element): Promise<void> {
  const result = await axe.run(container, { resultTypes: ['violations'] });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

function freezeTime(): void {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
}

function task(patch: Partial<WorkTask> & { id: string; state: WorkTask['state'] }): WorkTask {
  return {
    kind: 'condense',
    lane: 'model',
    subject: { label: 'Bereich Wachstum', ref: null },
    progress: 0,
    message: null,
    hasResult: false,
    error: null,
    queuePosition: null,
    queuedAt: NOW,
    startedAt: null,
    finishedAt: null,
    ...patch,
  };
}

/* Renders the current address, the same helper `garden.test.tsx` uses — D7
   adds `TaskRow`'s own `useNavigate()` call (the "view result" action), so
   this screen now needs a router in its test tree too. */
function Location() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {node}
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('de');
  /* 072 review, finding 5: `tasks-store.ts` holds its "answered yet?" flag as
     module state outside React (071/072, D3/D4), exactly like
     `gardener-progress.ts` does for the maintenance run. Without a reset, a
     test after another that already populated the queue would find `loaded`
     already `true` and could never observe the pre-first-answer gap (AC7)
     below — this used to be papered over by making that test run first in
     the file; `--sequence.shuffle` proved that fragile. */
  resetWorkTasksStoreForTests();
});

describe('Aufgaben', () => {
  it('zeigt bei einer leeren Warteschlange den Leerzustand statt eines Spinners, aber nie vor der ersten Antwort (AC7)', async () => {
    /* Ein Objekt statt eines eigenen `let`: eine Zuweisung aus einer verschachtelten
       Closure heraus an eine `let`-Variable verengt sie in TS manchmal auf `never`
       (bekannte CFA-Falle) — eine Objekteigenschaft ist davon nicht betroffen. */
    const box: { resolve: ((tasks: WorkTask[]) => void) | null } = { resolve: null };
    installSbMock({
      'work:list': () =>
        new Promise<WorkTask[]>((resolve) => {
          box.resolve = resolve;
        }),
    });

    wrap(<TasksScreen />);

    // Solange `work:list` nicht geantwortet hat: weder Leerzustand noch Spinner.
    expect(screen.queryByText('Noch keine Aufgabe in Sicht')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.querySelector('.gs-spin')).toBeNull();

    box.resolve?.([]);

    await waitFor(() => expect(screen.getByText('Noch keine Aufgabe in Sicht')).toBeTruthy());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.querySelector('.gs-spin')).toBeNull();
  });

  it('zeigt jede Gruppe unter ihrer eigenen Ueberschrift mit dem passenden Inhalt (AC3)', async () => {
    freezeTime();
    const running = task({
      id: 'run-1',
      kind: 'condense',
      state: 'running',
      progress: 0.42,
      startedAt: new Date(Date.parse(NOW) - 65_000).toISOString(),
      subject: { label: 'Projekt Umzug', ref: null },
    });
    const waiting = task({
      id: 'wait-1',
      kind: 'ingest',
      state: 'queued',
      queuePosition: 2,
      subject: { label: 'Video ueber Migration', ref: null },
    });
    const finishedFailed = task({
      id: 'fin-fail',
      kind: 'gardener',
      state: 'failed',
      startedAt: NOW,
      finishedAt: new Date(Date.parse(NOW) + 90_000).toISOString(),
      subject: { label: 'Pflegelauf', ref: null },
    });
    const finishedDone = task({
      id: 'fin-done',
      kind: 'close-day',
      state: 'done',
      startedAt: NOW,
      finishedAt: new Date(Date.parse(NOW) + 30_000).toISOString(),
      subject: { label: 'Tag 2026-08-10', ref: null },
    });

    installSbMock({
      'work:list': () => [running, waiting, finishedFailed, finishedDone],
      'tasks:cancel': () => true,
      'tasks:remove': () => true,
      'tasks:retry': () => null,
    });

    wrap(<TasksScreen />);

    expect(await screen.findByRole('heading', { name: 'Läuft' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Wartet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Abgeschlossen' })).toBeTruthy();

    // Laufend: Art, Betreff, Fortschritt (Balken + Prozent), verstrichene Zeit.
    expect(screen.getByText('Projekt Umzug')).toBeTruthy();
    expect(screen.getByText('42 %')).toBeTruthy();
    expect(screen.getByText('1:05')).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByRole('button', { name: 'Stoppen' })).toBeTruthy();

    // Wartend: Betreff und Warteschlangenposition.
    expect(screen.getByText('Video ueber Migration')).toBeTruthy();
    expect(screen.getByText('Platz 2 in der Warteschlange')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeTruthy();

    // Abgeschlossen: Ergebnis (Fehlgeschlagen -> Wiederholen-Knopf; Erledigt -> keiner)
    // und Dauer.
    expect(screen.getByText('Fehlgeschlagen')).toBeTruthy();
    expect(screen.getByText('Erledigt')).toBeTruthy();
    expect(screen.getByText('1m')).toBeTruthy();
    expect(screen.getByText('<1m')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
  });

  it('zeigt bei einem erledigten Lauf mit Ergebnis „Ergebnis ansehen“ und navigiert dorthin (073, D7)', async () => {
    freezeTime();
    const finishedWithResult = task({
      id: 'fin-result',
      kind: 'condense',
      state: 'done',
      startedAt: NOW,
      finishedAt: NOW,
      hasResult: true,
      subject: { label: 'kunden-und-team', ref: 'area:kunden-und-team' },
    });
    const finishedWithoutResult = task({
      id: 'fin-no-result',
      kind: 'gardener',
      state: 'done',
      startedAt: NOW,
      finishedAt: NOW,
      hasResult: false,
      subject: { label: 'Pflegelauf', ref: null },
    });

    installSbMock({
      'work:list': () => [finishedWithResult, finishedWithoutResult],
    });

    wrap(<TasksScreen />);

    expect(await screen.findByText('kunden-und-team')).toBeTruthy();
    // A finished run with no result (gardener, story 074's concern) offers no button.
    const gardenerRow = screen.getByText('Pflegelauf').closest('.sb-trow');
    expect(gardenerRow).not.toBeNull();
    expect(
      gardenerRow ? within(gardenerRow as HTMLElement).queryByRole('button') : null,
    ).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Ergebnis ansehen' }));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/notes?a=kunden-und-team&tab=condensed',
      ),
    );
  });

  it('hat keinen A11y-Verstoss', async () => {
    installSbMock({
      'work:list': () => [
        task({ id: 'run-1', state: 'running', progress: 0.5, startedAt: NOW }),
        task({
          id: 'wait-1',
          state: 'queued',
          queuePosition: 1,
          subject: { label: 'Wartender Vorgang', ref: null },
        }),
        task({
          id: 'fin-1',
          state: 'failed',
          startedAt: NOW,
          finishedAt: NOW,
          subject: { label: 'Fehlgeschlagener Vorgang', ref: null },
        }),
      ],
    });

    const { container } = wrap(<TasksScreen />);
    await screen.findByRole('heading', { name: 'Läuft' });
    await expectNoA11yViolations(container);
  });

  /* 072 review, finding 4: the original single test only globbed the screens'
     `.tsx` sources. It never read `tasks.css` — the file that actually owns
     every colour on this screen, so a second `var(--accent)` added there
     would have passed undetected — and never scanned `de-tasks.ts`/
     `en-tasks.ts`, where the user-visible strings actually live (an emoji or
     a capitalization slip in a translated string can't show up in a `.tsx`
     scan at all). Split into named sub-checks so each source a violation
     could hide in has its own, independently-failing assertion. */
  describe('ein Akzent, Satzfall, kein Emoji, keine rohe Tailwind-Palettenklasse (AC8)', () => {
    /* Wie `i18n.test.ts`: die Quelltexte kommen als Rohtext ueber Vite herein,
       kein `node:fs` — das Renderer-Tsconfig kennt keine Node-Typen, und ein
       echter Dateizugriff waere ohnehin kein Anliegen dieses Tests. */
    const SCREEN_SOURCES: Record<string, string> = import.meta.glob(
      '../../src/renderer/screens/tasks/*.tsx',
      { query: '?raw', import: 'default', eager: true },
    );
    /* Vitest stubs `.css` imports to an empty module by default, `?raw`
       included — `vitest.config.ts`'s `test.css.include` opts this one file
       back into real processing so this glob actually reads its content,
       rather than every `.css` file's colours going untested. */
    const CSS_SOURCES: Record<string, string> = import.meta.glob(
      '../../src/renderer/styles/app/tasks.css',
      { query: '?raw', import: 'default', eager: true },
    );

    const RAW_PALETTE =
      /\b(?:bg|text|border|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    /* 072 review cycle 2, finding 3: `tasks.css` owns every colour on this
       screen but was never scanned for a raw hex value — a class-name regex
       does not apply to a stylesheet, so the check there is "no non-token
       colour literal", not the Tailwind-class pattern above. */
    const RAW_HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    it('hat in keiner Screen-Quelle eine rohe Tailwind-Palettenklasse', () => {
      expect(Object.keys(SCREEN_SOURCES).length).toBeGreaterThan(0);
      for (const [path, source] of Object.entries(SCREEN_SOURCES)) {
        expect(source, `${path}: rohe Tailwind-Palettenklasse`).not.toMatch(RAW_PALETTE);
      }
    });

    it('hat in tasks.css keine rohe Hex-Farbe — nur Tokens', () => {
      expect(Object.keys(CSS_SOURCES).length).toBeGreaterThan(0);
      for (const [path, source] of Object.entries(CSS_SOURCES)) {
        expect(source, `${path}: rohe Hex-Farbe statt Token`).not.toMatch(RAW_HEX_COLOR);
      }
    });

    it('hat weder in den Screen-Quellen noch in den i18n-Texten ein Emoji', () => {
      for (const [path, source] of Object.entries(SCREEN_SOURCES)) {
        expect(source, `${path}: Emoji`).not.toMatch(EMOJI);
      }
      for (const [key, value] of Object.entries(deTasks)) {
        expect(value, `deTasks.${key}: Emoji`).not.toMatch(EMOJI);
      }
      for (const [key, value] of Object.entries(enTasks)) {
        expect(value, `enTasks.${key}: Emoji`).not.toMatch(EMOJI);
      }
    });

    it('traegt genau einen Akzent (--accent) ueber CSS und Screen-Quellen zusammen', () => {
      // Der eine Akzent gehoert dem Fortschrittsbalken der laufenden Gruppe
      // (`sb-trow-fill`, dessen CSS `var(--accent)` traegt — `tasks.css`) —
      // kein `variant="primary"`-Knopf auf diesem Screen konkurriert damit,
      // und kein zweites `var(--accent...)` irgendwo sonst in css oder tsx.
      expect(Object.keys(CSS_SOURCES).length).toBeGreaterThan(0);
      // 072 review cycle 2, finding 2: `(?:-\w+)?` only matched one hyphen
      // segment, so a real Gaston token like `--accent-soft-border` (two
      // hyphenated segments) slipped past uncounted. `[-\w]*` matches any
      // number of them.
      const ACCENT_VAR = /var\(--accent[-\w]*\)/g;
      const combined = [...Object.values(CSS_SOURCES), ...Object.values(SCREEN_SOURCES)].join('\n');
      const accentUses = combined.match(ACCENT_VAR) ?? [];
      expect(accentUses, 'genau ein var(--accent...) ueber css+tsx zusammen').toHaveLength(1);

      let usesFillClass = false;
      for (const [path, source] of Object.entries(SCREEN_SOURCES)) {
        expect(source, `${path}: primary-Button waere ein zweiter Akzent`).not.toMatch(
          /variant=["']primary["']/,
        );
        if (source.includes('sb-trow-fill')) usesFillClass = true;
      }
      expect(usesFillClass, 'der Fortschrittsbalken der laufenden Gruppe fehlt').toBe(true);
    });

    /* No sentence-case check exists anywhere else in the suite to reuse
       (checked `i18n.test.ts` and every other renderer test) — the heuristic
       below is scoped to English only, on purpose: German legitimately
       capitalizes every noun mid-sentence, so a language-blind check would
       flag correct German text as a violation. It resets at sentence
       boundaries ('. '/'! '/'? ') so a new sentence's first word never
       trips it, and skips placeholders (`{subject}`) and all-caps
       acronyms. */
    it('haelt Satzfall in den englischen i18n-Texten ein', () => {
      const MID_SENTENCE_CAPITAL = /\S/;
      for (const [key, value] of Object.entries(enTasks)) {
        for (const sentence of value.split(/(?<=[.!?])\s+/)) {
          const words = sentence.split(/\s+/).filter((word) => MID_SENTENCE_CAPITAL.test(word));
          for (const word of words.slice(1)) {
            const bare = word.replace(/[.,!?;:]+$/, '');
            const isPlaceholder = bare.startsWith('{');
            const isAcronym = bare.length > 1 && bare === bare.toUpperCase();
            const isTitleCaseWord = /^[A-Z][a-z]/.test(bare);
            expect(
              isTitleCaseWord && !isPlaceholder && !isAcronym,
              `enTasks.${key}: „${bare}“ liest sich wie Title Case statt Satzfall („${value}“)`,
            ).toBe(false);
          }
        }
      }
    });
  });
});
