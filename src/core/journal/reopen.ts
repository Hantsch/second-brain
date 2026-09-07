/**
 * Reopen a day if it's closed — the guard a save-path uses before writing into
 * a day someone marked finished, so a stray edit after close-out doesn't need
 * a manual reopen first (068, D1).
 */

import type { DateLike } from '@core/vault/paths';
import { requireDay } from './day';
import type { JournalStore } from './types';

/**
 * Clear the day's `closed` field, but only if it's actually set.
 *
 * An already-open day is left untouched — no write, `reopened: false`, and the
 * hash just read is handed back unchanged. A closed day is reopened the same
 * way `setClosed(store, date, false)` would: `closed: null`, not a removed
 * key (docs/VAULT-FORMAT.md — a frontmatter patch can set a field but not
 * delete it). Unlike `setClosed`, this returns the **post-write** hash, so a
 * caller that immediately writes again doesn't raise a false conflict against
 * the hash it read before this call.
 *
 * Same hash-chain contract as `setClosed`: without an `expectedHash`, the hash
 * just read is used, so a stale one from the caller — not a silently fresh
 * one — is what decides whether this is a conflict.
 */
export async function reopenIfClosed(
  store: JournalStore,
  date: DateLike,
  options: { expectedHash?: string } = {},
): Promise<{ reopened: boolean; hash: string }> {
  const current = await requireDay(store, date);
  if (!current.day.closed) {
    return { reopened: false, hash: current.doc.hash };
  }
  await store.write({
    path: current.doc.path,
    frontmatter: { closed: null },
    expectedHash: options.expectedHash ?? current.doc.hash,
  });
  const after = await requireDay(store, date);
  return { reopened: true, hash: after.doc.hash };
}
