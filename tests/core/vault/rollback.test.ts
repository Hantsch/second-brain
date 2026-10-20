/**
 * `restoreSteps` ist der gemeinsame Rueckweg, den `core/gardener/undo.ts` aus
 * seiner eigenen Restore-Schleife herausgezogen hat. Zwei Zusicherungen zaehlen:
 * passt der aktuelle Hash noch zu `hashAfter`, kommt der Inhalt von davor zurueck;
 * passt er nicht mehr, hat jemand anders die Datei seither bearbeitet, und die
 * bleibt dann unberuehrt — kein Rueckweg schreibt eine fremde Zeile um.
 */

import { describe, expect, it } from 'vitest';
import { sha256 } from '@core/vault/hash';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { restoreSteps, type RollbackStep } from '@core/vault/rollback';

describe('restoreSteps', () => {
  it('stellt eine Datei wieder her, deren Hash seit dem Schritt unveraendert ist', async () => {
    const store = new MemoryVaultStore({ files: { 'notes/eins.md': 'Neuer Inhalt.\n' } });
    const step: RollbackStep = {
      path: 'notes/eins.md',
      before: 'Alter Inhalt.\n',
      hashAfter: sha256('Neuer Inhalt.\n'),
    };

    const result = await restoreSteps(store, [step]);

    expect(result.restored).toEqual(['notes/eins.md']);
    expect(result.kept).toEqual([]);
    expect(await store.readText('notes/eins.md')).toBe('Alter Inhalt.\n');
  });

  it('laesst eine Datei unberuehrt, die seither jemand anders bearbeitet hat', async () => {
    const store = new MemoryVaultStore({ files: { 'notes/zwei.md': 'Fremde Bearbeitung.\n' } });
    const step: RollbackStep = {
      path: 'notes/zwei.md',
      before: 'Alter Inhalt.\n',
      // Hash eines Inhalts, den die Datei nie hatte -- der Schritt selbst hat
      // 'Neuer Inhalt.\n' geschrieben, aber jemand anders hat seither ueberschrieben.
      hashAfter: sha256('Neuer Inhalt.\n'),
    };

    const result = await restoreSteps(store, [step]);

    expect(result.restored).toEqual([]);
    expect(result.kept).toEqual(['notes/zwei.md']);
    expect(await store.readText('notes/zwei.md')).toBe('Fremde Bearbeitung.\n');
  });
});
