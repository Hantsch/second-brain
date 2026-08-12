/* Ruhezeiten der Erinnerungen und schon gemeldete Fälligkeiten.
   Beides liegt in `<vault>/.secondbrain/overview.json` — nicht in den
   Vault-Einstellungen.

   Warum nicht in `settings.json`:
   - Einstellungen sind **Konfiguration**: eine überschaubare Menge Felder, die
     der Nutzer selbst setzt, über Defaults gemergt und im Verhalten-Tab
     sichtbar. Eine wachsende Karte gehashter Erinnerungs-IDs ist keine
     Einstellung, sondern Bedienzustand.
   - `deepMerge` kann nichts entfernen: abgelaufene Ruhezeiten würden für immer
     in der Datei stehen. Hier wird beim Laden aufgeräumt.
   - `.secondbrain/` ist laut VAULT-FORMAT.md ableitbar und darf gelöscht werden.
     Genau das trifft zu: fehlt die Datei, mahnt eben alles wieder — es ist
     nichts verloren. Eine gelöschte `settings.json` dagegen kostet Konfiguration.
   - Der Zustand reist trotzdem mit dem Vault: wer ihn auf einen anderen Rechner
     kopiert, nimmt seine Ruhezeiten mit. Deshalb nicht in `userData`.

   Geschrieben wird atomar über `fs-json` — dieselbe Mechanik wie bei den
   Einstellungen, nicht über den `VaultStore`: das ist keine Notiz mit
   Frontmatter, sondern Buchhaltung der App. */

import { join } from 'node:path';
import { readJson, writeJsonAtomic } from './fs-json';

/** Vault-relativer Ort. Steht auch in docs/VAULT-FORMAT.md. */
export const OVERVIEW_STATE_FILE = '.secondbrain/overview.json';

export const OVERVIEW_STATE_VERSION = 1;

/** So lange bleibt eine Meldung in der Buchhaltung, bevor sie aufgeräumt wird. */
const ANNOUNCE_KEEP_DAYS = 7;

interface StoredOverviewState {
  version: number;
  /** Erinnerungs-ID → Kalendertag, ab dem sie wieder mahnt (ISO). */
  snoozes: Record<string, string>;
  /** Erinnerungs-ID → Kalendertag, an dem sie gemeldet wurde (ISO). */
  announced: Record<string, string>;
}

function empty(): StoredOverviewState {
  return { version: OVERVIEW_STATE_VERSION, snoozes: {}, announced: {} };
}

/** Nur Einträge, die wie `YYYY-MM-DD` aussehen — alles andere ist kein Tag. */
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
 * Der Zustand eines geöffneten Vaults. Eine Instanz je Vault-Wurzel; wer sie
 * über `overviewState()` holt, bekommt immer dieselbe.
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
   * Lädt den Zustand und räumt dabei auf: abgelaufene Ruhezeiten und alte
   * Meldungen fallen heraus. Fehlt oder taugt die Datei nicht, ist der Zustand
   * leer — mahnen ist der ehrliche Vorgabefall.
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

  /** Ruhezeiten als Karte, wie `core/overview/reminders` sie erwartet. */
  snoozes(): ReadonlyMap<string, string> {
    return new Map(Object.entries(this.data.snoozes));
  }

  /** Bis wann diese Erinnerung ruht, oder `null`. */
  snoozedUntil(id: string): string | null {
    return this.data.snoozes[id] ?? null;
  }

  /** Stellt eine Erinnerung ruhig: `until` ist der Tag, ab dem sie wieder mahnt. */
  async snooze(id: string, until: string): Promise<void> {
    this.data.snoozes[id] = until;
    /* Ruhig gestellt heißt auch: heute nicht mehr melden. */
    delete this.data.announced[id];
    await this.save();
  }

  /**
   * Hebt die Ruhe auf: der Eintrag fällt weg, die Erinnerung mahnt wieder. Der
   * Rückweg zu `snooze` — ein Datum auf „heute" zu setzen wäre keiner, weil
   * `prune` es beim nächsten Laden ohnehin entfernt und die Erinnerung bis dahin
   * ruhig bliebe.
   */
  async unsnooze(id: string): Promise<void> {
    if (this.data.snoozes[id] === undefined) return;
    delete this.data.snoozes[id];
    await this.save();
  }

  /** An welchem Tag wurde diese Erinnerung gemeldet? */
  announcedOn(id: string): string | null {
    return this.data.announced[id] ?? null;
  }

  /** Welche dieser Erinnerungen wurden an diesem Tag noch nicht gemeldet? */
  unannounced(ids: readonly string[], today: string): string[] {
    return ids.filter((id) => this.data.announced[id] !== today);
  }

  /** Schreibt die Meldung fort. Ohne IDs wird nichts geschrieben. */
  async markAnnounced(ids: readonly string[], today: string): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) this.data.announced[id] = today;
    await this.save();
  }

  /** Abgelaufene Ruhezeiten und alte Meldungen entfernen. */
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

/* Eine Instanz je Vault. Der Vault wechselt selten; die Karte bleibt klein und
   wird beim Wechsel geleert, damit kein fremder Zustand hängen bleibt. */
const loaded = new Map<string, Promise<OverviewState>>();

/** Der Zustand dieses Vaults. Beim ersten Aufruf wird die Datei gelesen. */
export function overviewState(root: string, today: string): Promise<OverviewState> {
  const known = loaded.get(root);
  if (known !== undefined) return known;
  loaded.clear();
  const pending = OverviewState.load(root, today);
  loaded.set(root, pending);
  return pending;
}

/** Vergisst den geladenen Zustand — für Tests und beim Schließen des Vaults. */
export function forgetOverviewState(): void {
  loaded.clear();
}
