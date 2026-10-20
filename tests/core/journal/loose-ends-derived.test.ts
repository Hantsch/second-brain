/* Loose ends derived once per index (056, D1).
 *
 * `looseEndsDerived` is a cache in front of `findLooseEnds`, so two things are
 * pinned here: it answers exactly what the rule answers on the same stock, and
 * it asks the rule again precisely when an input changed — a new `today`, or a
 * refreshed index. The last test also pins the invariant the whole cache rests
 * on: a refresh that changes a file hands out a new `VaultIndex` object.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexService } from '@core/index/service';
import { findLooseEnds } from '@core/journal/loose-ends';
import type * as LooseEnds from '@core/journal/loose-ends';
import { findUpcomingMentions, looseEndsDerived } from '@core/journal';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { journalFile, journalPathOf } from './fixtures';
import { NOW_MS } from '../../helpers/time';

/* The real rule, wrapped in a spy — so the count shows how often the cache
   actually asked it, and the output is still the rule's own. */
vi.mock('@core/journal/loose-ends', async (importOriginal) => {
  const actual = await importOriginal<typeof LooseEnds>();
  return { ...actual, findLooseEnds: vi.fn(actual.findLooseEnds) };
});

const TODAY = '2026-08-21';
const NEXT_DAY = '2026-08-22';
const MONDSEE_DAY = '2026-08-12';
const NOTARY_DAY = '2026-08-18';

/** A day file with a `## Todos` section after the stream. */
function withTodos(file: string, ...todos: string[]): string {
  return `${file}\n## Todos\n\n${todos.join('\n')}\n`;
}

function vaultFiles(): Record<string, string> {
  return {
    [journalPathOf(MONDSEE_DAY)]: journalFile(MONDSEE_DAY, 'Übermorgen fahre ich nach Mondsee.'),
    /* The todo carries the notary with a deadline, so that announcement is
       settled — proof the todos reach the subtraction. */
    [journalPathOf(NOTARY_DAY)]: withTodos(
      journalFile(NOTARY_DAY, 'Morgen bin ich beim Notar.'),
      '- [ ] Notartermin nachbereiten @due:2026-08-30',
    ),
    [journalPathOf(TODAY)]: journalFile(TODAY, 'Morgen gehe ich zum Zahnarzt.'),
  };
}

async function openService(): Promise<{ store: MemoryVaultStore; service: IndexService }> {
  const store = new MemoryVaultStore({ files: vaultFiles(), now: new Date(NOW_MS) });
  const service = await IndexService.open(store, {
    persistence: null,
    now: () => new Date(NOW_MS),
  });
  return { store, service };
}

const spy = vi.mocked(findLooseEnds);

beforeEach(() => {
  spy.mockClear();
});

describe('looseEndsDerived', () => {
  it('the derivation equals findLooseEnds on the same stock', async () => {
    const { service } = await openService();
    const derived = looseEndsDerived(service.index(), TODAY);

    /* In `deriveJournalDays` order — newest first, as every other caller sees them. */
    expect(derived.days.map((entry) => entry.day)).toEqual(
      [TODAY, NOTARY_DAY, MONDSEE_DAY].map((date) => ({ date, path: journalPathOf(date) })),
    );
    expect(derived.todos).toEqual([{ text: 'Notartermin nachbereiten', due: '2026-08-30' }]);

    const direct = findLooseEnds(derived.days, derived.todos, TODAY);
    expect(derived.looseEnds).toEqual(direct);
    expect(derived.looseEnds.map((end) => end.day)).toEqual([MONDSEE_DAY]);

    const upcoming = derived.upcoming(7);
    expect(upcoming).toEqual(findUpcomingMentions(derived.days, derived.todos, TODAY, 7));
    expect(upcoming.map((mention) => mention.refDate)).toEqual([NEXT_DAY]);
    /* Same horizon, same entry: the memoized list, not a second scan. */
    expect(derived.upcoming(7)).toBe(upcoming);
  });

  it('the same index and day derive once', async () => {
    const { service } = await openService();
    const index = service.index();

    const first = looseEndsDerived(index, TODAY);
    const second = looseEndsDerived(index, TODAY);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second.looseEnds).toBe(first.looseEnds);
  });

  it('a new day recomputes', async () => {
    const { service } = await openService();
    const index = service.index();

    const first = looseEndsDerived(index, TODAY);
    const next = looseEndsDerived(index, NEXT_DAY);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(next).not.toBe(first);
    /* On the 22nd, the 18th's notary is still settled; the 21st's own
       announcement has not come due until the 23rd. */
    expect(next.looseEnds.map((end) => end.day)).toEqual([MONDSEE_DAY]);
  });

  it('a refreshed index recomputes', async () => {
    const { store, service } = await openService();
    const before = service.index();
    const first = looseEndsDerived(before, TODAY);
    expect(first.looseEnds.map((end) => end.day)).toEqual([MONDSEE_DAY]);

    const path = journalPathOf(NOTARY_DAY);
    const current = await store.readText(path);
    if (current === null) throw new Error(`missing fixture: ${path}`);
    await store.writeText(
      path,
      current.replace(
        'Morgen bin ich beim Notar.',
        'Morgen bin ich beim Notar.\n\nÜbermorgen hole ich das Fahrrad ab.',
      ),
    );
    await service.refresh([path]);
    const after = service.index();

    expect(after).not.toBe(before);
    const second = looseEndsDerived(after, TODAY);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(second.looseEnds.map((end) => [end.day, end.refDate])).toEqual([
      [MONDSEE_DAY, '2026-08-14'],
      [NOTARY_DAY, '2026-08-20'],
    ]);
  });
});
