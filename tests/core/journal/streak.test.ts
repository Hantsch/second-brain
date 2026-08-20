/* Die Serie. Reine Rechnung über Kalendertage, „heute" kommt von außen.

   Geprüft werden die drei Fälle, in denen solche Rechnungen falsch werden:
   Lücken, Monats- und Jahresgrenzen, und der leere Bestand. */

import { describe, expect, it } from 'vitest';
import {
  entriesInMonth,
  journalStreaks,
  lastEntryDate,
  longestStreak,
  moodHistory,
} from '@core/journal';
import type { JournalDay } from '@shared/types';
import { TODAY } from '../../helpers/time';

function day(date: string, mood: number | null = null, energy: number | null = null): JournalDay {
  return {
    path: `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`,
    date,
    title: date,
    closed: null,
    mood,
    energy,
    people: [],
    projects: [],
    tags: [],
    excerpt: 'Text.',
    wordCount: 1,
    turns: 0,
  };
}

/** Neueste zuerst, so wie der Index sie liefert. */
function days(...dates: string[]): JournalDay[] {
  return dates.map((date) => day(date));
}

describe('journalStreaks', () => {
  it('zählt die Tage in Folge bis heute', () => {
    const stats = journalStreaks(days('2026-08-10', '2026-08-09', '2026-08-08'), TODAY);

    expect(stats.current).toBe(3);
    expect(stats.longest).toBe(3);
    expect(stats.lastEntry).toBe('2026-08-10');
    expect(stats.total).toBe(3);
  });

  it('lässt die Serie an gestern hängen — der heutige Eintrag kommt meist abends', () => {
    const stats = journalStreaks(days('2026-08-09', '2026-08-08'), TODAY);
    expect(stats.current).toBe(2);
  });

  it('bricht bei einer Lücke ab, zählt die längste Serie aber weiter', () => {
    const stats = journalStreaks(
      days('2026-08-10', '2026-08-07', '2026-08-06', '2026-08-05', '2026-08-04'),
      TODAY,
    );

    expect(stats.current).toBe(1);
    expect(stats.longest).toBe(4);
  });

  it('ist bei einer Lücke von zwei Tagen ohne laufende Serie', () => {
    expect(journalStreaks(days('2026-08-08', '2026-08-07'), TODAY).current).toBe(0);
  });

  it('zählt über die Monatsgrenze durch', () => {
    const stats = journalStreaks(
      days('2026-08-02', '2026-08-01', '2026-07-31', '2026-07-30'),
      '2026-08-02',
    );

    expect(stats.current).toBe(4);
    expect(stats.longest).toBe(4);
    expect(stats.entriesThisMonth).toBe(2);
  });

  it('zählt über die Jahresgrenze durch', () => {
    expect(longestStreak(days('2027-01-01', '2026-12-31', '2026-12-30'))).toBe(3);
  });

  it('ist bei leerem Bestand überall null', () => {
    expect(journalStreaks([], TODAY)).toEqual({
      current: 0,
      longest: 0,
      lastEntry: null,
      entriesThisMonth: 0,
      total: 0,
    });
  });

  it('zählt einen Tag nur einmal, auch wenn er doppelt in der Liste steht', () => {
    const stats = journalStreaks([day('2026-08-10'), day('2026-08-10')], TODAY);
    expect(stats.total).toBe(1);
    expect(stats.current).toBe(1);
  });
});

describe('entriesInMonth', () => {
  it('zählt nur den Kalendermonat des übergebenen Tages', () => {
    const list = days('2026-08-10', '2026-08-01', '2026-07-31');
    expect(entriesInMonth(list, TODAY)).toBe(2);
    expect(entriesInMonth(list, '2026-07-15')).toBe(1);
    expect(entriesInMonth(list, '2026-06-15')).toBe(0);
  });
});

describe('lastEntryDate', () => {
  it('findet den jüngsten Tag unabhängig von der Reihenfolge', () => {
    expect(lastEntryDate(days('2026-07-31', '2026-08-10', '2026-08-01'))).toBe('2026-08-10');
    expect(lastEntryDate([])).toBeNull();
  });
});

describe('moodHistory', () => {
  it('gibt den Verlauf im Fenster, ältester zuerst, mit Energie', () => {
    const list = [day('2026-08-10', 3, 2), day('2026-08-08', 4, null), day('2026-07-20', 1, 1)];

    const history = moodHistory(list, TODAY, 7);

    expect(history).toEqual([
      { date: '2026-08-08', mood: 4, energy: null },
      { date: '2026-08-10', mood: 3, energy: 2 },
    ]);
  });

  it('nimmt Tage ohne Stimmung mit, statt eine Null zu erfinden', () => {
    const history = moodHistory([day('2026-08-10', null, null)], TODAY, 7);
    expect(history).toEqual([{ date: '2026-08-10', mood: null, energy: null }]);
  });

  it('ist bei leerem Bestand leer', () => {
    expect(moodHistory([], TODAY)).toEqual([]);
  });
});
