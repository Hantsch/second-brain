/* Loose end resolution (069, D2): a day's announcements, each with what settled
 * it. Built on `dayLooseEnds` — vault first (`resolutionCheck`), the `answered`
 * state-file map only for what the vault heuristic misses.
 *
 * The function takes only plain data (`days`, `todos`, `today`, `date`,
 * `answered`) — no store, no filesystem, no clock. This file never constructs
 * a store or fs mock to call it, which is itself the proof that it cannot
 * write anything.
 */

import { describe, expect, it } from 'vitest';
import { dayLooseEnds, looseEndId } from '@core/journal';
import type { LooseEndDay, LooseEndTodo } from '@core/journal';

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

const NOTARY = day('2026-08-18', 'Morgen bin ich beim Notar.');
const NOTARY_ID = looseEndId('2026-08-18', 'Morgen bin ich beim Notar.');

describe('dayLooseEnds', () => {
  it('gibt der Antwort eines späteren Tags resolution.day und resolution.path mit', () => {
    const answered = day(
      '2026-08-20',
      'Beim Notar war alles in zehn Minuten erledigt, siehe [[2026-08-18]].',
    );

    const ends = dayLooseEnds([NOTARY, answered], [], TODAY, '2026-08-18', new Map());

    expect(ends).toHaveLength(1);
    expect(ends[0]?.resolution).toEqual({
      day: '2026-08-20',
      path: 'journal/2026/08/2026-08-20.md',
    });
  });

  it('liefert resolution: null für eine unbeantwortete Ankündigung', () => {
    const ends = dayLooseEnds([NOTARY], [], TODAY, '2026-08-18', new Map());

    expect(ends).toHaveLength(1);
    expect(ends[0]?.resolution).toBeNull();
  });

  it('löst über die `answered`-Map, was die Vault-Heuristik nicht findet ("Erledigt.")', () => {
    /* Die Antwort nennt das Thema nicht wörtlich ("Erledigt." wiederholt "Notar"
       nicht) — die Vault-Heuristik (`resolutionCheck`) sieht darin keine
       Verlinkung mit Themenbezug, also bleibt es ohne die Map offen. */
    const terse = day('2026-08-20', 'Erledigt.');
    const answered = new Map([[NOTARY_ID, terse.day.path]]);

    const withoutMap = dayLooseEnds([NOTARY, terse], [], TODAY, '2026-08-18', new Map());
    expect(withoutMap[0]?.resolution).toBeNull();

    const withMap = dayLooseEnds([NOTARY, terse], [], TODAY, '2026-08-18', answered);
    expect(withMap).toHaveLength(1);
    expect(withMap[0]?.resolution).toEqual({ day: '2026-08-20', path: terse.day.path });
  });

  it('lässt eine durch ein datiertes Todo erledigte Ankündigung ganz aus der Liste', () => {
    const dated: LooseEndTodo = { text: 'Notartermin nachfassen', due: '2026-08-25' };

    const ends = dayLooseEnds([NOTARY], [dated], TODAY, '2026-08-18', new Map());

    expect(ends).toEqual([]);
  });

  it('holt eine todo-erledigte Ankündigung über die `answered`-Map zurück in die Liste', () => {
    const dated: LooseEndTodo = { text: 'Notartermin nachfassen', due: '2026-08-25' };
    const laterDay = day('2026-08-20', 'Erledigt.');
    const answered = new Map([[NOTARY_ID, laterDay.day.path]]);

    const ends = dayLooseEnds([NOTARY, laterDay], [dated], TODAY, '2026-08-18', answered);

    expect(ends).toHaveLength(1);
    expect(ends[0]?.resolution).toEqual({ day: '2026-08-20', path: laterDay.day.path });
  });

  it('gibt eine leere Liste für einen Tag zurück, der nicht in `days` vorkommt', () => {
    expect(dayLooseEnds([NOTARY], [], TODAY, '2026-08-19', new Map())).toEqual([]);
  });
});
