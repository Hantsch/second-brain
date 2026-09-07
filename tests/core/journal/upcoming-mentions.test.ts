/* Upcoming mentions (070, D1): the forward-looking half of the loose-end rule.
 *
 * What is tested here is the seam, not the detection — the scan itself is
 * `announcementsOf`, already covered by `loose-ends.test.ts`. What is new is the
 * date window, and every one of its edges is a promise to a surface:
 *
 * - a sentence written today about a coming day shows up at once, with no model
 *   and no gateway anywhere near it (AC3);
 * - the handover is disjoint and gapless: upcoming up to and including the day
 *   pointed at, loose end from the day after, and the id is the same on both
 *   sides — the same item continuing, not two (AC2);
 * - a day file dated in the future is not read, the horizon cuts off, and the
 *   subtraction is the one `findLooseEnds` uses, so nothing gets nagged twice.
 */

import { describe, expect, it } from 'vitest';
import { findLooseEnds, findUpcomingMentions } from '@core/journal';
import type { LooseEndTodo } from '@core/journal';
import { LOOSE_END_BODY_LINE, looseEndDay } from './fixtures';

const TODAY = '2026-08-21';
/** `deadlineHorizonDays` as the settings default it. */
const HORIZON = 14;

/** Written today, pointing four days ahead with a date the user spelled out. */
const NOTARY = looseEndDay(
  TODAY,
  'Der Sprint zieht sich.',
  '',
  'Am 2026-08-25 ist der Notartermin.',
);

/** Written yesterday, pointing at today — the day the handover happens on. */
const TOMORROW = looseEndDay('2026-08-20', 'Morgen bin ich beim Notar.');

describe('findUpcomingMentions', () => {
  it('finds a dated announcement with no model and no gateway in sight', () => {
    const found = findUpcomingMentions([NOTARY], [], TODAY, HORIZON);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      day: TODAY,
      path: 'journal/2026/08/2026-08-21.md',
      quote: 'Am 2026-08-25 ist der Notartermin.',
      subject: 'Notartermin',
      refDate: '2026-08-25',
      origin: 'heuristic',
    });
    /* The line points into the file, not into the body: the sentence stands on
       body line 4, four lines behind the first one. */
    expect(found[0]?.line).toBe(LOOSE_END_BODY_LINE + 4);
  });

  it('is still upcoming on the target day itself, where the loose ends stay quiet', () => {
    const found = findUpcomingMentions([TOMORROW], [], TODAY, HORIZON);

    expect(found).toHaveLength(1);
    expect(found[0]?.refDate).toBe(TODAY);
    /* Nothing has passed unanswered while the day is still running. */
    expect(findLooseEnds([TOMORROW], [], TODAY)).toEqual([]);
  });

  it('hands the same sentence over to the loose ends a day later, with the same id', () => {
    const dayAfter = '2026-08-22';
    const upcoming = findUpcomingMentions([TOMORROW], [], TODAY, HORIZON);
    const ends = findLooseEnds([TOMORROW], [], dayAfter);

    expect(ends).toHaveLength(1);
    expect(ends[0]?.id).toBe(upcoming[0]?.id);
    expect(ends[0]?.quote).toBe(upcoming[0]?.quote);
    /* Disjoint, so neither surface shows it twice — and the announcement never
       falls between the two windows for a day. */
    expect(findUpcomingMentions([TOMORROW], [], dayAfter, HORIZON)).toEqual([]);
  });

  it('does not read a day file dated in the future', () => {
    const later = looseEndDay('2026-08-25', 'Morgen bin ich beim Notar.');

    expect(findUpcomingMentions([later], [], TODAY, HORIZON)).toEqual([]);
  });

  it('cuts off beyond the horizon — a mention two months out is no reminder', () => {
    const far = looseEndDay(TODAY, 'Am 2026-10-15 ist der Notartermin.');

    expect(findUpcomingMentions([far], [], TODAY, HORIZON)).toEqual([]);
    /* 55 days out: it is the horizon that drops it, not the reading of it. */
    expect(findUpcomingMentions([far], [], TODAY, 60)).toHaveLength(1);
  });

  it('stays quiet when a todo with a deadline already carries the announcement', () => {
    const dated: LooseEndTodo = { text: 'Notartermin vorbereiten', due: '2026-08-25' };
    const undated: LooseEndTodo = { text: 'Notartermin vorbereiten', due: null };

    expect(findUpcomingMentions([NOTARY], [dated], TODAY, HORIZON)).toEqual([]);
    /* Without a deadline the todo is no home for it — the mention stays. */
    expect(findUpcomingMentions([NOTARY], [undated], TODAY, HORIZON)).toHaveLength(1);
  });

  it('stays quiet once a later day links the day and picks the subject back up', () => {
    const answered = looseEndDay(
      TODAY,
      'Beim Notar war alles in zehn Minuten erledigt, siehe [[2026-08-20]].',
    );

    expect(findUpcomingMentions([TOMORROW, answered], [], TODAY, HORIZON)).toEqual([]);
    /* Without the link the mention is still open — being named is no answer. */
    expect(
      findUpcomingMentions(
        [TOMORROW, looseEndDay(TODAY, 'Beim Notar war alles erledigt.')],
        [],
        TODAY,
        HORIZON,
      ),
    ).toHaveLength(1);
  });

  it('lists the nearest day first, whatever order the days arrive in', () => {
    const far = looseEndDay(TODAY, 'Am 2026-08-28 ist der Notartermin.');

    const found = findUpcomingMentions([far, TOMORROW, NOTARY], [], TODAY, HORIZON);

    expect(found.map((mention) => mention.refDate)).toEqual([TODAY, '2026-08-25', '2026-08-28']);
  });
});
