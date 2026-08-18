import { describe, expect, it } from 'vitest';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { runStoreContract } from './store-contract';

runStoreContract('MemoryVaultStore', async () => ({
  store: new MemoryVaultStore(),
  cleanup: async () => {
    /* Nichts aufzuraeumen — der Store lebt nur im Speicher. */
  },
}));

describe('MemoryVaultStore', () => {
  it('nimmt Startinhalte an', async () => {
    const store = new MemoryVaultStore({
      files: { 'areas/haus.md': '---\ntype: area\ntitle: Haus\n---\n\nText.\n' },
    });
    const doc = await store.read('areas/haus.md');
    expect(doc?.frontmatter['title']).toBe('Haus');
    expect(store.snapshot()['areas/haus.md']).toContain('Text.');
  });

  it('kennt angelegte Ordner, auch ohne Dateien darin', async () => {
    const store = new MemoryVaultStore();
    await store.mkdir('modules/identity-management/wiki/sources');
    expect(await store.exists('modules/identity-management/wiki')).toBe(true);
    expect((await store.stat('modules/identity-management'))?.dir).toBe(true);
    expect(await store.exists('modules/anderes')).toBe(false);
  });

  it('verschiebt Ordner samt Inhalt', async () => {
    const store = new MemoryVaultStore();
    await store.writeText('projects/work/alt/project.md', 'A\n');
    await store.writeText('projects/work/alt/notes/eins.md', 'B\n');
    await store.move('projects/work/alt', 'projects/private/neu');
    expect(await store.readText('projects/private/neu/project.md')).toBe('A\n');
    expect(await store.readText('projects/private/neu/notes/eins.md')).toBe('B\n');
    expect(await store.exists('projects/work/alt')).toBe(false);
  });
});
