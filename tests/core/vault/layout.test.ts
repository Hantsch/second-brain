/**
 * Struktur-Tests laufen einmal im Speicher und einmal in einem echten temporaeren
 * Ordner — Idempotenz muss auf der Platte genauso gelten.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { FsVaultStore } from '@core/vault/fs-store';
import { MemoryVaultStore } from '@core/vault/memory-store';
import {
  VAULT_VERSION,
  ensureStructure,
  isVault,
  readVaultMarker,
  structureDirs,
  vaultNameFromRoot,
} from '@core/vault/layout';

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sb-layout-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  }
});

describe('ensureStructure (Speicher)', () => {
  it('legt alle Ordner, den Marker und eine README an', async () => {
    const store = new MemoryVaultStore();
    expect(await isVault(store)).toBe(false);

    const result = await ensureStructure(store, {
      name: 'Zweites Hirn',
      now: new Date('2026-08-10T12:00:00.000Z'),
    });

    expect(result.createdMarker).toBe(true);
    expect(result.createdReadme).toBe(true);
    expect(result.createdDirs).toEqual(structureDirs());
    expect(result.marker).toEqual({
      version: VAULT_VERSION,
      name: 'Zweites Hirn',
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    expect(await isVault(store)).toBe(true);
    for (const dir of structureDirs()) expect(await store.exists(dir)).toBe(true);
    const readme = (await store.readText('README.md')) ?? '';
    expect(readme).toContain('# Zweites Hirn');
    expect(readme).toContain('inbox/');
    expect(readme).toContain('.secondbrain/');
  });

  it('aendert beim zweiten Aufruf nichts', async () => {
    const store = new MemoryVaultStore();
    await ensureStructure(store, { name: 'Erst' });
    const before = store.snapshot();

    const second = await ensureStructure(store, { name: 'Anders' });

    expect(second.createdMarker).toBe(false);
    expect(second.createdReadme).toBe(false);
    expect(second.createdDirs).toEqual([]);
    expect(second.name).toBe('Erst');
    expect(store.snapshot()).toEqual(before);
  });

  it('liest auch einen Marker mit dem aelteren Feld "created"', async () => {
    const store = new MemoryVaultStore({
      files: {
        '.secondbrain/vault.json':
          '{"version":1,"name":"Alt","created":"2026-01-01T00:00:00.000Z"}\n',
      },
    });
    expect(await isVault(store)).toBe(true);
    const marker = await readVaultMarker(store);
    expect(marker?.createdAt).toBe('2026-01-01T00:00:00.000Z');

    const result = await ensureStructure(store);
    expect(result.createdMarker).toBe(false);
    expect(result.name).toBe('Alt');
  });

  it('haelt eine bestehende README des Nutzers unangetastet', async () => {
    const store = new MemoryVaultStore({ files: { 'README.md': 'Meine eigene Notiz\n' } });
    await ensureStructure(store);
    expect(await store.readText('README.md')).toBe('Meine eigene Notiz\n');
  });
});

describe('ensureStructure (Dateisystem)', () => {
  it('legt die Struktur an und ist beim zweiten Aufruf still', async () => {
    const root = await makeRoot();
    const first = await ensureStructure(root, { name: 'Vault' });
    expect(first.createdMarker).toBe(true);
    for (const dir of structureDirs()) {
      expect((await stat(join(root, ...dir.split('/')))).isDirectory()).toBe(true);
    }

    const store = new FsVaultStore(root);
    const markerBefore = await store.hash('.secondbrain/vault.json');
    const readmeBefore = await store.hash('README.md');

    const second = await ensureStructure(root);
    expect(second.createdDirs).toEqual([]);
    expect(second.createdMarker).toBe(false);
    expect(second.createdReadme).toBe(false);
    expect(await store.hash('.secondbrain/vault.json')).toBe(markerBefore);
    expect(await store.hash('README.md')).toBe(readmeBefore);
    expect(await isVault(root)).toBe(true);
  });

  it('erkennt einen Ordner ohne Marker als Nicht-Vault', async () => {
    const root = await makeRoot();
    expect(await isVault(root)).toBe(false);
    expect(await readVaultMarker(root)).toBeNull();
  });

  it('nimmt den Ordnernamen als Vault-Namen', async () => {
    const root = await makeRoot();
    const result = await ensureStructure(root);
    expect(result.name).toBe(vaultNameFromRoot(root));
    expect(result.name.startsWith('sb-layout-')).toBe(true);
  });
});
