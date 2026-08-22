/* The ids of loose ends (020) I've already answered — so the next
   maintenance run doesn't report them again.

   Lives in `<vault>/.secondbrain/loose-ends.json` — its own file, deliberately
   separate from 017's `dismissed`/`snoozed` list (`gardener-state.ts`):
   answering is a resolution tied to a vault write (my own words landed in
   today's file), not a "looks fine" click, and it needs its own record — the
   day that announced it and the file the answer landed in, not just an id.

   Same file mechanics as `gardener-state.ts`: JSON under `.secondbrain/`,
   atomic write (tmp + rename), and a missing or unreadable file means
   "nothing answered yet" rather than an error — `.secondbrain/` may be
   deleted at any time (CLAUDE.md), and losing this file only means an
   already-answered loose end might be reported once more, never that
   something written to the vault is lost. */

import { join } from 'node:path';
import { readJson, writeJsonAtomic } from './fs-json';

/** Vault-relative location. Also documented in docs/VAULT-FORMAT.md. */
export const LOOSE_END_STATE_FILE = '.secondbrain/loose-ends.json';

export const LOOSE_END_STATE_VERSION = 1;

/** One answered loose end, as it is stored. */
export interface AnsweredLooseEnd {
  id: string;
  /** The day that made the announcement (`YYYY-MM-DD`). */
  day: string;
  /** The file the answer was written to — today's day file at the time. */
  path: string;
  /** ISO timestamp of the moment it was answered. */
  answeredAt: string;
}

interface StoredLooseEnds {
  version: number;
  answered: AnsweredLooseEnd[];
}

function empty(): StoredLooseEnds {
  return { version: LOOSE_END_STATE_VERSION, answered: [] };
}

function isAnsweredRecord(value: unknown): value is AnsweredLooseEnd {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['day'] === 'string' &&
    typeof record['path'] === 'string' &&
    typeof record['answeredAt'] === 'string'
  );
}

function readAnswered(value: unknown): AnsweredLooseEnd[] {
  return Array.isArray(value) ? value.filter(isAnsweredRecord) : [];
}

/**
 * The answered-loose-ends state of an open vault. One instance per vault
 * root, same caching contract as `gardenerState()`.
 */
export class LooseEndState {
  private data: StoredLooseEnds;

  private constructor(
    readonly root: string,
    data: StoredLooseEnds,
  ) {
    this.data = data;
  }

  private get file(): string {
    return join(this.root, ...LOOSE_END_STATE_FILE.split('/'));
  }

  static async load(root: string): Promise<LooseEndState> {
    const stored = await readJson<Partial<StoredLooseEnds>>(
      join(root, ...LOOSE_END_STATE_FILE.split('/')),
    );
    const data =
      stored === null
        ? empty()
        : { version: LOOSE_END_STATE_VERSION, answered: readAnswered(stored.answered) };
    return new LooseEndState(root, data);
  }

  /** Ids already answered — what the next maintenance run must not report again. */
  answeredIds(): ReadonlySet<string> {
    return new Set(this.data.answered.map((entry) => entry.id));
  }

  /** Every answered record, in write order. */
  answered(): readonly AnsweredLooseEnd[] {
    return this.data.answered;
  }

  /** Records `entry` as answered. Idempotent: answering twice keeps one record. */
  async recordAnswered(entry: AnsweredLooseEnd): Promise<void> {
    if (this.data.answered.some((existing) => existing.id === entry.id)) return;
    this.data.answered = [...this.data.answered, entry];
    await this.write();
  }

  private async write(): Promise<void> {
    await writeJsonAtomic(this.file, this.data);
  }
}

/* One instance per vault, same reasoning as `gardener-state.ts`: the vault
   changes rarely, and clearing on a switch keeps no foreign state around. */
const loaded = new Map<string, Promise<LooseEndState>>();

/** This vault's answered-loose-ends state. The file is read on the first call. */
export function looseEndState(root: string): Promise<LooseEndState> {
  const known = loaded.get(root);
  if (known !== undefined) return known;
  loaded.clear();
  const pending = LooseEndState.load(root);
  loaded.set(root, pending);
  return pending;
}

/** Forgets the loaded state — for tests and when closing the vault. */
export function forgetLooseEndState(): void {
  loaded.clear();
}
