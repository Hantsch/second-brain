/* `discardPlan` is a preview only: nothing it computes should ever require a
   write. Every test checks that the store stayed untouched, alongside the shape
   of the plan itself. `discardPage` — the write, further down — is measured
   against the opposite promise: what it announced, it did, and one mark undoes it. */

import { describe, expect, it } from 'vitest';
import { GardenerError, discardPage, discardPlan, undoFix } from '@core/gardener';
import type { DiscardDeps, DiscardWriteDeps } from '@core/gardener';
import { sha256 } from '@core/vault/hash';
import type { MemoryVaultStore } from '@core/vault/memory-store';
import { VaultConflictError } from '@core/vault/types';
import { NOW_MS, TODAY } from '../../helpers/time';
import { moduleFixture } from './fixtures';
import type { GardenerFixture } from './fixtures';

/**
 * Ein Store, in dem eine fremde Hand genau zwischen Lesen und Schreiben zuschlaegt:
 * beim ersten Schreibversuch auf `path` landet vorher `foreign` in der Datei, und der
 * gelesene Hash ist damit ueberholt. Genau das Fenster, das ein Store ohne Transaktion
 * ueber mehrere Dateien offen laesst.
 */
function storeWithRace(store: MemoryVaultStore, path: string, foreign: string): MemoryVaultStore {
  let armed = true;
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property !== 'writeText') return Reflect.get(target, property, receiver);
      return async (
        candidate: string,
        content: string,
        options?: { expectedHash?: string },
      ): Promise<unknown> => {
        if (armed && candidate === path) {
          armed = false;
          await store.writeText(path, foreign);
        }
        return store.writeText(candidate, content, options);
      };
    },
  });
}

function depsOf(fixture: {
  store: DiscardDeps['store'];
  index: DiscardDeps['index'];
}): DiscardDeps {
  return { store: fixture.store, index: fixture.index };
}

async function threeModuleFixture() {
  return moduleFixture(
    'wissen',
    [
      { type: 'concept', slug: 'a', title: 'A', summary: 'Wird verworfen', body: 'Inhalt von A.' },
      {
        type: 'concept',
        slug: 'b',
        title: 'B',
        summary: 'Verweist auf A',
        body: 'Diese Seite bezieht sich auf [[a]] und sonst nichts.',
      },
      { type: 'concept', slug: 'd', title: 'D', summary: 'Bleibt stehen', body: 'Inhalt von D.' },
      {
        type: 'concept',
        slug: 'c',
        title: 'C',
        summary: 'Niemand verlinkt hierher',
        body: 'Steht allein.',
      },
    ],
    { extraFiles: { 'raw/files/notiz.txt': 'Nur ein Fund, keine Wiki-Seite.' } },
  );
}

describe('discardPlan', () => {
  it('nennt Ref, den einen Verweiser und die Katalogzeile — ohne keep', async () => {
    const fixture = await threeModuleFixture();

    const plan = await discardPlan(depsOf(fixture), { path: 'modules/wissen/wiki/concepts/a.md' });

    expect(plan.target.path).toBe('modules/wissen/wiki/concepts/a.md');
    expect(plan.target.slug).toBe('a');
    expect(plan.target.module).toBe('wissen');
    expect(typeof plan.target.hash).toBe('string');
    expect(plan.target.hash.length).toBeGreaterThan(0);

    expect(plan.inbound).toHaveLength(1);
    expect(plan.inbound[0]?.path).toBe('modules/wissen/wiki/concepts/b.md');

    expect(plan.catalogPath).toBe('modules/wissen/wiki/index.md');
    expect(plan.catalogLine).toBe('- [[a]] — Wird verworfen');

    expect(plan.repoints).toEqual([]);
  });

  it('liefert einen Repoint pro Verweiser, wenn keep gesetzt ist', async () => {
    const fixture = await threeModuleFixture();

    const plan = await discardPlan(depsOf(fixture), {
      path: 'modules/wissen/wiki/concepts/a.md',
      keep: 'd',
    });

    expect(plan.repoints).toHaveLength(1);
    expect(plan.repoints[0]).toEqual({
      path: 'modules/wissen/wiki/concepts/b.md',
      before: 'Diese Seite bezieht sich auf [[a]] und sonst nichts.',
      after: 'Diese Seite bezieht sich auf [[d]] und sonst nichts.',
    });
  });

  it('behält einen Alias beim Repoint', async () => {
    const fixture = await moduleFixture('wissen', [
      { type: 'concept', slug: 'a', title: 'A', summary: 'Wird verworfen', body: 'Inhalt von A.' },
      {
        type: 'concept',
        slug: 'b',
        title: 'B',
        summary: 'Verweist auf A mit Alias',
        body: 'Siehe [[a|die alte Fassung]] für Details.',
      },
      { type: 'concept', slug: 'd', title: 'D', summary: 'Bleibt stehen', body: 'Inhalt von D.' },
    ]);

    const plan = await discardPlan(depsOf(fixture), {
      path: 'modules/wissen/wiki/concepts/a.md',
      keep: 'd',
    });

    expect(plan.repoints).toEqual([
      {
        path: 'modules/wissen/wiki/concepts/b.md',
        before: 'Siehe [[a|die alte Fassung]] für Details.',
        after: 'Siehe [[d|die alte Fassung]] für Details.',
      },
    ]);
  });

  it('meldet einen fehlenden Pfad als not-found', async () => {
    const fixture = await threeModuleFixture();

    await expect(
      discardPlan(depsOf(fixture), { path: 'modules/wissen/wiki/concepts/fehlt.md' }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof GardenerError && error.code === 'not-found',
    );
  });

  it('meldet einen Pfad ohne Wiki-Seite als invalid', async () => {
    const fixture = await threeModuleFixture();

    await expect(discardPlan(depsOf(fixture), { path: 'raw/files/notiz.txt' })).rejects.toSatisfy(
      (error: unknown) => error instanceof GardenerError && error.code === 'invalid',
    );
  });

  it('liefert eine leere Verweiser-Liste, wenn niemand verlinkt — kein Fehler', async () => {
    const fixture = await threeModuleFixture();

    const plan = await discardPlan(depsOf(fixture), { path: 'modules/wissen/wiki/concepts/c.md' });

    expect(plan.inbound).toEqual([]);
    expect(plan.repoints).toEqual([]);
  });

  it('schreibt nichts in den Vault', async () => {
    const fixture = await threeModuleFixture();
    const before = await fixture.text('modules/wissen/wiki/concepts/b.md');
    const catalogBefore = await fixture.text('modules/wissen/wiki/index.md');

    await discardPlan(depsOf(fixture), { path: 'modules/wissen/wiki/concepts/a.md', keep: 'd' });

    expect(await fixture.text('modules/wissen/wiki/concepts/b.md')).toBe(before);
    expect(await fixture.text('modules/wissen/wiki/index.md')).toBe(catalogBefore);
  });
});

/* `discardPage` is the one path that takes a page out of the vault. Every test here
   asks the same two questions: is the vault afterwards exactly what the action
   announced — and does one `undoFix` put all of it back?

   The two hard cases have their own tests, because they are the reason this
   deliverable exists: a stale hash must abort while **both** files are still there,
   and undoing twice must change nothing. */

describe('discardPage', () => {
  const PAGE_A = 'modules/wissen/wiki/concepts/a.md';
  const PAGE_B = 'modules/wissen/wiki/concepts/b.md';
  const PAGE_C = 'modules/wissen/wiki/concepts/c.md';
  const CATALOG = 'modules/wissen/wiki/index.md';
  const LOG = 'modules/wissen/wiki/log.md';

  function writeDeps(fixture: GardenerFixture): DiscardWriteDeps {
    return { store: fixture.store, index: fixture.index, docLanguage: 'de', now: NOW_MS };
  }

  /** Alle Papierkorb-Pfade, unter denen diese Datei liegt. */
  async function inTrash(fixture: GardenerFixture, path: string): Promise<string[]> {
    const all = await fixture.store.list({ includeInternal: true });
    return all
      .filter((candidate) => candidate.startsWith('.secondbrain/trash/'))
      .filter((candidate) => candidate.endsWith(`/${path}`));
  }

  it('legt eine Seite ohne Verweiser in den Papierkorb und räumt den Katalog auf', async () => {
    const fixture = await threeModuleFixture();
    const pageBefore = await fixture.text(PAGE_C);
    const catalogBefore = await fixture.text(CATALOG);

    const result = await discardPage(writeDeps(fixture), { path: PAGE_C });

    expect(result.discarded).toBe(PAGE_C);
    expect(result.written).toEqual([CATALOG]);
    expect(await fixture.store.exists(PAGE_C)).toBe(false);
    expect(await inTrash(fixture, PAGE_C)).toHaveLength(1);

    const catalog = await fixture.text(CATALOG);
    expect(catalog).not.toContain('[[c]]');
    /* Der Rest des Katalogs bleibt Zeichen für Zeichen stehen. */
    expect(catalog).toContain('- [[a]] — Wird verworfen');
    expect(catalog).toContain('- [[d]] — Bleibt stehen');

    const undone = await undoFix(fixture.store, result.undoToken);
    expect([...undone.restored].sort()).toEqual([CATALOG, PAGE_C].sort());
    expect(undone.kept).toEqual([]);
    expect(await fixture.text(PAGE_C)).toBe(pageBefore);
    expect(await fixture.text(CATALOG)).toBe(catalogBefore);
    expect(await inTrash(fixture, PAGE_C)).toEqual([]);
  });

  it('schreibt genau einen lint-Eintrag in die Chronik und dreht ihn nicht zurück', async () => {
    const fixture = await threeModuleFixture();

    const result = await discardPage(writeDeps(fixture), { path: PAGE_C });

    expect(result.logged).toBe(LOG);
    const log = await fixture.text(LOG);
    expect(log).toContain(`## [${TODAY}] lint`);
    expect(log).toContain(`- findings: discard (${PAGE_C})`);
    expect(log).toContain('- touched: [[c]], index.md');
    expect(log.match(/^## \[/gmu)).toHaveLength(1);

    /* Die Chronik ist append-only: der Rückweg lässt sie stehen. */
    await undoFix(fixture.store, result.undoToken);
    expect(await fixture.text(LOG)).toBe(log);
  });

  it('biegt den Verweis eines Verweisers um, und der Rückweg holt die Zeile zurück', async () => {
    const fixture = await threeModuleFixture();
    const inboundBefore = await fixture.text(PAGE_B);
    const pageBefore = await fixture.text(PAGE_A);

    const result = await discardPage(writeDeps(fixture), { path: PAGE_A, keep: 'd' });

    expect(result.written).toEqual([PAGE_B, CATALOG]);
    expect(await fixture.store.exists(PAGE_A)).toBe(false);
    const inbound = await fixture.text(PAGE_B);
    expect(inbound).toContain('Diese Seite bezieht sich auf [[d]] und sonst nichts.');
    expect(inbound).not.toContain('[[a]]');
    /* Nur die Zeile mit dem Verweis: das Frontmatter bleibt unangetastet. */
    expect(inbound.split('---')[1]).toBe(inboundBefore.split('---')[1]);
    expect(await fixture.text(CATALOG)).not.toContain('[[a]]');

    const undone = await undoFix(fixture.store, result.undoToken);
    expect([...undone.restored].sort()).toEqual([CATALOG, PAGE_A, PAGE_B].sort());
    expect(await fixture.text(PAGE_B)).toBe(inboundBefore);
    expect(await fixture.text(PAGE_A)).toBe(pageBefore);
    expect(await fixture.text(CATALOG)).toContain('- [[a]] — Wird verworfen');
  });

  it('lässt ohne keep alles stehen, was auf die Seite zeigt — sie wird nicht umgebogen', async () => {
    const fixture = await threeModuleFixture();
    const inboundBefore = await fixture.text(PAGE_B);

    const result = await discardPage(writeDeps(fixture), { path: PAGE_A });

    expect(result.written).toEqual([CATALOG]);
    expect(await fixture.text(PAGE_B)).toBe(inboundBefore);
  });

  it('verwirft nichts, wenn der mitgegebene Hash überholt ist', async () => {
    const fixture = await threeModuleFixture();
    const pageBefore = await fixture.text(PAGE_A);
    const inboundBefore = await fixture.text(PAGE_B);
    const catalogBefore = await fixture.text(CATALOG);

    await expect(
      discardPage(writeDeps(fixture), {
        path: PAGE_A,
        keep: 'd',
        expectedHash: sha256('eine andere Fassung'),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof GardenerError && error.code === 'conflict',
    );

    /* Beide Dateien stehen noch, und keine ist angefasst. */
    expect(await fixture.text(PAGE_A)).toBe(pageBefore);
    expect(await fixture.text(PAGE_B)).toBe(inboundBefore);
    expect(await fixture.text(CATALOG)).toBe(catalogBefore);
  });

  it('bricht bei einem Konflikt am Katalog ab, bevor gelöscht wird — und nimmt den Repoint zurück', async () => {
    const fixture = await threeModuleFixture();
    const inboundBefore = await fixture.text(PAGE_B);
    const foreign = `${await fixture.text(CATALOG)}\n- [[fremd]] — von Hand ergänzt\n`;
    const racing = storeWithRace(fixture.store, CATALOG, foreign);

    await expect(
      discardPage(
        { store: racing, index: fixture.index, docLanguage: 'de', now: NOW_MS },
        { path: PAGE_A, keep: 'd' },
      ),
    ).rejects.toSatisfy((error: unknown) => error instanceof VaultConflictError);

    /* Die Zusicherung: die Seite ist noch da — nichts ist halb verworfen. */
    expect(await fixture.store.exists(PAGE_A)).toBe(true);
    expect(await inTrash(fixture, PAGE_A)).toEqual([]);
    /* Und der Repoint, der schon geschrieben war, ist zurückgedreht. */
    expect(await fixture.text(PAGE_B)).toBe(inboundBefore);
    /* Die fremde Änderung am Katalog bleibt: sie gehört dem Nutzer. */
    expect(await fixture.text(CATALOG)).toBe(foreign);
  });

  it('tut beim zweiten Zurückdrehen nichts mehr', async () => {
    const fixture = await threeModuleFixture();

    const result = await discardPage(writeDeps(fixture), { path: PAGE_A, keep: 'd' });
    const first = await undoFix(fixture.store, result.undoToken);
    expect(first.restored).toHaveLength(3);
    const page = await fixture.text(PAGE_A);
    const inbound = await fixture.text(PAGE_B);
    const catalog = await fixture.text(CATALOG);

    const second = await undoFix(fixture.store, result.undoToken);

    expect(second.restored).toEqual([]);
    expect([...second.kept].sort()).toEqual([CATALOG, PAGE_A, PAGE_B].sort());
    expect(await fixture.text(PAGE_A)).toBe(page);
    expect(await fixture.text(PAGE_B)).toBe(inbound);
    expect(await fixture.text(CATALOG)).toBe(catalog);
  });

  it('holt eine Seite nicht zurück, an deren Stelle schon wieder eine Datei liegt', async () => {
    const fixture = await threeModuleFixture();

    const result = await discardPage(writeDeps(fixture), { path: PAGE_C });
    await fixture.store.writeText(PAGE_C, 'Eine neue Seite an derselben Stelle.\n');

    const undone = await undoFix(fixture.store, result.undoToken);

    expect(undone.kept).toContain(PAGE_C);
    expect(undone.restored).toEqual([CATALOG]);
    expect(await fixture.text(PAGE_C)).toBe('Eine neue Seite an derselben Stelle.\n');
  });
});
