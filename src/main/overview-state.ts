/* Snooze periods for reminders and already-announced due dates.
   Both live in `<vault>/.secondbrain/overview.json` — not in the
   vault settings.

   Why not in `settings.json`:
   - Settings are **configuration**: a manageable set of fields the user sets
     themselves, merged over defaults, visible in the behavior tab. A growing
     map of hashed reminder IDs isn't a setting, it's operational state.
   - `deepMerge` can't remove anything: expired snoozes would stay in the file
     forever. This is where cleanup happens on load.
   - `.secondbrain/` is derivable per VAULT-FORMAT.md and may be deleted.
     That's exactly the case here: if the file is missing, everything just
     nags again — nothing is lost. A deleted `settings.json`, by contrast,
     costs real configuration.
   - The state still travels with the vault: whoever copies it to another
     machine takes their snoozes along. That's why it's not in `userData`.

   Written atomically via `fs-json` — the same mechanism as the settings, not
   via the `VaultStore`: this isn't a note with frontmatter, it's the app's
   bookkeeping. */

import { join } from 'node:path';
import { readJson, writeJsonAtomic } from './fs-json';

/** Vault-relative location. Also documented in docs/VAULT-FORMAT.md. */
export const OVERVIEW_STATE_FILE = '.secondbrain/overview.json';

export const OVERVIEW_STATE_VERSION = 1;

/** How long an announcement stays in the bookkeeping before it's cleaned up. */
const ANNOUNCE_KEEP_DAYS = 7;

interface StoredOverviewState {
  version: number;
  /** Reminder ID → calendar day from which it nags again (ISO). */
  snoozes: Record<string, string>;
  /** Reminder ID → calendar day on which it was announced (ISO). */
  announced: Record<string, string>;
}

function empty(): StoredOverviewState {
  return { version: OVERVIEW_STATE_VERSION, snoozes: {}, announced: {} };
}

/** Only entries that look like `YYYY-MM-DD` — anything else isn't a day. */
function readDays(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[key] = day;
  }
  return out;
}

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * The state of an open vault. One instance per vault root; whoever fetches it
 * via `overviewState()` always gets the same one.
 */
export class OverviewState {
  private data: StoredOverviewState;

  private constructor(
    readonly root: string,
    data: StoredOverviewState,
  ) {
    this.data = data;
  }

  private get file(): string {
    return join(this.root, ...OVERVIEW_STATE_FILE.split('/'));
  }

  /**
   * Loads the state and cleans up as it goes: expired snoozes and old
   * announcements fall away. If the file is missing or unusable, the state is
   * empty — nagging is the honest default case.
   */
  static async load(root: string, today: string): Promise<OverviewState> {
    const stored = await readJson<Partial<StoredOverviewState>>(
      join(root, ...OVERVIEW_STATE_FILE.split('/')),
    );
    const state = new OverviewState(root, empty());
    if (stored !== null) {
      state.data = {
        version: OVERVIEW_STATE_VERSION,
        snoozes: readDays(stored.snoozes),
        announced: readDays(stored.announced),
      };
      state.prune(today);
    }
    return state;
  }

  /** Snoozes as a map, the way `core/overview/reminders` expects them. */
  snoozes(): ReadonlyMap<string, string> {
    return new Map(Object.entries(this.data.snoozes));
  }

  /** Until when this reminder is snoozed, or `null`. */
  snoozedUntil(id: string): string | null {
    return this.data.snoozes[id] ?? null;
  }

  /** Snoozes a reminder: `until` is the day from which it nags again. */
  async snooze(id: string, until: string): Promise<void> {
    this.data.snoozes[id] = until;
    /* Snoozed also means: don't announce it again today. */
    delete this.data.announced[id];
    await this.save();
  }

  /**
   * Lifts the snooze: the entry drops out, the reminder nags again. The
   * reverse of `snooze` — setting a date to "today" wouldn't be one, because
   * `prune` would remove it on the next load anyway, and the reminder would
   * stay snoozed until then.
   */
  async unsnooze(id: string): Promise<void> {
    if (this.data.snoozes[id] === undefined) return;
    delete this.data.snoozes[id];
    await this.save();
  }

  /** On which day was this reminder announced? */
  announcedOn(id: string): string | null {
    return this.data.announced[id] ?? null;
  }

  /** Which of these reminders haven't been announced on this day yet? */
  unannounced(ids: readonly string[], today: string): string[] {
    return ids.filter((id) => this.data.announced[id] !== today);
  }

  /** Records the announcement. Nothing is written without IDs. */
  async markAnnounced(ids: readonly string[], today: string): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) this.data.announced[id] = today;
    await this.save();
  }

  /** Remove expired snoozes and old announcements. */
  prune(today: string): boolean {
    const keepFrom = shiftDay(today, -ANNOUNCE_KEEP_DAYS);
    let changed = false;
    for (const [id, until] of Object.entries(this.data.snoozes)) {
      if (until > today) continue;
      delete this.data.snoozes[id];
      changed = true;
    }
    for (const [id, day] of Object.entries(this.data.announced)) {
      if (day >= keepFrom) continue;
      delete this.data.announced[id];
      changed = true;
    }
    return changed;
  }

  private async save(): Promise<void> {
    await writeJsonAtomic(this.file, this.data);
  }
}

/* One instance per vault. The vault changes rarely; the map stays small and
   is cleared on a switch so no foreign state lingers. */
const loaded = new Map<string, Promise<OverviewState>>();

/** This vault's state. The file is read on the first call. */
export function overviewState(root: string, today: string): Promise<OverviewState> {
  const known = loaded.get(root);
  if (known !== undefined) return known;
  loaded.clear();
  const pending = OverviewState.load(root, today);
  loaded.set(root, pending);
  return pending;
}

/** Forgets the loaded state — for tests and when closing the vault. */
export function forgetOverviewState(): void {
  loaded.clear();
}
