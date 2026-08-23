// @vitest-environment jsdom
/* `MonthCalendar` (010, D1) — the month grid next to the day list.
 *
 * The behaviour worth pinning down is not "renders a table" but the three
 * rules the story is actually about:
 *
 * - **Today and selected are never the same visual claim.** A day can be
 *   either, both, or neither, and the grid has to keep them distinguishable
 *   even when they coincide.
 * - **A future day is only unselectable while it has no file.** The moment a
 *   file exists — however it got there — the day is history and clickable
 *   again, per the story's decision.
 * - **Both UI languages resolve real text**, not the raw `journal.calendar.*`
 *   key: caught here by asserting the *localized* caption, which would only
 *   ever equal the key itself if `t()` fell through.
 *
 * `journal.test.tsx` already carries this file's `expectNoViolations`
 * helper; kept as a local copy here on purpose — a presentational component
 * test has no reason to depend on the screen test's IPC mock scaffolding. */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IpcChannel,
  IpcEventName,
  IpcEvents,
  IpcRequest,
  IpcResponse,
  JournalDayView,
} from '@shared/ipc';
import type {
  JournalDay,
  Project,
  ProviderConfig,
  Routing,
  SettingsSnapshot,
  TaskDefinition,
  VaultDoc,
} from '@shared/types';
import { MonthCalendar } from '@renderer/components/MonthCalendar';
import { JournalScreen } from '@renderer/screens/journal/JournalScreen';
import type { SbBridge } from '@renderer/lib/bridge';
import { wireEvents } from '@renderer/lib/events';
import { monthCells, monthOf, shiftMonth } from '@renderer/lib/month-calendar';
import { setLanguage } from '@renderer/i18n';

async function expectNoViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

function day(overrides: Partial<JournalDay> & { date: string }): JournalDay {
  return {
    path: `journal/${overrides.date}.md`,
    title: overrides.date,
    closed: null,
    mood: null,
    energy: null,
    people: [],
    projects: [],
    tags: [],
    excerpt: '',
    wordCount: 0,
    turns: 0,
    ...overrides,
  };
}

describe('monthOf', () => {
  it('reads the year-month key off a full date', () => {
    expect(monthOf('2026-08-19')).toBe('2026-08');
  });
});

describe('shiftMonth', () => {
  it('steps forward and backward within a year', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
  });

  it('wraps into the next year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('wraps into the previous year', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('monthCells', () => {
  const today = '2026-08-19';

  it('always returns six full weeks, padded with the neighbouring months', () => {
    const cells = monthCells('2026-08', [], today, today);
    expect(cells).toHaveLength(42);
    // 1 Aug 2026 is a Saturday: Monday-first padding covers five days before it.
    expect(cells.slice(0, 5).every((cell) => cell.padding)).toBe(true);
    expect(cells.some((cell) => !cell.padding)).toBe(true);
  });

  it('attaches the matching entry to an in-month day that has a file', () => {
    const days = [day({ date: '2026-08-10', wordCount: 42 })];
    const cells = monthCells('2026-08', days, today, today);
    const withEntry = cells.find((cell) => cell.date === '2026-08-10');
    const withoutEntry = cells.find((cell) => cell.date === '2026-08-11');
    expect(withEntry?.day?.wordCount).toBe(42);
    expect(withoutEntry?.day).toBeNull();
  });

  it('tells today and selected apart even when they differ', () => {
    const cells = monthCells('2026-08', [], today, '2026-08-10');
    const todayCell = cells.find((cell) => cell.date === today);
    const selectedCell = cells.find((cell) => cell.date === '2026-08-10');
    expect(todayCell?.isToday).toBe(true);
    expect(todayCell?.isSelected).toBe(false);
    expect(selectedCell?.isSelected).toBe(true);
    expect(selectedCell?.isToday).toBe(false);
  });

  it('disables a future day that has no file', () => {
    const cells = monthCells('2026-08', [], today, today);
    const future = cells.find((cell) => cell.date === '2026-08-25');
    expect(future?.disabled).toBe(true);
  });

  it('keeps a future day selectable once it has a file — a written day is history', () => {
    const days = [day({ date: '2026-08-25' })];
    const cells = monthCells('2026-08', days, today, today);
    const future = cells.find((cell) => cell.date === '2026-08-25');
    expect(future?.disabled).toBe(false);
  });

  /* 010, D4 — `unfinished` is `isDayOpen` applied per cell: a past day with a
     file and `closed: null`, never today, never a dayless cell. */
  describe('unfinished', () => {
    it('marks a past day with a file and no closed value', () => {
      const days = [day({ date: '2026-08-10', closed: null })];
      const cells = monthCells('2026-08', days, today, today);
      expect(cells.find((cell) => cell.date === '2026-08-10')?.unfinished).toBe(true);
    });

    it('never marks today, even with closed: null', () => {
      const days = [day({ date: today, closed: null })];
      const cells = monthCells('2026-08', days, today, today);
      expect(cells.find((cell) => cell.date === today)?.unfinished).toBe(false);
    });

    it('does not mark a past day that was closed', () => {
      const days = [day({ date: '2026-08-10', closed: '2026-08-10' })];
      const cells = monthCells('2026-08', days, today, today);
      expect(cells.find((cell) => cell.date === '2026-08-10')?.unfinished).toBe(false);
    });

    it('does not mark a day without a file', () => {
      const cells = monthCells('2026-08', [], today, today);
      expect(cells.find((cell) => cell.date === '2026-08-10')?.unfinished).toBe(false);
    });
  });
});

describe('MonthCalendar', () => {
  beforeEach(() => {
    setLanguage('en');
    document.documentElement.lang = 'en';
  });

  function renderGrid(overrides: Partial<Parameters<typeof MonthCalendar>[0]> = {}) {
    const onSelect = vi.fn();
    const onMonth = vi.fn();
    const onToggleCollapse = vi.fn();
    const view = render(
      <MonthCalendar
        days={[]}
        today="2026-08-19"
        selected="2026-08-19"
        onSelect={onSelect}
        month="2026-08"
        onMonth={onMonth}
        collapsed={false}
        onToggleCollapse={onToggleCollapse}
        {...overrides}
      />,
    );
    return { ...view, onSelect, onMonth, onToggleCollapse };
  }

  it('shows the month and year caption from Intl, and a Monday-first weekday header', () => {
    renderGrid({ month: '2026-01' });

    expect(screen.getByText('January 2026')).toBeTruthy();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('calls onSelect when a day cell is clicked', async () => {
    const { onSelect } = renderGrid();

    await userEvent.click(screen.getByRole('button', { name: 'Open the calendar day 2026-08-10' }));

    expect(onSelect).toHaveBeenCalledWith('2026-08-10');
  });

  it('does not call onSelect for a future day without an entry', async () => {
    const { onSelect } = renderGrid();

    const future = screen.getByRole('button', { name: /2026-08-25/ });
    expect(future.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(future);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps a future day with an entry clickable', async () => {
    const days = [day({ date: '2026-08-25' })];
    const { onSelect } = renderGrid({ days });

    const future = screen.getByRole('button', { name: 'Open the calendar day 2026-08-25' });
    expect(future.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(future);

    expect(onSelect).toHaveBeenCalledWith('2026-08-25');
  });

  it('exposes the collapse toggle via aria-expanded and calls onToggleCollapse', async () => {
    const { onToggleCollapse } = renderGrid({ collapsed: false });

    const toggle = screen.getByRole('button', { name: 'Collapse the calendar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(toggle);

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('hides the day grid body while collapsed, keeping month navigation reachable', () => {
    renderGrid({ collapsed: true });

    expect(screen.getByText('August 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand the calendar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open the calendar day 2026-08-10' })).toBeNull();
    /* The weekday header row (`<thead>`) collapses along with the day grid
       body — only the month caption stays visible while collapsed. */
    expect(screen.queryByRole('columnheader')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderGrid();
    await expectNoViolations(container);
  });

  it('resolves real text in both UI languages, not the raw translation key', () => {
    setLanguage('de');
    document.documentElement.lang = 'de';
    renderGrid({ month: '2026-01' });
    expect(screen.getByText('Januar 2026')).toBeTruthy();
    expect(screen.queryByText('journal.calendar.title', { exact: false })).toBeNull();

    setLanguage('en');
    document.documentElement.lang = 'en';
  });
});

/* 010, D4 — the "unfinished" marker: a past day with a file and still
 * `closed: null`, straight from `isDayOpen`. Rendered as a sibling of the
 * mood/entry dot inside `.sb-monthcal-markers`, never replacing it. */
describe('MonthCalendar unfinished marker (010, D4)', () => {
  const TODAY = '2026-08-19';

  beforeEach(() => {
    setLanguage('en');
    document.documentElement.lang = 'en';
  });

  function renderWith(days: JournalDay[]) {
    return render(
      <MonthCalendar
        days={days}
        today={TODAY}
        selected={TODAY}
        onSelect={vi.fn()}
        month="2026-08"
        onMonth={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
  }

  it('shows the marker, with a non-color-only cue, on a past open day', () => {
    renderWith([day({ date: '2026-08-10', closed: null })]);

    const cell = screen.getByRole('button', { name: 'Open the calendar day 2026-08-10' });
    const marker = cell.querySelector('.sb-monthcal-unfinished');
    expect(marker).not.toBeNull();
    // Not color-only: the marker carries its own tooltip/accessible text.
    expect(marker?.getAttribute('title')).toBe('Day not closed out yet');
  });

  it('never shows the marker on today, even when closed is null', () => {
    renderWith([day({ date: TODAY, closed: null })]);

    const cell = screen.getByRole('button', { name: `Open the calendar day ${TODAY}` });
    expect(cell.querySelector('.sb-monthcal-unfinished')).toBeNull();
  });

  it('does not show the marker on a past day that was closed', () => {
    renderWith([day({ date: '2026-08-10', closed: '2026-08-10' })]);

    const cell = screen.getByRole('button', { name: 'Open the calendar day 2026-08-10' });
    expect(cell.querySelector('.sb-monthcal-unfinished')).toBeNull();
  });

  it('does not show the marker on a day without a file', () => {
    renderWith([]);

    const cell = screen.getByRole('button', { name: 'Open the calendar day 2026-08-10' });
    expect(cell.querySelector('.sb-monthcal-unfinished')).toBeNull();
  });

  it('has no accessibility violations with the marker present', async () => {
    const { container } = renderWith([day({ date: '2026-08-10', closed: null })]);
    await expectNoViolations(container);
  });

  it('renders the marker label in both UI languages', () => {
    setLanguage('de');
    document.documentElement.lang = 'de';
    renderWith([day({ date: '2026-08-10', closed: null })]);
    const cellDe = screen.getByRole('button', { name: 'Kalendertag 2026-08-10 öffnen' });
    expect(cellDe.querySelector('.sb-monthcal-unfinished')?.getAttribute('title')).toBe(
      'Tag noch nicht abgeschlossen',
    );

    setLanguage('en');
    document.documentElement.lang = 'en';
  });
});

/* 010, D3 — the grid's own keyboard surface.
 *
 * Controlled on purpose: month and selection live in the parent on the real
 * screen (D2), and half of what D3 does — walking over a month's edge, paging
 * without selecting — is only observable once the prop actually comes back
 * changed. `state` renders both so every assertion can name them together. */
describe('MonthCalendar keyboard (010, D3)', () => {
  const TODAY = '2026-08-19';

  beforeEach(() => {
    setLanguage('en');
    document.documentElement.lang = 'en';
  });

  function Harness({
    days = [],
    selected: initial = TODAY,
  }: {
    days?: JournalDay[];
    selected?: string;
  }) {
    const [month, setMonth] = useState(monthOf(initial));
    const [selected, setSelected] = useState(initial);
    return (
      <>
        <MonthCalendar
          days={days}
          today={TODAY}
          selected={selected}
          onSelect={setSelected}
          month={month}
          onMonth={setMonth}
          collapsed={false}
          onToggleCollapse={() => undefined}
        />
        <span data-testid="state">{`${month} ${selected}`}</span>
      </>
    );
  }

  /** The day cell for a date — through `data-date`, the anchor the component
      carries for exactly this. */
  function cellOf(dateIso: string): HTMLElement {
    const cell = document.querySelector<HTMLElement>(`.sb-monthcal-day[data-date="${dateIso}"]`);
    if (cell === null) throw new Error(`no calendar cell for ${dateIso}`);
    return cell;
  }

  /** The dates of every cell that is a tab stop — expected to be exactly one. */
  function tabStops(): (string | null)[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.sb-monthcal-day'))
      .filter((cell) => cell.getAttribute('tabindex') === '0')
      .map((cell) => cell.getAttribute('data-date'));
  }

  function focusedDate(): string | null {
    return document.activeElement?.getAttribute('data-date') ?? null;
  }

  function state(): string {
    return screen.getByTestId('state').textContent ?? '';
  }

  it('offers exactly one tab stop into the grid, and moves it with the arrows', async () => {
    render(<Harness days={[day({ date: '2026-08-20' })]} />);

    expect(tabStops()).toEqual([TODAY]);
    /* From the last control above the grid, one Tab reaches the grid — and the
       next one leaves it again. Forty-two day cells, one stop. */
    screen.getByRole('button', { name: 'Collapse the calendar' }).focus();
    await userEvent.tab();
    expect(focusedDate()).toBe(TODAY);
    await userEvent.tab();
    expect(focusedDate()).toBeNull();

    cellOf(TODAY).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tabStops()).toEqual(['2026-08-20']);
  });

  it('moves a day sideways and selects while doing it', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedDate()).toBe('2026-08-18');
    expect(state()).toBe('2026-08 2026-08-18');

    await userEvent.keyboard('{ArrowRight}');
    expect(focusedDate()).toBe(TODAY);
    expect(state()).toBe(`2026-08 ${TODAY}`);
  });

  it('moves a week vertically and selects while doing it', async () => {
    render(<Harness days={[day({ date: '2026-08-26' })]} />);
    cellOf(TODAY).focus();

    await userEvent.keyboard('{ArrowUp}');
    expect(focusedDate()).toBe('2026-08-12');
    expect(state()).toBe('2026-08 2026-08-12');

    await userEvent.keyboard('{ArrowDown}');
    expect(focusedDate()).toBe(TODAY);
    /* Forward past today only works onto a day that has a file — 26 Aug does. */
    await userEvent.keyboard('{ArrowDown}');
    expect(focusedDate()).toBe('2026-08-26');
    expect(state()).toBe('2026-08 2026-08-26');
  });

  it('pages the shown month when an arrow walks over its edge, and carries the focus along', async () => {
    render(
      <Harness
        days={[day({ date: '2026-08-31' }), day({ date: '2026-09-01' })]}
        selected="2026-08-01"
      />,
    );
    cellOf('2026-08-01').focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(state()).toBe('2026-07 2026-07-31');
    expect(focusedDate()).toBe('2026-07-31');

    await userEvent.keyboard('{ArrowRight}');
    expect(state()).toBe('2026-08 2026-08-01');
    expect(focusedDate()).toBe('2026-08-01');

    /* And over the other edge, onto a backfilled September day. */
    await userEvent.click(cellOf('2026-08-31'));
    await userEvent.keyboard('{ArrowRight}');
    expect(state()).toBe('2026-09 2026-09-01');
    expect(focusedDate()).toBe('2026-09-01');
  });

  it('switches the month with page up and down without moving the selection', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    await userEvent.keyboard('{PageUp}');
    expect(state()).toBe(`2026-07 ${TODAY}`);
    expect(focusedDate()).toBe('2026-07-19');

    await userEvent.keyboard('{PageDown}');
    expect(state()).toBe(`2026-08 ${TODAY}`);
    expect(focusedDate()).toBe(TODAY);
  });

  it('clamps the day when the paged month is shorter', async () => {
    render(<Harness selected="2026-01-31" />);
    cellOf('2026-01-31').focus();

    await userEvent.keyboard('{PageDown}');

    expect(state()).toBe('2026-02 2026-01-31');
    expect(focusedDate()).toBe('2026-02-28');
  });

  it('jumps to the first and the last day of the shown month with home and end', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    await userEvent.keyboard('{Home}');
    expect(focusedDate()).toBe('2026-08-01');

    await userEvent.keyboard('{End}');
    expect(focusedDate()).toBe('2026-08-31');
    /* Both are navigation, not a choice: the month's edge may well be a day
       that cannot be opened at all (31 Aug is ahead and has no file), and
       neither key claims to have picked it. */
    expect(state()).toBe(`2026-08 ${TODAY}`);
  });

  it('opens the focused day with enter and with space, exactly like a click', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    /* Home moves the focus off the selection without selecting, so what Enter
       opens is provably the focused day and not the old one. */
    await userEvent.keyboard('{Home}');
    expect(state()).toBe(`2026-08 ${TODAY}`);
    await userEvent.keyboard('{Enter}');
    expect(state()).toBe('2026-08 2026-08-01');

    await userEvent.keyboard('{PageUp}');
    expect(state()).toBe('2026-07 2026-08-01');
    await userEvent.keyboard(' ');
    expect(state()).toBe('2026-07 2026-07-01');
  });

  it('steps over a future day without an entry instead of landing on it', async () => {
    render(<Harness days={[day({ date: '2026-08-22' })]} />);
    cellOf(TODAY).focus();

    await userEvent.keyboard('{ArrowRight}');

    /* 20 and 21 August lie ahead and have no file: not a tab stop, not
       selectable, and not landed on either. */
    expect(cellOf('2026-08-20').getAttribute('aria-disabled')).toBe('true');
    expect(cellOf('2026-08-20').getAttribute('tabindex')).toBe('-1');
    expect(focusedDate()).toBe('2026-08-22');
    expect(state()).toBe('2026-08 2026-08-22');
  });

  it('stays put when there is no openable day ahead at all', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(focusedDate()).toBe(TODAY);
    expect(state()).toBe(`2026-08 ${TODAY}`);
  });

  it('does nothing while a scrim covers the screen, the same guard the global handler uses', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    const scrim = document.createElement('div');
    scrim.className = 'gs-scrim';
    document.body.appendChild(scrim);
    try {
      await userEvent.keyboard('{ArrowRight}');
      expect(focusedDate()).toBe(TODAY);
      expect(state()).toBe(`2026-08 ${TODAY}`);
    } finally {
      scrim.remove();
    }
  });

  it('keeps a wholly future month reachable — by page key and by chevron', async () => {
    render(<Harness />);
    cellOf(TODAY).focus();

    /* Every day of September lies ahead and has no file, so none of them can be
       opened — but one still has to hold the tab stop, or there would be no way
       to page back out by keyboard. Paged by key, that is the day the focus
       came from. */
    await userEvent.keyboard('{PageDown}');
    expect(state()).toBe(`2026-09 ${TODAY}`);
    expect(tabStops()).toEqual(['2026-09-19']);
    expect(focusedDate()).toBe('2026-09-19');
    await userEvent.keyboard('{PageUp}');
    expect(state()).toBe(`2026-08 ${TODAY}`);

    /* Paged with the chevron, nothing has named a day in the new month: the
       stop falls back to its 1st — and the focus stays on the chevron, because
       a plain re-render never pulls it into the grid. */
    const next = screen.getByRole('button', { name: 'Next month' });
    await userEvent.click(next);
    expect(tabStops()).toEqual(['2026-09-01']);
    expect(document.activeElement).toBe(next);
  });
});

/* 010, D2 — `MonthCalendar` wired into `JournalScreen`.
 *
 * This block runs `JournalScreen` itself rather than the bare component: the
 * point of D2 is that a calendar click goes through the exact same `select`
 * path a day-list click does (URL, pending/applied/textSaved reset), and that
 * relationship only exists at the screen level. The IPC mock harness below is
 * a trimmed copy of `tests/renderer/journal.test.tsx`'s — same shape, fewer
 * fixtures — kept local so this file doesn't depend on that one's internals. */
describe('MonthCalendar wired into JournalScreen (010, D2)', () => {
  type Handlers = Partial<{
    [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
  }>;

  interface Mock {
    calls: { channel: IpcChannel; payload: unknown }[];
    emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void;
    payloadsOf(channel: IpcChannel): unknown[];
  }

  function installMock(handlers: Handlers): Mock {
    const calls: { channel: IpcChannel; payload: unknown }[] = [];
    const listeners = new Map<string, Set<(payload: never) => void>>();
    const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
      calls.push({ channel, payload });
      const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
      if (!handler)
        throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
      return handler(payload);
    });
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

    return {
      calls,
      emit: (event, payload) => {
        act(() => {
          for (const callback of listeners.get(event) ?? []) {
            (callback as (value: unknown) => void)(payload);
          }
        });
      },
      payloadsOf: (channel) =>
        calls.filter((entry) => entry.channel === channel).map((entry) => entry.payload),
    };
  }

  const NOW = new Date('2026-08-10T18:40:00+02:00');
  const TODAY = '2026-08-10';
  const DAY_PATH = 'journal/2026/08/2026-08-10.md';
  /* Same month as today, so both are visible without paging the grid. */
  const EARLIER = '2026-08-06';
  const EARLIER_PATH = `journal/2026/08/${EARLIER}.md`;
  /* Past, no file — clickable (only a future day without a file is disabled)
     and the case D2's "never writes by browsing" rule is actually about. */
  const EMPTY_PAST = '2026-08-05';
  /* A day with no file at mount time, given one later via `event:vault-changed`. */
  const LATER_ADDED = '2026-08-03';

  const project: Project = {
    path: 'projects/work/kundenportal-relaunch/project.md',
    slug: 'kundenportal-relaunch',
    title: 'Kundenportal Relaunch',
    scope: 'work',
    status: 'active',
    priority: 1,
    favorite: false,
    deadline: null,
    nextStep: 'Review the acceptance report',
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: NOW.toISOString(),
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 2,
    openTodoCount: 1,
    excerpt: 'The new offer list is on the test system.',
  };

  function day(overrides: Partial<JournalDay> & { date: string; path: string }): JournalDay {
    return {
      title: overrides.date,
      closed: null,
      mood: null,
      energy: null,
      people: [],
      projects: [],
      tags: [],
      excerpt: 'A short day.',
      wordCount: 12,
      turns: 0,
      ...overrides,
    };
  }

  const todayDay = day({ path: DAY_PATH, date: TODAY, wordCount: 42 });
  const earlierDay = day({ path: EARLIER_PATH, date: EARLIER });

  function doc(patch: Partial<VaultDoc> = {}): VaultDoc {
    return {
      path: DAY_PATH,
      frontmatter: { type: 'journal', title: TODAY, created: NOW.toISOString() },
      body: '## Day\n\nA short day.\n',
      hash: 'hash-1',
      modified: NOW.toISOString(),
      size: 200,
      ...patch,
    };
  }

  function view(patch: Partial<JournalDayView> = {}): JournalDayView {
    return {
      day: todayDay,
      doc: doc(),
      text: 'A short day.',
      stream: [{ kind: 'entry', text: 'A short day.', at: null }],
      turns: [],
      facts: '',
      looseEnds: [],
      ...patch,
    };
  }

  const LOCAL_PROVIDER: ProviderConfig = {
    id: 'local-1',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: ['qwen2.5:14b'],
    createdAt: NOW.toISOString(),
  };

  const TASKS: TaskDefinition[] = [
    {
      kind: 'journal-chat',
      labelKey: 'task.journal-chat.label',
      hintKey: 'task.journal-chat.hint',
      suggested: 'cheap',
      typicalTokens: { in: 2500, out: 400 },
      sensitive: true,
      streams: true,
      structured: false,
    },
  ];

  function routing(providerId: string): Routing {
    return { tasks: { 'journal-chat': { providerId, model: 'qwen2.5:14b' } }, defaults: {} };
  }

  const settings: SettingsSnapshot = {
    app: {
      version: 1,
      lastVault: 'C:/vaults/demo',
      recentVaults: [],
      theme: 'dark',
      customization: { background: 'none', appIcon: 'knowledge-garden' },
      uiLanguage: 'en',
      window: { width: 1440, height: 900 },
      startMinimized: false,
      onboarded: true,
      machine: { vramOverrideMb: null, resourceBudgetPercent: 80 },
    },
    vault: {
      version: 1,
      languages: { ui: 'en', documents: 'en', conversation: 'en', translateSources: false },
      capture: {
        quickCaptureShortcut: 'Ctrl+Shift+Space',
        autoClassify: false,
        closeAfterCapture: true,
      },
      overview: {
        staleAfterDays: 14,
        deadlineHorizonDays: 14,
        waitingNudgeDays: 5,
        useClaudeSessions: false,
        claudeProjectsDir: '',
        useCodexSessions: false,
        codexSessionsDir: '',
        notifications: false,
        dismissedAgentProjects: [],
        showEmptySessionsTab: false,
      },
      journal: { mode: 'listen' },
      gardener: { runOnOpen: false, reviewAfterDays: 120, useLlm: false },
      providers: [LOCAL_PROVIDER],
      routing: routing(LOCAL_PROVIDER.id),
      dashboard: { tiles: [], updated: NOW.toISOString() },
      preferredTags: [],
    },
  };

  /** Reads the current `?d=…` search param, shared with `JournalScreen` via
      the same `MemoryRouter` — the direct check D2 asks for, rather than a
      proxy through IPC calls. */
  function LocationProbe() {
    const [params] = useSearchParams();
    return <span data-testid="location-probe">{params.toString()}</span>;
  }

  interface Rendered {
    sb: Mock;
    unmount: () => void;
  }

  function open(days: JournalDay[], extra: Handlers = {}): Rendered {
    const state = { view: view() };
    const sb = installMock({
      'vault:status': () => ({
        root: 'C:/vaults/demo',
        name: 'Demo',
        ready: true,
        docCount: days.length,
        indexedAt: NOW.toISOString(),
        indexing: false,
      }),
      'settings:get': () => settings,
      'journal:list': () => days,
      'journal:get': ({ date }) => (date === TODAY ? state.view : null),
      'projects:list': () => [project],
      'llm:routing': () => routing(LOCAL_PROVIDER.id),
      'llm:tasks': () => TASKS,
      'llm:providers': () => [LOCAL_PROVIDER],
      'journal:setDay': () => ({ path: DAY_PATH, hash: 'hash-2', created: false }),
      'journal:append': () => ({ path: DAY_PATH, hash: 'hash-2', created: true }),
      'journal:setMood': () => todayDay,
      'journal:setClosed': () => todayDay,
      'journal:coach': () => ({ threadId: `journal-${TODAY}`, messageId: 'm-1' }),
      'journal:abort': () => undefined,
      'journal:close': () => null,
      'journal:foldDay': () => ({ path: DAY_PATH, hash: 'hash-5', created: false }),
      'vault:write': () => ({ path: DAY_PATH, hash: 'hash-4', created: false }),
      'shell:openPath': () => undefined,
      ...extra,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const unwire = wireEvents(client);
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JournalScreen />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return {
      sb,
      unmount: () => {
        unwire();
        unmount();
      },
    };
  }

  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    setLanguage('en');
    document.documentElement.lang = 'en';
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    Element.prototype.scrollIntoView = () => undefined;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup?.();
    cleanup = null;
    window.sessionStorage.clear();
    delete window.sb;
  });

  function render_(days: JournalDay[], extra: Handlers = {}): Rendered {
    const rendered = open(days, extra);
    cleanup = rendered.unmount;
    return rendered;
  }

  it('renders the calendar above the day list, in the same side column', async () => {
    render_([todayDay, earlierDay]);

    await screen.findByRole('group', { name: 'Month calendar' });
    const side = document.querySelector('.sb-journal-side');
    const calendar = side?.querySelector('.sb-monthcal') ?? null;
    const list = side?.querySelector('.sb-daylist') ?? null;
    expect(calendar).not.toBeNull();
    expect(list).not.toBeNull();
    const position = calendar!.compareDocumentPosition(list!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('opens a day with an entry through the same select() path as a list-row click', async () => {
    render_([todayDay, earlierDay]);

    await screen.findByRole('group', { name: 'Month calendar' });
    await userEvent.click(screen.getByRole('button', { name: `Open the calendar day ${EARLIER}` }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe(`d=${EARLIER}`),
    );
    /* Same path as `DayList`: the corresponding list row picks up the same
       selection, because both call the screen's one `select()`. */
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: `Open the entry of ${EARLIER}` })
          .getAttribute('aria-current'),
      ).toBe('true'),
    );
  });

  it('never writes a file for clicking an empty past day — only navigation happens', async () => {
    const { sb } = render_([todayDay, earlierDay]);

    await screen.findByRole('group', { name: 'Month calendar' });
    await userEvent.click(
      screen.getByRole('button', { name: `Open the calendar day ${EMPTY_PAST}` }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toBe(`d=${EMPTY_PAST}`),
    );
    expect(sb.payloadsOf('journal:setDay')).toEqual([]);
    expect(sb.payloadsOf('journal:append')).toEqual([]);
  });

  it('picks up a day added via event:vault-changed without an explicit reload', async () => {
    const state = { days: [todayDay] };
    const { sb } = render_(state.days, { 'journal:list': () => state.days });

    await screen.findByRole('group', { name: 'Month calendar' });
    const before = screen.getByRole('button', { name: `Open the calendar day ${LATER_ADDED}` });
    expect(before.querySelector('.sb-monthcal-entrymark')).toBeNull();

    state.days = [todayDay, day({ path: `journal/2026/08/${LATER_ADDED}.md`, date: LATER_ADDED })];
    sb.emit('event:vault-changed', {
      paths: [`journal/2026/08/${LATER_ADDED}.md`],
      external: true,
    });

    await waitFor(() => {
      const cell = screen.getByRole('button', { name: `Open the calendar day ${LATER_ADDED}` });
      expect(cell.querySelector('.sb-monthcal-entrymark')).not.toBeNull();
    });
  });

  it('keeps the collapse choice in sessionStorage across an unmount and remount', async () => {
    const { unmount } = render_([todayDay, earlierDay]);

    await screen.findByRole('group', { name: 'Month calendar' });
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the calendar' }));
    expect(window.sessionStorage.getItem('sb-journal-calendar-collapsed')).toBe('true');

    unmount();
    render_([todayDay, earlierDay]);

    /* Read once on mount: the fresh instance starts collapsed, straight from
       `sessionStorage` — no explicit prop carried it across the remount. */
    expect(await screen.findByRole('button', { name: 'Expand the calendar' })).toBeTruthy();
    /* The grid body is gone entirely while collapsed (`MonthCalendar` renders
       no `<tbody>` at all) — the day list's own row for the same date is
       untouched by the calendar's collapse and still there, which is exactly
       why the two now carry distinct accessible names. */
    expect(screen.queryByRole('button', { name: `Open the calendar day ${EARLIER}` })).toBeNull();
    expect(screen.getByRole('button', { name: `Open the entry of ${EARLIER}` })).toBeTruthy();
  });
});
