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
import { announcementsOf, findLooseEnds, formatAnswer, resolutionCheck } from '@core/journal';
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
const SIGNING = day('2026-08-18', 'The notary signing is on 2026-08-19.');
/* Der 12.-August-Absatz (022): weicher Zeilenumbruch, kein einziger Punkt — also
   ein Satz, dessen Ankündigung ganz am Ende steht. */
const MONDSEE = day(
  '2026-08-12',
  'Vormittag ruhig, lost, vereinzelt paar Fragen',
  'fahr dann morgen so um zwei nach Mondsee',
);
const MONDSEE_QUOTE =
  'Vormittag ruhig, lost, vereinzelt paar Fragen fahr dann morgen so um zwei nach Mondsee';

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
    const ends = findLooseEnds([SIGNING], [], TODAY);

    expect(ends).toHaveLength(1);
    /* Das Datum steht am Satzende — der Name kommt dann aus dem, was davor steht. */
    expect(ends[0]).toMatchObject({ refDate: '2026-08-19', subject: 'notary signing' });
  });

  it('benennt die Ankündigung, nicht den Anfang des Absatzes', () => {
    const ends = findLooseEnds([MONDSEE], [], TODAY);

    expect(ends).toHaveLength(1);
    /* Der Name kommt aus dem Satzteil um „morgen" herum. „zwei" ist eine Uhrzeit
       und benennt nichts, genau wie eine Zahl in Ziffern. */
    expect(ends[0]?.subject).toBe('Mondsee');
    expect(ends[0]?.refDate).toBe('2026-08-13');
    /* Der Satz bleibt ganz — nur der Name wird anders daraus gezogen. */
    expect(ends[0]?.quote).toBe(MONDSEE_QUOTE);
  });

  it('schweigt, wenn ein datiertes Todo genau diese Ankündigung trägt', () => {
    const trip: LooseEndTodo = { text: 'Nach Mondsee fahren', due: '2026-08-13' };

    expect(findLooseEnds([MONDSEE], [trip], TODAY)).toEqual([]);
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

  it('erkennt die Antwort eines späteren Tags auch, wenn dieser das eng verankerte Thema nicht wörtlich nennt (022, D2)', () => {
    /* MONDSEEs Thema wird auf das eine Wort neben der Ankündigung verengt
       (`subject` ist "Mondsee", siehe oben) — für die Todo-Prüfung (`.every`)
       ist das die Verbesserung. Die "verlinkt und greift das Thema auf"-Prüfung
       läuft aber über `.some` gegen ein *breiteres* Wortfeld: schon eines der
       Wörter aus dem Kopf des Satzes reicht, damit ein späterer Tag als Antwort
       zählt — auch wenn er "Mondsee" selbst gar nicht wiederholt. */
    const answered = day(
      '2026-08-14',
      'Vereinzelt noch was geklärt, aber erledigt, siehe [[2026-08-12]].',
    );

    expect(findLooseEnds([MONDSEE, answered], [], TODAY)).toEqual([]);
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

  it('behält Zitat und id Zeichen für Zeichen — auch wenn der Name sich ändert', () => {
    /* Fest verdrahtete Werte, absichtlich nicht nachgerechnet: an
       `looseEndId(day, quote)` hängen die Wartungsmeldung `loose-end:<id>` und
       die gespeicherten „beantwortet" / „passt so" / „später" des Nutzers. Wandert
       hier ein Zeichen, kommen erledigte lose Enden zurück. */
    const notary = findLooseEnds([NOTARY], [], TODAY)[0];
    expect([notary?.quote, notary?.id]).toEqual(['Morgen bin ich beim Notar.', '2c1aec1a55776340']);

    const signing = findLooseEnds([SIGNING], [], TODAY)[0];
    expect([signing?.quote, signing?.id]).toEqual([
      'The notary signing is on 2026-08-19.',
      '8a0428bfb2eeb048',
    ]);

    const mondsee = findLooseEnds([MONDSEE], [], TODAY)[0];
    expect([mondsee?.quote, mondsee?.id]).toEqual([MONDSEE_QUOTE, 'c7861f4a5889610c']);
  });
});

/* 069, D1: dieselbe Subtraktion, aber sie sagt jetzt auch *wodurch* etwas
   erledigt ist. `settledCheck` ist nur noch die Ja/Nein-Fassade davor — die
   Tests oben prüfen über `findLooseEnds` weiterhin genau dieses Ja/Nein. */
describe('resolutionCheck', () => {
  it('benennt den späteren Tag, der die Ankündigung aufgegriffen hat', () => {
    const answered = day(
      '2026-08-20',
      'Beim Notar war alles in zehn Minuten erledigt, siehe [[2026-08-18]].',
    );
    const resolution = resolutionCheck([NOTARY, answered], []);

    /* Nicht nur „erledigt", sondern: von diesem Tag, in dieser Datei. */
    expect(resolution('2026-08-18', 'Morgen bin ich beim Notar.')).toEqual({
      by: 'day',
      date: '2026-08-20',
      path: 'journal/2026/08/2026-08-20.md',
    });
  });

  it('meldet das Todo, wenn eine Frist die Ankündigung trägt', () => {
    const dated: LooseEndTodo = { text: 'Notartermin nachfassen', due: '2026-08-25' };
    const trip: LooseEndTodo = { text: 'Nach Mondsee fahren', due: '2026-08-13' };
    const resolution = resolutionCheck([NOTARY, MONDSEE], [dated, trip]);

    expect(resolution('2026-08-18', 'Morgen bin ich beim Notar.')).toEqual({ by: 'todo' });
    /* Auch über das eng verankerte Thema — `at` zeigt auf „morgen", das Thema
       ist damit „Mondsee" und nicht der Kopf des Absatzes. */
    expect(resolution('2026-08-12', MONDSEE_QUOTE, MONDSEE_QUOTE.indexOf('morgen'))).toEqual({
      by: 'todo',
    });
  });

  it('sagt „offen" (null), solange nichts im Vault antwortet', () => {
    const unlinked = day('2026-08-20', 'Beim Notar war alles in zehn Minuten erledigt.');
    const undated: LooseEndTodo = { text: 'Notartermin nachfassen', due: null };

    expect(
      resolutionCheck([NOTARY, unlinked], [undated])('2026-08-18', 'Morgen bin ich beim Notar.'),
    ).toBeNull();
  });
});

describe('announcementsOf', () => {
  it('zeigt einen Tag auch die Ankündigungen, die `findLooseEnds` schon abzieht', () => {
    const answered = day(
      '2026-08-20',
      'Beim Notar war alles in zehn Minuten erledigt, siehe [[2026-08-18]].',
    );
    const found = announcementsOf(NOTARY, TODAY);

    /* Der Kandidat ist derselbe, den `findLooseEnds` baut — plus `at`, dem
       Offset der Datumsangabe im Zitat. */
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: '2c1aec1a55776340',
      day: '2026-08-18',
      quote: 'Morgen bin ich beim Notar.',
      subject: 'Notar',
      refDate: '2026-08-19',
      at: 0,
    });
    /* Und er bleibt sichtbar, wo die Liste der losen Enden ihn längst fallen lässt. */
    expect(findLooseEnds([NOTARY, answered], [], TODAY)).toEqual([]);
  });
});
