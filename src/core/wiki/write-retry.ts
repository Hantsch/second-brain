/**
 * Read, build, write — and once more if somebody wrote the file in between.
 *
 * `wiki/log.md` and `wiki/index.md` are the two files a digestion does not own:
 * it adds its line to whatever is already there. Both writes therefore carry the
 * hash of the very text they just read — docs/VAULT-FORMAT.md, "never write
 * without checking the hash first". But for an append a conflict is not an
 * answer anybody can use: the honest reaction is to read the new text and add
 * the line to *that*, which loses neither the foreign change nor this run's
 * entry.
 *
 * Bounded on purpose: three attempts, then the conflict is the answer. A file
 * somebody writes continuously must not turn this into an endless loop (story
 * 050, D-e). The module lock already keeps this process out of its own way —
 * this guard is for the gardener and for a hand edit, which the lock, being
 * process-local, cannot see.
 *
 * One case is deliberately **not** retried: a hash the caller handed in. That is
 * a claim about a state the caller read itself, and a claim that no longer holds
 * has to reach it — retrying would quietly write over exactly the change the
 * caller asked to be told about (docs/VAULT-FORMAT.md). Only the hash this
 * function reads for itself may be read again.
 */

import { sha256 } from '@core/vault/hash';
import type { WikiStore } from './types';

/** Attempts including the first one — three, per story 050, D-e. */
export const MAX_WRITE_ATTEMPTS = 3;

/** The file as it stands right now. `null` at the callback means: there is none yet. */
export interface CurrentText {
  content: string;
  hash: string;
}

export interface WriteRetryOptions {
  /**
   * Hash the caller read. Given, it is the only hash used and there is **no**
   * retry: the caller wants the conflict, not a second attempt in its name.
   */
  expectedHash?: string;
  /** Only for the self-read hash. Default `MAX_WRITE_ATTEMPTS`. */
  attempts?: number;
}

/**
 * `build` gets the current text and returns the full new content. It is called
 * again for every attempt, so it must derive everything from its argument and
 * keep nothing from the attempt before.
 */
export async function writeTextWithRetry(
  store: WikiStore,
  path: string,
  build: (current: CurrentText | null) => string,
  options: WriteRetryOptions = {},
): Promise<{ path: string; content: string }> {
  const attempts =
    options.expectedHash === undefined ? Math.max(1, options.attempts ?? MAX_WRITE_ATTEMPTS) : 1;
  for (let attempt = 1; ; attempt += 1) {
    const current = await readCurrent(store, path);
    const expected = options.expectedHash ?? current?.hash;
    const content = build(current);
    try {
      await store.writeText(
        path,
        content,
        expected === undefined ? {} : { expectedHash: expected },
      );
      return { path, content };
    } catch (error) {
      if (attempt >= attempts || !isConflict(error)) throw error;
    }
  }
}

/** Content plus the hash the store will compare against — `null` if there is no file. */
async function readCurrent(store: WikiStore, path: string): Promise<CurrentText | null> {
  const content = await store.readText(path);
  return content === null ? null : { content, hash: sha256(content) };
}

/**
 * A conflict, whoever raised it: `VaultConflictError`, `WikiError('conflict')`
 * and every other carrier of the `code` field the IPC layer speaks. Anything
 * else — a disk error, an unreadable frontmatter — is not something a second
 * attempt would fix, so it goes straight to the caller.
 *
 * Exported so a caller that cannot use `writeTextWithRetry` itself — because it
 * writes through `writePage`'s frontmatter merge, not a raw text `build` — can
 * still bound its own re-read loop on the same "is this worth retrying?" check
 * (`updateOverview` in `ingest.ts`, story 050, D-e).
 */
export function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'conflict'
  );
}
