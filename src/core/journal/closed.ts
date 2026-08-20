/**
 * Mark a day finished or reopen it by hand (009, D3) — the manual switch next
 * to the day close-out (`applyClose` in `main/ipc/journal-day.ts`), which sets
 * the same field automatically whenever it runs.
 */

import type { JournalDay } from '@shared/types';
import type { DateLike } from '@core/vault/paths';
import { dayOf, requireDay } from './day';
import type { JournalStore } from './types';

/**
 * Set or clear the day's `closed` field.
 *
 * Marking finished writes `closed: <today>` — the calendar day this switch
 * was actually flipped, not necessarily the day being closed (a day can be
 * marked finished after the fact). Reopening writes `closed: null`, not a
 * removed key: a frontmatter patch can set a field but not delete it
 * (docs/VAULT-FORMAT.md), so "null" and "absent" have to mean the same thing
 * to every reader.
 *
 * Same hash-chain contract as `setMood`: without an `expectedHash`, the hash
 * just read is used, so a stale one from the caller — not a silently fresh
 * one — is what decides whether this is a conflict.
 */
export async function setClosed(
  store: JournalStore,
  date: DateLike,
  closed: boolean,
  options: { expectedHash?: string; now?: DateLike } = {},
): Promise<JournalDay> {
  const current = await requireDay(store, date);
  await store.write({
    path: current.doc.path,
    frontmatter: { closed: closed ? dayOf(options.now ?? new Date()) : null },
    expectedHash: options.expectedHash ?? current.doc.hash,
  });
  return (await requireDay(store, date)).day;
}
