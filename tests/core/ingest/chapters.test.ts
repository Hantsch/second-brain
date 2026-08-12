/* Kapitel aus den Zeitmarken der Description — der Fallback, wenn kein Provider
   welche liefert. Die Regel ist absichtlich streng: aus „schau ab 3:12" darf kein
   Kapitel werden, sonst zerschneidet das Transcript an erfundenen Grenzen. */

import { describe, expect, it } from 'vitest';
import { normalizeChapters, parseChaptersFromDescription } from '@core/ingest';

describe('parseChaptersFromDescription', () => {
  it('liest eine gewoehnliche Kapitelliste', () => {
    const chapters = parseChaptersFromDescription(
      'Worum es geht.\n\n0:00 Einleitung\n0:30 Drei Anzeichen\n1:10 Was hilft\n\nViel Spass!',
      96,
    );
    expect(chapters).toEqual([
      { start: 0, end: 30, title: 'Einleitung' },
      { start: 30, end: 70, title: 'Drei Anzeichen' },
      { start: 70, end: 96, title: 'Was hilft' },
    ]);
  });

  it('behaelt fuehrende Ziffern im Kapitelnamen', () => {
    const chapters = parseChaptersFromDescription(
      '- 0:00 3 Gruende fuer Pflege\n- 1:00 2 Werkzeuge\n- 2:00 1 Fazit',
      200,
    );
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      '3 Gruende fuer Pflege',
      '2 Werkzeuge',
      '1 Fazit',
    ]);
  });

  it('versteht Stunden und Klammern', () => {
    const chapters = parseChaptersFromDescription(
      '(0:00) Start\n(1:02:03) Mitte\n(2:00:00) Ende',
      8000,
    );
    expect(chapters.map((chapter) => chapter.start)).toEqual([0, 3723, 7200]);
  });

  it('lehnt ab, was keine Kapitelliste ist', () => {
    // Zu wenige Marken.
    expect(parseChaptersFromDescription('0:00 Start\n1:00 Ende', 200)).toEqual([]);
    // Erste Marke zu spaet: das ist ein Verweis, keine Gliederung.
    expect(parseChaptersFromDescription('3:12 schau hier\n4:00 und hier\n5:00 dort', 600)).toEqual(
      [],
    );
    // Nicht aufsteigend.
    expect(parseChaptersFromDescription('0:00 A\n2:00 B\n1:00 C', 600)).toEqual([]);
    // Hinter dem Videoende.
    expect(parseChaptersFromDescription('0:00 A\n0:30 B\n9:00 C', 100)).toEqual([]);
    expect(parseChaptersFromDescription(null)).toEqual([]);
  });
});

describe('normalizeChapters', () => {
  it('vertraegt beide Provider-Formen und sortiert', () => {
    const chapters = normalizeChapters(
      [
        { start: 30, title: 'Zweitens' },
        { start_time: 0, end_time: 30, title: 'Erstens' },
      ],
      90,
    );
    expect(chapters).toEqual([
      { start: 0, end: 30, title: 'Erstens' },
      { start: 30, end: 90, title: 'Zweitens' },
    ]);
  });

  it('verwirft Kapitel ohne verwertbare Startzeit', () => {
    const chapters = normalizeChapters(
      [{ title: 'ohne Zeit' }, { start: 5, title: 'mit Zeit' }],
      10,
    );
    expect(chapters).toEqual([{ start: 5, end: 10, title: 'mit Zeit' }]);
  });

  it('nimmt ohne Dauer unendlich als Ende — das Kapitel laeuft bis zum Schluss', () => {
    const chapters = normalizeChapters([{ start: 0, title: 'Alles' }]);
    expect(chapters[0]?.end).toBe(Number.POSITIVE_INFINITY);
  });

  it('erfindet einen Namen, wenn keiner dasteht', () => {
    expect(normalizeChapters([{ start: 0 }], 10)[0]?.title).toBe('Kapitel 1');
  });
});
