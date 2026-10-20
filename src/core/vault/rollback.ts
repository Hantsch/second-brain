/**
 * Der gemeinsame Rueckweg eines geschriebenen Schritts. `RollbackStep` und
 * `restoreSteps` sind aus `core/gardener/undo.ts` herausgezogen, damit jede
 * Aktion, die mehrere Dateien schreibt und das rueckgaengig machen koennen
 * muss, sich denselben Mechanismus teilt statt ihn nachzubauen.
 *
 * Die Zusicherung bleibt dieselbe: **Kein Rueckweg schreibt eine fremde
 * Zeile um.** Stimmt der Hash der Datei nicht mehr mit dem Hash ueberein,
 * den der Schritt selbst geschrieben hat, hat jemand anders die Datei seither
 * bearbeitet — dann bleibt sie, wie sie ist.
 */

import { sha256 } from '@core/vault/hash';

/**
 * Was `restoreSteps` von seinem Store braucht — bewusst nur Lesen/Schreiben von
 * Rohtext, nicht das volle `VaultStore`. So passt derselbe Rueckweg sowohl auf
 * einen `VaultStore` als auch auf `WikiStore`-abgeleitete Stores (z. B. den
 * Gaertner), ohne dass einer der beiden Interfaces Methoden vortaeuschen muss,
 * die er gar nicht hat.
 */
export interface RollbackTextStore {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string, options?: { expectedHash?: string }): Promise<unknown>;
}

/** Ein geaenderter Pfad mit seinem Zustand davor. */
export interface RollbackStep {
  path: string;
  /** Vollstaendiger Dateiinhalt vor der Aenderung. */
  before: string;
  /** Hash des Inhalts, den der Schritt geschrieben hat. */
  hashAfter: string;
}

export interface RestoreStepsResult {
  /** Pfade, die wieder auf dem Stand von vorher sind. */
  restored: string[];
  /** Pfade, die unberuehrt bleiben, weil sie sich seither geaendert haben. */
  kept: string[];
}

/**
 * Schritte rueckwaerts zurueckdrehen — in umgekehrter Reihenfolge zu der, in der
 * sie geschrieben wurden. Fuer jeden Schritt: stimmt der aktuelle Hash noch mit
 * `hashAfter` ueberein, kommt der Inhalt von davor zurueck (oder die Datei
 * verschwindet, wenn es sie vorher nicht gab); stimmt er nicht mehr, bleibt die
 * Datei unberuehrt und der Pfad landet in `kept`.
 */
export async function restoreSteps(
  store: RollbackTextStore,
  steps: RollbackStep[],
): Promise<RestoreStepsResult> {
  const restored: string[] = [];
  const kept: string[] = [];
  for (const step of [...steps].reverse()) {
    const current = await store.readText(step.path);
    if (current === null || sha256(current) !== step.hashAfter) {
      kept.push(step.path);
      continue;
    }
    await store.writeText(step.path, step.before, { expectedHash: step.hashAfter });
    restored.push(step.path);
  }
  return { restored, kept };
}
