/* Loose ends (020, D1): what a day announced and nobody ever came back to.
 *
 * The rule is a pure derivation — days plus todos plus a `today` in, a list out.
 * What is tested here is exactly where it draws its lines, because four surfaces
 * read this output verbatim:
 *
 * - it finds a real announcement, with the sentence, the day, the file line and
 *   the day it pointed at;
 * - it stays quiet for anything that has not come due yet, for a report about the
 *   past, and for an ambiguous weekday ("am Freitag war ...");
 * - it stays quiet once the vault answers by itself — a later day that links back
 *   and names the subject, or a todo with a deadline;
 * - it never reads the app's own answers, only the user's prose;
 * - the ids are a hash of day plus sentence: same input, same ids, and no clock.
 */

import { describe, expect, it } from 'vitest';
import { findLooseEnds, formatAnswer } from '@core/journal';
import type { LooseEndDay, LooseEndTodo } from '@core/journal';

/** 1-based file line of the first body line, as `IndexedDoc.bodyLine` reports it. */
const BODY_LINE = 8;
const TODAY = '2026-08-21';

function day(date: string, ...lines: string[]): LooseEndDay {
  return {
    day: {
      date,
      path: `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`,
    },
    doc: { body: ['## Tag', '', ...lines, ''].join('\n'), bodyLine: BODY_LINE },
  };
}

const NOTARY = day('2026-08-18', 'Der Sprint zieht sich.', '', 'Morgen bin ich beim Notar.');

describe('findLooseEnds', () => {
  it('findet die Ankündigung mit Satz, Tag, Pfad, Zeile und aufgelöstem Datum', () => {
    const ends = findLooseEnds([NOTARY], [], TODAY);

    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({
      day: '2026-08-18',
      path: 'journal/2026/08/2026-08-18.md',
      quote: 'Morgen bin ich beim Notar.',
      subject: 'Notar',
      refDate: '2026-08-19',
      origin: 'heuristic',
    });
    /* Die Zeile zeigt in die Datei, nicht in den Rumpf: 'Morgen …' steht auf
       Rumpfzeile 4, also vier Zeilen hinter der ersten Rumpfzeile. */
    expect(ends[0]?.line).toBe(BODY_LINE + 4);
  });

  it('nimmt auch ein ausgeschriebenes Datum in englischer Prosa', () => {
    const ends = findLooseEnds(
      [day('2026-08-18', 'The notary signing is on 2026-08-19.')],
      [],
      TODAY,
    );

    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ refDate: '2026-08-19', subject: 'notary signing' });
  });

  it('schweigt, solange der angekündigte Tag heute oder später ist', () => {
    const today = day('2026-08-21', 'Morgen bin ich beim Notar.');
    const yesterday = day('2026-08-20', 'Morgen bin ich beim Notar.');

    expect(findLooseEnds([today, yesterday], [], TODAY)).toEqual([]);
  });

  it('schweigt bei einem Bericht über die Vergangenheit', () => {
    const past = day('2026-08-18', 'Gestern war ich beim Notar.');
    /* 'am Freitag' allein ist zweideutig — `findDates` legt jeden Wochentag nach
       vorne, der Satz erzählt aber von vorletzter Woche. */
    const weekday = day('2026-08-10', 'Am Freitag war der Notar da.');

    expect(findLooseEnds([past, weekday], [], TODAY)).toEqual([]);
  });

  it('nimmt einen Wochentag, wenn er nur die Zukunft meinen kann', () => {
    const ends = findLooseEnds(
      [day('2026-08-10', 'Nächsten Freitag ist der Termin beim Notar.')],
      [],
      TODAY,
    );

    expect(ends).toHaveLength(1);
    expect(ends[0]?.refDate).toBe('2026-08-14');
  });

  it('schweigt, wenn ein späterer Tag den Tag verlinkt und das Thema aufgreift', () => {
    const answered = day(
      '2026-08-20',
      'Beim Notar war alles in zehn Minuten erledigt, siehe [[2026-08-18]].',
    );
    const unlinked = day('2026-08-20', 'Beim Notar war alles in zehn Minuten erledigt.');

    expect(findLooseEnds([NOTARY, answered], [], TODAY)).toEqual([]);
    /* Ohne den Verweis bleibt es offen — die Erwähnung allein ist keine Antwort. */
    expect(findLooseEnds([NOTARY, unlinked], [], TODAY)).toHaveLength(1);
  });

  it('schweigt, wenn ein Todo mit Frist dasselbe Thema trägt', () => {
    const dated: LooseEndTodo = { text: 'Notartermin nachfassen', due: '2026-08-25' };
    const undated: LooseEndTodo = { text: 'Notartermin nachfassen', due: null };

    expect(findLooseEnds([NOTARY], [dated], TODAY)).toEqual([]);
    /* Ohne Frist ist das Todo selbst ein loses Ende, kein Ort, an dem es liegt. */
    expect(findLooseEnds([NOTARY], [undated], TODAY)).toHaveLength(1);
  });

  it('liest nur eigene Prosa, nie die Antworten der App', () => {
    const body = ['## Tag', '', formatAnswer('Morgen bist du beim Notar.', '09:00'), ''].join('\n');
    const answerOnly: LooseEndDay = {
      day: { date: '2026-08-18', path: 'journal/2026/08/2026-08-18.md' },
      doc: { body, bodyLine: BODY_LINE },
    };

    expect(findLooseEnds([answerOnly], [], TODAY)).toEqual([]);
  });

  it('vergibt stabile ids — gleiche Eingabe, gleiche id, unabhängig von „heute"', () => {
    const first = findLooseEnds([NOTARY], [], TODAY);
    const again = findLooseEnds([NOTARY], [], TODAY);
    const later = findLooseEnds([NOTARY], [], '2026-09-30');

    expect(first.map((end) => end.id)).toEqual(again.map((end) => end.id));
    expect(later.map((end) => end.id)).toEqual(first.map((end) => end.id));
    expect(first[0]?.id).toMatch(/^[0-9a-f]{16}$/);
  });
});
