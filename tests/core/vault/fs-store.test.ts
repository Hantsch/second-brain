/**
 * FS-Tests laufen in einem echten temporaeren Ordner unter os.tmpdir() und raeumen
 * hinter sich auf. Kein Zugriff auf den Vault des Nutzers, kein Netz.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { FsVaultStore } from '@core/vault/fs-store';
import { VaultConflictError } from '@core/vault/types';
import { runStoreContract } from './store-contract';

const roots: string[] = [];

async function makeVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sb-vault-'));
  roots.push(root);
  return root;
}

async function removeAll(): Promise<void> {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
}

runStoreContract('FsVaultStore', async () => {
  const root = await makeVault();
  return { store: new FsVaultStore(root), cleanup: removeAll };
});

describe('FsVaultStore', () => {
  afterEach(removeAll);

  it('schreibt atomar und hinterlaesst keine .tmp-Reste', async () => {
    const root = await makeVault();
    const store = new FsVaultStore(root);
    await store.write({ path: 'inbox/a.md', frontmatter: { type: 'dump' }, body: 'Text' });
    await store.write({ path: 'inbox/a.md', frontmatter: { status: 'kept' } });

    const entries = await readdir(join(root, 'inbox'));
    expect(entries).toEqual(['a.md']);
  });

  it('kommt mit Backslash-Pfaden von Windows-Aufrufern klar', async () => {
    const root = await makeVault();
    const store = new FsVaultStore(root);
    await store.writeText('projects\\work\\nyota\\project.md', 'A\n');
    expect(await store.readText('projects/work/nyota/project.md')).toBe('A\n');
    expect((await store.stat('projects\\work\\nyota\\project.md'))?.path).toBe(
      'projects/work/nyota/project.md',
    );
  });

  it('erkennt eine externe Aenderung ueber den Hash', async () => {
    const root = await makeVault();
    const store = new FsVaultStore(root);
    const written = await store.write({
      path: 'areas/haus.md',
      frontmatter: { type: 'area', title: 'Haus' },
      body: 'Erste Fassung.',
    });

    // Der Nutzer editiert die Datei von aussen, ohne die App.
    await writeFile(
      join(root, 'areas', 'haus.md'),
      '---\ntype: area\ntitle: Haus\n---\n\nVon Hand geaendert.\n',
      'utf8',
    );

    const doc = await store.read('areas/haus.md');
    expect(doc?.hash).not.toBe(written.hash);
    await expect(
      store.write({ path: 'areas/haus.md', body: 'App-Fassung', expectedHash: written.hash }),
    ).rejects.toThrow(VaultConflictError);
    expect(await readFile(join(root, 'areas', 'haus.md'), 'utf8')).toContain('Von Hand geaendert.');
  });

  it('loescht einen ganzen Ordner in den Papierkorb und holt ihn zurueck', async () => {
    const root = await makeVault();
    const store = new FsVaultStore(root);
    await store.writeText('projects/work/nyota/project.md', 'A\n');
    await store.writeText('projects/work/nyota/notes/eins.md', 'B\n');

    const deleted = await store.delete('projects/work/nyota');
    expect(await store.exists('projects/work/nyota')).toBe(false);
    const trash = await store.list({ includeInternal: true, dir: '.secondbrain/trash' });
    expect(trash).toContain(
      `.secondbrain/trash/${deleted.undoToken}/projects/work/nyota/project.md`,
    );

    const restored = await store.undo(deleted.undoToken);
    expect(restored).toEqual(['projects/work/nyota']);
    expect(await store.readText('projects/work/nyota/notes/eins.md')).toBe('B\n');
    expect(await store.list({ includeInternal: true, dir: '.secondbrain/trash' })).toEqual([]);
  });

  it('gibt Ordner nur auf Wunsch mit aus', async () => {
    const root = await makeVault();
    const store = new FsVaultStore(root);
    await store.writeText('modules/identity/wiki/index.md', '# Index\n');

    expect(await store.list()).toEqual(['modules/identity/wiki/index.md']);
    expect(await store.list({ includeDirs: true })).toEqual([
      'modules',
      'modules/identity',
      'modules/identity/wiki',
      'modules/identity/wiki/index.md',
    ]);
  });
});
