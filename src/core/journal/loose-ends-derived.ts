/**
 * Loose ends derived once per index, not once per caller.
 *
 * Several surfaces read the same stock — the dashboard's reminders, the day
 * view, the gardener, the upcoming-mentions tile — and each of them used to
 * rebuild the day list, fold every day for the subtraction and run the scan on
 * its own. The result depends on nothing but the index and `today`, so it is
 * computed once and handed to everyone who asks with the same two.
 *
 * Why keying on the `VaultIndex` object is safe: `IndexService` never mutates
 * an index in place — every refresh that changes anything assigns a fresh
 * object, and one that changes nothing leaves the old one untouched. Same
 * object therefore means same files; a new object means recompute. The
 * `WeakMap` lets an index that nobody holds any more take its entry with it.
 *
 * Still a pure derivation (CLAUDE.md: "the index is derived"): nothing here is
 * written anywhere, and dropping the cache changes no output, only its cost.
 */

import { deriveJournalDays } from '@core/index/journal';
import type { IndexedDoc } from '@core/index/types';
import type { LooseEnd, Todo, UpcomingMention } from '@shared/types';
import { findLooseEnds, resolutionCheck } from './loose-ends';
import type { LooseEndDay, LooseEndTodo } from './loose-ends';
import { findUpcomingMentions } from './upcoming-mentions';

/**
 * Everything the derivation reads off an index. Deliberately narrower than
 * `VaultIndex` — a caller with only a partial view (the gardener's
 * `GardenerIndexData`) can supply this without lying about the rest.
 */
interface LooseEndIndexSource {
  docs: readonly IndexedDoc[];
  todos: readonly Todo[];
}

/** Everything the loose-end surfaces read off one index for one day. */
export interface LooseEndDerivation {
  days: LooseEndDay[];
  todos: LooseEndTodo[];
  /** `resolutionCheck` over `days` and `todos`, prepared once. */
  resolve: ReturnType<typeof resolutionCheck>;
  looseEnds: LooseEnd[];
  /** `findUpcomingMentions` over the same stock, memoized per horizon. */
  upcoming(horizonDays: number): UpcomingMention[];
}

interface CacheEntry {
  key: string;
  value: LooseEndDerivation;
}

const cache = new WeakMap<LooseEndIndexSource, CacheEntry>();

/**
 * Every input besides the index itself that the derivation depends on. The one
 * place to extend when another input arrives (document language, for one) — a
 * missed input here would hand out a stale answer without any error.
 */
function derivationKey(today: string): string {
  return today;
}

/** The index's journal days, joined to their docs for the body — days without a doc are skipped. */
function daysOf(index: LooseEndIndexSource): LooseEndDay[] {
  const byPath = new Map(index.docs.map((doc) => [doc.path, doc] as const));
  const days: LooseEndDay[] = [];
  for (const entry of deriveJournalDays(index.docs)) {
    const doc = byPath.get(entry.path);
    if (doc === undefined) continue;
    days.push({
      day: { date: entry.date, path: entry.path },
      doc: { body: doc.body, bodyLine: doc.bodyLine },
    });
  }
  return days;
}

function derive(index: LooseEndIndexSource, today: string): LooseEndDerivation {
  const days = daysOf(index);
  const todos: LooseEndTodo[] = index.todos.map((todo) => ({ text: todo.text, due: todo.due }));
  const resolve = resolutionCheck(days, todos);
  const looseEnds = findLooseEnds(days, todos, today, resolve);
  const upcomingByHorizon = new Map<number, UpcomingMention[]>();
  return {
    days,
    todos,
    resolve,
    looseEnds,
    upcoming: (horizonDays) => {
      const known = upcomingByHorizon.get(horizonDays);
      if (known !== undefined) return known;
      const found = findUpcomingMentions(days, todos, today, horizonDays);
      upcomingByHorizon.set(horizonDays, found);
      return found;
    },
  };
}

/**
 * The loose-end derivation for `index` on `today`, computed at most once per
 * index and key. The returned arrays are shared between callers — read them,
 * never mutate them.
 */
export function looseEndsDerived(index: LooseEndIndexSource, today: string): LooseEndDerivation {
  const key = derivationKey(today);
  const cached = cache.get(index);
  if (cached !== undefined && cached.key === key) return cached.value;
  const value = derive(index, today);
  cache.set(index, { key, value });
  return value;
}
