/**
 * Papierkorb-Semantik, gegen beide Implementierungen. Zwei Marken-Arten teilen sich
 * denselben Papierkorb und muessen sich beim Zurueckdrehen unterschiedlich verhalten:
 *
 * - `delete` — das Original ist weg. Liegt am Zielort wieder etwas, ist das fremder
 *   Inhalt und `undo` verweigert.
 * - `snapshot` — das Original blieb liegen und wurde ueberschrieben. Der belegte
 *   Zielort ist hier der Normalfall, und `undo` legt die Sicherung darueber.
 *
 * Der Unterschied haengt allein am Manifest. Wuerde er verrutschen, wuerde ein
 * Rueckgaengig stillschweigend Nutzerinhalt ueberschreiben — deshalb steht beides hier.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FsVaultStore } from '@core/vault/fs-store';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { VaultConflictError } from '@core/vault/types';
import type { VaultStore } from '@core/vault/types';

const AREA = 'areas/gesundheit.md';
const TRASH = '.secondbrain/trash';

const before = ['---', 'type: area', 'title: Gesundheit', '---', '', 'Erste Fassung.', ''].join(
  '\n',
);
const after = ['---', 'type: area', 'title: Gesundheit', '---', '', 'Zweite Fassung.', ''].join(
  '\n',
);

interface Harness {
  store: VaultStore;
  cleanup: () => Promise<void>;
}

const harnesses: [string, () => Promise<Harness>][] = [
  [
    'MemoryVaultStore',
    async () => ({
      store: new MemoryVaultStore(),
      cleanup: async () => {
        /* Nichts aufzuraeumen. */
      },
    }),
  ],
  [
    'FsVaultStore',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'sb-trash-'));
      return {
        store: new FsVaultStore(root),
        cleanup: () => rm(root, { recursive: true, force: true }),
      };
    },
  ],
];

/** Alles, was im Papierkorb liegt — Manifeste eingeschlossen. */
async function trashContents(store: VaultStore): Promise<string[]> {
  return store.list({ includeInternal: true, dir: TRASH });
}

for (const [label, createHarness] of harnesses) {
  describe(`Papierkorb: ${label}`, () => {
    const withStore = async (run: (store: VaultStore) => Promise<void>): Promise<void> => {
      const harness = await createHarness();
      try {
        await run(harness.store);
      } finally {
        await harness.cleanup();
      }
    };

    it('sichert eine Datei, laesst das Original aber liegen', async () => {
      await withStore(async (store) => {
        await store.writeText(AREA, before);
        const hash = await store.hash(AREA);

        const token = await store.snapshot(AREA);

        expect(token).not.toBeNull();
        // Anders als `delete`: die Datei ist unveraendert da, es ging nur eine Kopie weg.
        expect(await store.readText(AREA)).toBe(before);
        expect(await store.hash(AREA)).toBe(hash);
        expect(await trashContents(store)).toContain(`${TRASH}/${token ?? ''}/${AREA}`);
      });
    });

    it('stellt nach einem Ueberschreiben den gesicherten Stand bitgenau wieder her', async () => {
      await withStore(async (store) => {
        await store.writeText(AREA, before);

        const token = await store.snapshot(AREA);
        await store.writeText(AREA, after);
        expect(await store.readText(AREA)).toBe(after);

        const restored = await store.undo(token ?? '');

        expect(restored).toEqual([AREA]);
        expect(await store.readText(AREA)).toBe(before);
        // Die Marke ist verbraucht: der Papierkorb ist danach wieder leer.
        expect(await trashContents(store)).toEqual([]);
      });
    });

    it('sichert nichts, was es nicht gibt', async () => {
      await withStore(async (store) => {
        expect(await store.snapshot('areas/gibtsnicht.md')).toBeNull();
        expect(await trashContents(store)).toEqual([]);
        expect(await store.exists('areas/gibtsnicht.md')).toBe(false);
      });
    });

    /* Der eigentliche Grund fuer `kind` im Manifest: dieselbe Lage — am Zielort liegt
       eine Datei — muss beim Loeschen weiterhin abbrechen. Sonst haette das
       Ueberschreiben-Duerfen der Sicherung den Loeschweg mit aufgeweicht. */
    it('ueberschreibt beim Rueckgaengig eines Loeschens nach wie vor nichts', async () => {
      await withStore(async (store) => {
        await store.writeText(AREA, before);
        const deleted = await store.delete(AREA);
        await store.writeText(AREA, after);

        await expect(store.undo(deleted.undoToken)).rejects.toThrow(VaultConflictError);
        expect(await store.readText(AREA)).toBe(after);
      });
    });

    it('sichert dieselbe Datei mehrfach, jede Marke fuer sich', async () => {
      await withStore(async (store) => {
        await store.writeText(AREA, before);
        const first = await store.snapshot(AREA);
        await store.writeText(AREA, after);
        const second = await store.snapshot(AREA);
        await store.writeText(AREA, 'Dritte Fassung.\n');

        // Juengere Marke zuerst: sie kennt den Stand von eben.
        await store.undo(second ?? '');
        expect(await store.readText(AREA)).toBe(after);
        // Die aeltere greift danach immer noch und geht einen Schritt weiter zurueck.
        await store.undo(first ?? '');
        expect(await store.readText(AREA)).toBe(before);
        expect(await trashContents(store)).toEqual([]);
      });
    });
  });
}
