// @vitest-environment jsdom
/* The "not finished" rule and its session-scoped toggle.
 *
 * Four promises hang on `isDayOpen`: a closed day is never open, a day
 * before today without `closed` is, and neither today nor a future date
 * ever count, no matter what `closed` says. `openDays`/`countOpenDays` must
 * not reorder what they're given. `journal-filter.ts`'s toggle must survive
 * a remount within the session — the whole point of a module-level store. */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { JournalDay } from '@shared/types';
import { countOpenDays, isDayOpen, openDays } from '@renderer/lib/journal-open';
import { setOpenOnly, useOpenOnly } from '@renderer/lib/journal-filter';

const TODAY = '2026-08-19';

function day(date: string, patch: Partial<JournalDay> = {}): JournalDay {
  return {
    path: `journal/2026/08/${date}.md`,
    date,
    title: date,
    closed: null,
    mood: null,
    energy: null,
    people: [],
    projects: [],
    tags: [],
    areas: [],
    excerpt: '',
    wordCount: 0,
    turns: 0,
    ...patch,
  };
}

describe('isDayOpen', () => {
  it('is open: a real file, not closed, strictly before today', () => {
    expect(isDayOpen(day('2026-08-18'), TODAY)).toBe(true);
  });

  it('is not open once `closed` is set, however far in the past', () => {
    expect(isDayOpen(day('2026-08-01', { closed: '2026-08-02' }), TODAY)).toBe(false);
  });

  it('is never open for today, closed or not', () => {
    expect(isDayOpen(day(TODAY), TODAY)).toBe(false);
    expect(isDayOpen(day(TODAY, { closed: null }), TODAY)).toBe(false);
  });

  it('is never open for a future date', () => {
    expect(isDayOpen(day('2026-08-20'), TODAY)).toBe(false);
  });

  it('is never open without a file at all', () => {
    expect(isDayOpen(null, TODAY)).toBe(false);
  });
});

describe('openDays / countOpenDays', () => {
  it('keeps only the open days, in the order they were given', () => {
    const days = [
      day('2026-08-18'), // open
      day(TODAY), // today — never open
      day('2026-08-10', { closed: '2026-08-11' }), // closed — not open
      day('2026-08-05'), // open
      day('2026-08-25'), // future — never open
    ];

    const open = openDays(days, TODAY);

    /* Newest-first input preserved — nothing here re-sorts. */
    expect(open.map((entry) => entry.date)).toEqual(['2026-08-18', '2026-08-05']);
    expect(countOpenDays(days, TODAY)).toBe(2);
  });

  it('returns nothing for an empty list', () => {
    expect(openDays([], TODAY)).toEqual([]);
    expect(countOpenDays([], TODAY)).toBe(0);
  });
});

describe('journal-filter: useOpenOnly / setOpenOnly', () => {
  beforeEach(() => {
    setOpenOnly(false);
  });

  it('defaults to false', () => {
    const { result } = renderHook(() => useOpenOnly());
    expect(result.current).toBe(false);
  });

  it('reflects a value set before the hook ever rendered', () => {
    setOpenOnly(true);
    const { result } = renderHook(() => useOpenOnly());
    expect(result.current).toBe(true);
  });

  it('notifies a mounted subscriber when the value changes', () => {
    const { result } = renderHook(() => useOpenOnly());
    expect(result.current).toBe(false);

    act(() => setOpenOnly(true));
    expect(result.current).toBe(true);
  });

  it('keeps the value set via setOpenOnly across an unmount/remount', () => {
    const first = renderHook(() => useOpenOnly());
    act(() => setOpenOnly(true));
    first.unmount();

    const second = renderHook(() => useOpenOnly());
    expect(second.result.current).toBe(true);
  });
});
