/* English relative dates in free text. Heute ist Montag, der 10. August 2026 —
   alles Relative wird darauf bezogen. Englisch wird nur erkannt, wenn 'en' in
   den Dokumentsprachen steckt; ohne das bleibt englischer Freitext unangetastet. */

import { describe, expect, it } from 'vitest';
import { dayLabel, findDates } from '@core/capture';
import { TODAY } from '../../helpers/time';

function first(text: string): string | null {
  return findDates(text, TODAY, ['en'])[0]?.iso ?? null;
}

describe('findDates — English', () => {
  it.each([
    ['send it today', '2026-08-10'],
    ['due tomorrow', '2026-08-11'],
    ['day after tomorrow works too', '2026-08-12'],
    ['started yesterday', '2026-08-09'],
    ['next week we plan it', '2026-08-17'],
    ['coming week discuss', '2026-08-17'],
    ['in a week check back', '2026-08-17'],
    ['in two weeks follow up', '2026-08-24'],
    ['in 3 days follow up', '2026-08-13'],
    ['due end of the month', '2026-08-31'],
    ['due end of month', '2026-08-31'],
    ['on monday again', '2026-08-10'],
    ['due friday', '2026-08-14'],
    ['on 15 August deliver', '2026-08-15'],
    ['on 15th August deliver', '2026-08-15'],
    ['on 15th of August deliver', '2026-08-15'],
    ['due August 15', '2026-08-15'],
    ['due August 15th', '2026-08-15'],
  ])('resolves "%s" as %s', (text, expected) => {
    expect(first(text)).toBe(expected);
  });

  it('resolves English relative phrases against today', () => {
    expect(first('let us talk tomorrow')).toBe('2026-08-11');
    expect(first('finish it next week')).toBe('2026-08-17');
  });

  it('resolves English weekday and month names', () => {
    expect(first('ping me on friday')).toBe('2026-08-14');
    expect(first('deadline is 3 September')).toBe('2026-09-03');
  });

  it('day after tomorrow yields one date, not two', () => {
    const hits = findDates('deliver day after tomorrow please', TODAY, ['en']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.iso).toBe('2026-08-12');
  });

  it("English phrases are ignored without 'en'", () => {
    expect(findDates('due tomorrow, day after tomorrow, next week', TODAY)).toEqual([]);
    expect(findDates('due tomorrow, day after tomorrow, next week', TODAY, ['de'])).toEqual([]);
  });

  it('dayLabel renders ISO in English and 15.08. in German', () => {
    expect(dayLabel('2026-08-15', TODAY, 'en')).toBe('2026-08-15');
    expect(dayLabel('2026-08-15', TODAY, 'de')).toBe('15.08.');
  });
});
