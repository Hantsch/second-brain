/* Der letzte Pflegebericht und die Menge „passt so".
   Beides liegt in `<vault>/.secondbrain/gardener.json` — nicht in den
   Vault-Einstellungen und nicht im Suchindex.

   Warum eine eigene Datei:
   - **Einstellungen sind Konfiguration.** Eine Liste gefundener Befunde und eine
     wachsende Menge ausgeblendeter Kennungen sind Bedienzustand — dieselbe
     Begründung wie bei den Ruhezeiten in `overview-state.ts`. `deepMerge` kann
     außerdem nichts entfernen; ein zurückgenommenes „passt so" bliebe für immer.
   - **Aber auch nicht in `overview.json`.** Ein Bericht ist zehn Kilobyte
     Befunde, der Ruhezustand sind zwei Karten mit Kalendertagen. Wer den Bericht
     wegwirft (er ist ableitbar: einmal prüfen genügt), soll dabei nicht die
     Ruhezeiten der Erinnerungen verlieren.
   - **`.secondbrain/` darf gelöscht werden** (VAULT-FORMAT.md). Fehlt die Datei,
     gibt es keinen Bericht — die Oberfläche sagt „noch nicht geprüft" und
     behauptet keine 100. Das ist der ehrliche Verlust.

   Der Bericht wird **roh** gespeichert: alle Befunde des Laufs, auch die später
   ausgeblendeten, dazu die Größe des Bestands zum Zeitpunkt des Laufs. Was der
   Screen sieht, entsteht erst in `present()` — gefiltert und mit neu gerechneter
   Gesundheit. Nur so bleibt „passt so" zurücknehmbar, ohne noch einmal zu prüfen,
   und nur so passt der Gesundheitswert immer zu der Liste, die daneben steht. */

import { join } from 'node:path';
import { healthScore } from '@core/gardener';
import type { GardenerFinding, GardenerReport } from '@shared/types';
import { readJson, writeJsonAtomic } from './fs-json';

/** Vault-relativer Ort. Steht auch in docs/VAULT-FORMAT.md. */
export const GARDENER_STATE_FILE = '.secondbrain/gardener.json';

export const GARDENER_STATE_VERSION = 1;

/** Ein Lauf, so wie er gespeichert wird — vor jeder Filterung. */
export interface StoredRun {
  ranAt: string;
  usedLlm: boolean;
  /** Alle Befunde des Laufs, ungefiltert. */
  findings: GardenerFinding[];
  advice: string[];
  /** `vaultSize` zum Zeitpunkt des Laufs — die Bezugsgröße der Gesundheit. */
  size: number;
}

/** Ein erledigter Befund mit der Marke, unter der der Fix zurückgedreht wird. */
export interface FixedFinding {
  id: string;
  undoToken: string;
}

interface StoredGardener {
  version: number;
  run: StoredRun | null;
  /** Kennungen, die der Nutzer als „passt so" markiert hat. */
  dismissed: string[];
  /**
   * Befunde, die ein Fix geschrieben hat. Sie bleiben im Lauf stehen und werden
   * nur ausgeblendet — so bringt `undoFix` sie zurück, ohne neu zu prüfen. Ein
   * neuer Lauf leert die Liste: dann zählt, was in den Dateien steht.
   */
  fixed: FixedFinding[];
}

function empty(): StoredGardener {
  return { version: GARDENER_STATE_VERSION, run: null, dismissed: [], fixed: [] };
}

function isFinding(value: unknown): value is GardenerFinding {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['kind'] === 'string' &&
    typeof record['severity'] === 'string' &&
    typeof record['title'] === 'string' &&
    Array.isArray(record['paths'])
  );
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readFixed(value: unknown): FixedFinding[] {
  if (!Array.isArray(value)) return [];
  const result: FixedFinding[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = record['id'];
    const undoToken = record['undoToken'];
    if (typeof id === 'string' && typeof undoToken === 'string') result.push({ id, undoToken });
  }
  return result;
}

/** Ein gespeicherter Lauf, oder `null`, wenn die Datei nichts Brauchbares trägt. */
function readRun(value: unknown): StoredRun | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const ranAt = record['ranAt'];
  const size = record['size'];
  if (typeof ranAt !== 'string' || typeof size !== 'number') return null;
  const findings = Array.isArray(record['findings']) ? record['findings'].filter(isFinding) : [];
  return {
    ranAt,
    usedLlm: record['usedLlm'] === true,
    findings,
    advice: readStrings(record['advice']),
    size: Math.max(0, Math.trunc(size)),
  };
}

/**
 * Der Pflegezustand eines geöffneten Vaults. Eine Instanz je Vault-Wurzel; wer
 * sie über `gardenerState()` holt, bekommt immer dieselbe.
 */
export class GardenerState {
  private data: StoredGardener;

  private constructor(
    readonly root: string,
    data: StoredGardener,
  ) {
    this.data = data;
  }

  private get file(): string {
    return join(this.root, ...GARDENER_STATE_FILE.split('/'));
  }

  static async load(root: string): Promise<GardenerState> {
    const stored = await readJson<Partial<StoredGardener>>(
      join(root, ...GARDENER_STATE_FILE.split('/')),
    );
    const state = new GardenerState(root, empty());
    if (stored !== null) {
      state.data = {
        version: GARDENER_STATE_VERSION,
        run: readRun(stored.run),
        dismissed: readStrings(stored.dismissed),
        fixed: readFixed(stored.fixed),
      };
    }
    return state;
  }

  /** Kennungen, die als „passt so" gelten. */
  dismissed(): ReadonlySet<string> {
    return new Set(this.data.dismissed);
  }

  /** Kennungen, deren Fix geschrieben wurde. */
  fixed(): ReadonlySet<string> {
    return new Set(this.data.fixed.map((entry) => entry.id));
  }

  /** Der rohe Lauf, wie er gespeichert ist. */
  run(): StoredRun | null {
    return this.data.run;
  }

  /**
   * Der Bericht, wie der Screen ihn sieht: ohne die ausgeblendeten Befunde, und
   * mit der Gesundheit, die zu genau dieser Liste gehört. Ohne Lauf `null` —
   * eine erfundene 100 wäre die Sorte Lüge, an der ein Dashboard stirbt.
   */
  present(): GardenerReport | null {
    const run = this.data.run;
    if (run === null) return null;
    const hidden = new Set([...this.dismissed(), ...this.fixed()]);
    const findings = run.findings.filter((finding) => !hidden.has(finding.id));
    const health = healthScore(findings, run.size);
    return {
      ranAt: run.ranAt,
      usedLlm: run.usedLlm,
      findings,
      health: health.score ?? 0,
      healthKnown: health.score !== null,
      healthContributions: health.contributions,
      advice: run.advice,
    };
  }

  /**
   * Einen Lauf ablegen. Die Menge „passt so" bleibt (sie ist eine Entscheidung
   * über die Sache, nicht über den Lauf); die Liste der erledigten Befunde fällt
   * weg — was ein Fix wirklich behoben hat, sagt jetzt der neue Lauf.
   */
  async save(run: StoredRun): Promise<void> {
    this.data.run = run;
    this.data.fixed = [];
    await this.write();
  }

  /**
   * Einen Befund als erledigt eintragen. `undoToken` ist die Marke des Fixes;
   * `undoFixed(token)` macht den Eintrag rückgängig.
   */
  async markFixed(id: string, undoToken: string): Promise<void> {
    if (this.data.fixed.some((entry) => entry.id === id)) return;
    this.data.fixed = [...this.data.fixed, { id, undoToken }];
    await this.write();
  }

  /** Den Eintrag zu dieser Marke wegnehmen — der Befund zählt wieder. */
  async undoFixed(undoToken: string): Promise<void> {
    const next = this.data.fixed.filter((entry) => entry.undoToken !== undoToken);
    if (next.length === this.data.fixed.length) return;
    this.data.fixed = next;
    await this.write();
  }

  /**
   * Einen Befund ausblenden. `false` heißt: den gibt es im letzten Lauf nicht —
   * dann wird auch nichts geschrieben. Ein Knopf, der Erfolg meldet und nichts
   * tut, ist schlimmer als ein fehlender Knopf.
   */
  async dismiss(id: string): Promise<boolean> {
    if (!this.knows(id)) return false;
    if (this.data.dismissed.includes(id)) return true;
    this.data.dismissed = [...this.data.dismissed, id];
    await this.write();
    return true;
  }

  /** „Passt so" zurücknehmen. `false` heißt: war nicht ausgeblendet. */
  async undismiss(id: string): Promise<boolean> {
    if (!this.data.dismissed.includes(id)) return false;
    this.data.dismissed = this.data.dismissed.filter((entry) => entry !== id);
    await this.write();
    return true;
  }

  /** Kennt der letzte Lauf diesen Befund? */
  knows(id: string): boolean {
    return this.data.run?.findings.some((finding) => finding.id === id) === true;
  }

  private async write(): Promise<void> {
    await writeJsonAtomic(this.file, this.data);
  }
}

/* Eine Instanz je Vault. Der Vault wechselt selten; die Karte bleibt klein und
   wird beim Wechsel geleert, damit kein fremder Zustand hängen bleibt. */
const loaded = new Map<string, Promise<GardenerState>>();

/** Der Pflegezustand dieses Vaults. Beim ersten Aufruf wird die Datei gelesen. */
export function gardenerState(root: string): Promise<GardenerState> {
  const known = loaded.get(root);
  if (known !== undefined) return known;
  loaded.clear();
  const pending = GardenerState.load(root);
  loaded.set(root, pending);
  return pending;
}

/** Vergisst den geladenen Zustand — für Tests und beim Schließen des Vaults. */
export function forgetGardenerState(): void {
  loaded.clear();
}
