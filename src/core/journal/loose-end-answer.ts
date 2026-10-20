/**
 * Answering a loose end (020, D5): my own words about what happened, written
 * into today's "Day" stream. `appendEntry` (`stream.ts`) is the one path that
 * writes my own prose into a Day section — used here as-is, nothing
 * reimplemented.
 *
 * The answer is prefixed with a back-reference wikilink to the day that made
 * the announcement — `[[<announcing day>]]`, the same bare-ISO-date link
 * `findLooseEnds`' own `resolutionCheck` already recognizes as "a later day picks
 * this day's subject back up" (`loose-ends.ts`). That heuristic only fires
 * when the answer happens to repeat one of the announcement's subject words;
 * an answer that doesn't (`"Erledigt."` for `"Morgen bin ich beim Notar."`)
 * needs the explicit record `main/loose-end-state.ts` keeps — this module
 * only writes the vault side, the id bookkeeping is the caller's job (it
 * needs the announcing day's file path and a clock, neither of which belongs
 * in `src/core`).
 *
 * Hash-guarded exactly like every other write into a Day file (`setClosed`,
 * `appendEntry`'s own `expectedHash`): a stale hash raises `conflict` instead
 * of silently overwriting a change made elsewhere.
 */

import type { DocLanguage } from '@shared/types';
import type { DateLike } from '@core/vault/paths';
import { appendEntry } from './stream';
import { JournalError } from './types';
import type { JournalStore } from './types';

export interface AnswerLooseEndOptions {
  docLanguage?: DocLanguage;
  expectedHash?: string;
}

/**
 * Writes `text` into `today`'s Day stream, preceded by `[[<announcingDay>]]`.
 * The text itself lands exactly as typed — trimmed only at the very ends, the
 * same convention `appendEntry` already uses. `today`'s file is created if
 * it's missing, same as `appendEntry`.
 */
export async function answerLooseEnd(
  store: JournalStore,
  today: DateLike,
  announcingDay: string,
  text: string,
  options: AnswerLooseEndOptions = {},
): Promise<{ path: string; hash: string }> {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (trimmed.length === 0) {
    throw new JournalError('invalid', 'Eine Antwort ohne Text wird nicht protokolliert.');
  }
  return appendEntry(store, today, `[[${announcingDay}]] ${trimmed}`, options);
}
