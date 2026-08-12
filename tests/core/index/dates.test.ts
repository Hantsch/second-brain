import { describe, expect, it } from 'vitest';
import { ageInDays, daysBetween, dueInDays, laterOf } from '@core/index/dates';

describe('daysBetween', () => {
  it('rechnet in Kalendertagen, auch ueber Monats- und Jahresgrenzen', () => {
    expect(daysBetween('2026-08-10', '2026-08-15')).toBe(5);
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-08-10', '2026-08-10')).toBe(0);
    expect(daysBetween('2026-08-15', '2026-08-10')).toBe(-5);
  });

  it('gibt null zurueck, wenn ein Datum unbrauchbar ist', () => {
    expect(daysBetween('irgendwann', '2026-08-10')).toBeNull();
    expect(daysBetween('2026-08-10', '')).toBeNull();
  });
});

describe('dueInDays', () => {
  it('ist negativ bei ueberfaellig und 0 bei heute', () => {
    expect(dueInDays('2026-08-15', '2026-08-10')).toBe(5);
    expect(dueInDays('2026-08-10', '2026-08-10')).toBe(0);
    expect(dueInDays('2026-08-05', '2026-08-10')).toBe(-5);
  });

  it('bleibt am Kalendertag, egal zu welcher Uhrzeit gefragt wird', () => {
    // Ortszeit, damit der Test unabhaengig von der Zeitzone des Rechners bleibt.
    expect(dueInDays('2026-08-11', new Date(2026, 7, 10, 0, 5))).toBe(1);
    expect(dueInDays('2026-08-11', new Date(2026, 7, 10, 23, 55))).toBe(1);
  });

  it('ohne Datum null', () => {
    expect(dueInDays(null, '2026-08-10')).toBeNull();
  });
});

describe('ageInDays', () => {
  it('zaehlt Tage seit einem Zeitstempel und wird nie negativ', () => {
    expect(ageInDays('2026-08-05T10:00:00.000Z', '2026-08-10')).toBe(5);
    expect(ageInDays('2026-08-20T10:00:00.000Z', '2026-08-10')).toBe(0);
  });

  it('vertraegt fehlende und unbrauchbare Werte', () => {
    expect(ageInDays(null, '2026-08-10')).toBe(0);
    expect(ageInDays('gestern', '2026-08-10')).toBe(0);
  });
});

describe('laterOf', () => {
  it('vergleicht als Zeitpunkt, nicht als Zeichenkette', () => {
    // Als Zeichenkette waere die erste spaeter ('09' > '08'); als Zeitpunkt ist es die zweite.
    expect(laterOf('2026-08-10T09:00:00+02:00', '2026-08-10T08:00:00.000Z')).toBe(
      '2026-08-10T08:00:00.000Z',
    );
    expect(laterOf('2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')).toBe(
      '2026-08-02T00:00:00.000Z',
    );
  });

  it('unbrauchbare Werte verlieren', () => {
    expect(laterOf(null, '2026-08-10T09:00:00.000Z')).toBe('2026-08-10T09:00:00.000Z');
    expect(laterOf('2026-08-10T09:00:00.000Z', 'nie')).toBe('2026-08-10T09:00:00.000Z');
    expect(laterOf(null, null)).toBeNull();
  });
});
