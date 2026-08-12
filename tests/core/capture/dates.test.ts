/* Datumsangaben in deutschem Freitext. Heute ist Montag, der 10. August 2026 —
   alles Relative wird darauf bezogen. Was nicht sicher zu deuten ist, darf nicht
   zu einer Frist werden: eine falsche Frist ist schlimmer als keine. */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  findDates,
  germanDay,
  isCalendarDay,
  primaryDate,
  weekdayOf,
} from '@core/capture';
import { TODAY } from '../../helpers/time';

function first(text: string): string | null {
  return findDates(text, TODAY)[0]?.iso ?? null;
}

describe('findDates', () => {
  it.each([
    ['heute noch abschicken', '2026-08-10'],
    ['morgen früh anrufen', '2026-08-11'],
    ['übermorgen liefern', '2026-08-12'],
    ['uebermorgen liefern', '2026-08-12'],
    ['nächste Woche einplanen', '2026-08-17'],
    ['kommende Woche besprechen', '2026-08-17'],
    ['in 3 Tagen nachfassen', '2026-08-13'],
    ['in einer Woche nachfragen', '2026-08-17'],
    ['bis Freitag fertig', '2026-08-14'],
    ['am Montag wieder', '2026-08-10'],
    ['bis 15.08. abgeben', '2026-08-15'],
    ['bis 15.8. abgeben', '2026-08-15'],
    ['am 15.08.2026 abgeben', '2026-08-15'],
    ['Termin 2026-08-15', '2026-08-15'],
    ['am 15. August', '2026-08-15'],
    ['am 3. September', '2026-09-03'],
    ['in KW 34 ausrollen', '2026-08-17'],
    ['KW34 ausrollen', '2026-08-17'],
    ['bis Monatsende klären', '2026-08-31'],
  ])('liest "%s" als %s', (text, expected) => {
    expect(first(text)).toBe(expected);
  });

  it('nimmt für ein Datum ohne Jahr das kommende, wenn es weit zurückliegt', () => {
    expect(first('Rechnung vom 20.01. sortieren')).toBe('2027-01-20');
    expect(first('Termin am 05.08.')).toBe('2026-08-05');
  });

  it('erfindet keine Daten', () => {
    expect(findDates('Version 1.5.2 ist raus.', TODAY)).toEqual([]);
    expect(findDates('Die Liste braucht 1,5 s bei 400 Angeboten.', TODAY)).toEqual([]);
    expect(findDates('Am 31.02. gibt es nichts.', TODAY)).toEqual([]);
  });

  it('gibt jeden Kalendertag nur einmal, in Textreihenfolge', () => {
    const hits = findDates(
      'Bis morgen den Entwurf, heute nur die Notiz, morgen früh dann alles.',
      TODAY,
    );
    expect(hits.map((hit) => hit.iso)).toEqual(['2026-08-11', '2026-08-10']);
  });

  it('trägt mit, was im Text stand — sonst gibt es keine Begründung', () => {
    expect(findDates('bis 15.08. abgeben', TODAY)[0]?.label).toBe('15.08.');
    expect(findDates('nächste Woche', TODAY)[0]?.label).toBe('nächste Woche');
  });
});

describe('primaryDate', () => {
  it('nimmt das erste Datum, das nicht vorbei ist', () => {
    const hits = findDates('Gestern begonnen, bis morgen fertig.', TODAY);
    expect(primaryDate(hits, TODAY)?.iso).toBe('2026-08-11');
  });

  it('nimmt das erste überhaupt, wenn alles vorbei ist', () => {
    const hits = findDates('War gestern fällig.', TODAY);
    expect(primaryDate(hits, TODAY)?.iso).toBe('2026-08-09');
  });

  it('ist ohne Datum null', () => {
    expect(primaryDate([], TODAY)).toBeNull();
  });
});

describe('Tagesrechnung', () => {
  it('rechnet über Monatsgrenzen', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('kennt den Wochentag: 1 ist Montag, 7 ist Sonntag', () => {
    expect(weekdayOf('2026-08-10')).toBe(1);
    expect(weekdayOf('2026-08-16')).toBe(7);
  });

  it('schreibt ein Datum deutsch, das Jahr nur wenn es abweicht', () => {
    expect(germanDay('2026-08-15', TODAY)).toBe('15.08.');
    expect(germanDay('2027-01-20', TODAY)).toBe('20.01.2027');
  });

  it('erkennt einen Kalendertag und weist alles andere ab', () => {
    expect(isCalendarDay('2026-08-15')).toBe(true);
    expect(isCalendarDay('15.08.2026')).toBe(false);
    expect(isCalendarDay('morgen')).toBe(false);
    expect(isCalendarDay(null)).toBe(false);
  });
});
