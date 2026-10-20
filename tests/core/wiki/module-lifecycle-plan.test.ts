/* `renamePlan`/`deletePlan` are read-only previews, exactly like `discardPlan`
 * (`tests/core/gardener/discard.test.ts`): the index only points at candidates,
 * every file that might change is read fresh, and nothing is ever written. The
 * fixture (`module-lifecycle-fixture.ts`, shared with the rename suite) is a small,
 * realistic vault — see its header. */

import { describe, expect, it } from 'vitest';
import { deletePlan, renamePlan, WikiError } from '@core/wiki';
import type { MemoryVaultStore } from '@core/vault/memory-store';
import {
  AGENTS,
  CATALOG,
  DUMP,
  LOG,
  MODULE,
  MODULE_FILE,
  OTHER_MODULE,
  OTHER_PAGE,
  OVERVIEW,
  PAGE_A,
  PAGE_B,
  PROJECT,
  PROTOCOL_ONE,
  PROTOCOL_TWO,
  RAW_ONE,
  RAW_TWO,
  fixture,
} from './module-lifecycle-fixture';

/** Every file's hash, keyed by path — for the "byte-identical after planning" check. */
async function snapshot(
  store: MemoryVaultStore,
  paths: readonly string[],
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    paths.map(async (path) => [path, await store.hash(path)] as const),
  );
  return new Map(entries);
}

const ALL_PATHS = [
  MODULE_FILE,
  CATALOG,
  LOG,
  OVERVIEW,
  PAGE_A,
  PAGE_B,
  AGENTS,
  OTHER_PAGE,
  RAW_ONE,
  PROTOCOL_ONE,
  RAW_TWO,
  PROTOCOL_TWO,
  PROJECT,
  DUMP,
];

describe('renamePlan', () => {
  it('listet jede betroffene Datei ausser log.md und Rohquellen', async () => {
    const { deps } = await fixture();

    const plan = await renamePlan(deps, { slug: MODULE, title: 'Produktkenntnisse' });

    expect(plan.newSlug).toBe('produktkenntnisse');
    expect(plan.titleOnly).toBe(false);
    expect(plan.blocked).toBeNull();
    expect(plan.pages).toHaveLength(3); // a, b, overview

    const paths = plan.changes.map((change) => change.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        MODULE_FILE,
        PAGE_A,
        PAGE_B,
        OVERVIEW,
        AGENTS,
        CATALOG,
        PROTOCOL_ONE,
        PROTOCOL_TWO,
        PROJECT,
        DUMP,
        OTHER_PAGE,
      ]),
    );
    expect(paths).not.toContain(LOG);
    expect(paths).not.toContain(RAW_ONE);
    expect(paths).not.toContain(RAW_TWO);
    expect(new Set(paths).size).toBe(paths.length); // one entry per path, never twice
  });

  it('nennt "target-exists", wenn der neue Slug schon als Modul existiert', async () => {
    const { deps } = await fixture();

    const plan = await renamePlan(deps, { slug: MODULE, title: 'Andere Notizen' });

    expect(plan.newSlug).toBe(OTHER_MODULE);
    expect(plan.blocked).toBe('target-exists');
  });

  it('ist bei einer Titel-only-Umbenennung ein reiner Titelwechsel: kein Slug-Umzug', async () => {
    const { deps } = await fixture();

    const plan = await renamePlan(deps, { slug: MODULE, title: 'ProduktWissen' });

    expect(plan.titleOnly).toBe(true);
    expect(plan.newSlug).toBe(MODULE);
    const paths = plan.changes.map((change) => change.path);
    // Seiten, Projekt, Quellen, Dump und der Querverweis haengen am Slug, nicht am Titel.
    expect(paths).not.toContain(PAGE_A);
    expect(paths).not.toContain(PAGE_B);
    expect(paths).not.toContain(PROTOCOL_ONE);
    expect(paths).not.toContain(PROJECT);
    expect(paths).not.toContain(DUMP);
    expect(paths).not.toContain(OTHER_PAGE);
    // Aber die Titelzeilen selbst aendern sich.
    expect(paths).toContain(MODULE_FILE);
    expect(paths).toContain(AGENTS);
    expect(paths).toContain(CATALOG);
  });

  it('meldet ein fehlendes Modul als not-found', async () => {
    const { deps } = await fixture();

    await expect(renamePlan(deps, { slug: 'fehlt', title: 'Egal' })).rejects.toSatisfy(
      (error: unknown) => error instanceof WikiError && error.code === 'not-found',
    );
  });

  it('meldet einen fehlenden Titel als invalid', async () => {
    const { deps } = await fixture();

    await expect(renamePlan(deps, { slug: MODULE, title: '   ' })).rejects.toSatisfy(
      (error: unknown) => error instanceof WikiError && error.code === 'invalid',
    );
  });

  it('aendert den Fingerprint, wenn eine gelistete Datei sich aendert', async () => {
    const { deps, store } = await fixture();
    const before = await renamePlan(deps, { slug: MODULE, title: 'Produktkenntnisse' });

    await store.writeText(PAGE_A, `${(await store.readText(PAGE_A)) ?? ''}\nEin neuer Satz.\n`);
    const after = await renamePlan(deps, { slug: MODULE, title: 'Produktkenntnisse' });

    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('liefert denselben Fingerprint, wenn sich nichts Relevantes aendert', async () => {
    const { deps } = await fixture();
    const first = await renamePlan(deps, { slug: MODULE, title: 'Produktkenntnisse' });
    const second = await renamePlan(deps, { slug: MODULE, title: 'Produktkenntnisse' });

    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('schreibt nichts in den Vault', async () => {
    const { deps, store } = await fixture();
    const before = await snapshot(store, ALL_PATHS);

    await renamePlan(deps, { slug: MODULE, title: 'Produktkenntnisse' });

    expect(await snapshot(store, ALL_PATHS)).toEqual(before);
  });
});

describe('deletePlan', () => {
  it('nennt Seitenzahl, betroffene Quellen, kaputte Links und Projekte', async () => {
    const { deps } = await fixture();

    const plan = await deletePlan(deps, { slug: MODULE });

    expect(plan.pages).toHaveLength(3);

    const sourceOne = plan.sources.find(
      (source) => source.path === 'raw/web/2026-08-01-quelle-eins',
    );
    expect(sourceOne?.outcome).toBe('undigested');
    expect(sourceOne?.remainingModule).toBeNull();

    const sourceTwo = plan.sources.find(
      (source) => source.path === 'raw/web/2026-08-02-quelle-zwei',
    );
    expect(sourceTwo?.outcome).toBe('stays-digested');
    expect(sourceTwo?.remainingModule).toBe(OTHER_MODULE);

    expect(plan.projects).toEqual([{ path: PROJECT, slug: 'beispielprojekt' }]);

    expect(plan.brokenLinks).toEqual([
      {
        path: OTHER_PAGE,
        target: `${MODULE}/a`,
        line: expect.stringContaining(`[[${MODULE}/a|Übersicht]]`),
      },
    ]);

    const changedPaths = plan.changes.map((change) => change.path);
    expect(changedPaths).toEqual(expect.arrayContaining([PROTOCOL_ONE, PROTOCOL_TWO, PROJECT]));
    expect(changedPaths).not.toContain(LOG);
    expect(changedPaths).not.toContain(RAW_ONE);
    expect(changedPaths).not.toContain(RAW_TWO);
    // Die Modul-Seiten selbst werden nicht umgeschrieben — sie gehen als Ganzes in den Papierkorb.
    expect(changedPaths).not.toContain(PAGE_A);
    expect(changedPaths).not.toContain(MODULE_FILE);
  });

  it('meldet ein fehlendes Modul als not-found', async () => {
    const { deps } = await fixture();

    await expect(deletePlan(deps, { slug: 'fehlt' })).rejects.toSatisfy(
      (error: unknown) => error instanceof WikiError && error.code === 'not-found',
    );
  });

  it('aendert den Fingerprint, wenn eine gelistete Datei sich aendert', async () => {
    const { deps, store } = await fixture();
    const before = await deletePlan(deps, { slug: MODULE });

    await store.writeText(PROJECT, `${(await store.readText(PROJECT)) ?? ''}\nEin neuer Absatz.\n`);
    const after = await deletePlan(deps, { slug: MODULE });

    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('schreibt nichts in den Vault', async () => {
    const { deps, store } = await fixture();
    const before = await snapshot(store, ALL_PATHS);

    await deletePlan(deps, { slug: MODULE });

    expect(await snapshot(store, ALL_PATHS)).toEqual(before);
  });
});
