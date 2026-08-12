import { describe, expect, it } from 'vitest';
import { INDEX_SCHEMA_VERSION, VaultIndexStore } from '@core/index/persist';
import { buildIndex } from '@core/index/build';
import { SearchEngine } from '@core/index/search';
import { indexPath } from '@core/vault/paths';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { TODAY, vaultStore } from './fixtures';

async function saved(): Promise<{ store: MemoryVaultStore; persistence: VaultIndexStore }> {
  const store = vaultStore();
  const persistence = new VaultIndexStore(store);
  const index = await buildIndex(store, { now: TODAY });
  await persistence.save(index, SearchEngine.from(index.docs).serialize());
  return { store, persistence };
}

describe('VaultIndexStore: Roundtrip', () => {
  it('legt den Index unter `.secondbrain/index/index.json` ab', async () => {
    const { store } = await saved();
    expect(await store.exists(indexPath())).toBe(true);
    const raw = (await store.readText(indexPath())) ?? '';
    expect(JSON.parse(raw).schema).toBe(INDEX_SCHEMA_VERSION);
  });

  it('gibt jedes Feld unveraendert zurueck', async () => {
    const store = vaultStore();
    const persistence = new VaultIndexStore(store);
    const index = await buildIndex(store, { now: TODAY });
    await persistence.save(index, SearchEngine.from(index.docs).serialize());

    const loaded = await persistence.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.index.docs).toEqual(index.docs);
    expect(loaded?.index.todos).toEqual(index.todos);
    expect(loaded?.index.projects).toEqual(index.projects);
    expect(loaded?.index.pages).toEqual(index.pages);
    expect(loaded?.index.sources).toEqual(index.sources);
    expect(loaded?.index.brokenLinks).toEqual(index.brokenLinks);
    expect(loaded?.index.counts).toEqual(index.counts);
    expect(loaded?.index.builtAt).toBe(index.builtAt);
    expect(loaded?.index.durationMs).toBe(index.durationMs);
    expect(loaded?.index.byPath.size).toBe(index.docs.length);
  });

  it('speichert das klein geschriebene Suchfeld nicht mit, sondern leitet es ab', async () => {
    const { store, persistence } = await saved();
    const raw = JSON.parse((await store.readText(indexPath())) ?? '{}');
    expect(raw.docs[0].text).toBeUndefined();
    const loaded = await persistence.load();
    const doc = loaded?.index.docs[0];
    expect(doc?.text).toBe(doc?.body.toLowerCase());
  });

  it('nimmt den MiniSearch-Zustand mit — die Suche laeuft ohne Neuaufbau', async () => {
    const { persistence } = await saved();
    const loaded = await persistence.load();
    const engine = SearchEngine.restore(loaded?.search ?? null);
    expect(engine).not.toBeNull();
    expect(engine?.size).toBe(loaded?.index.docs.length);
    const hits = engine?.search({ text: 'Rueckmeldung' }, loaded?.index.byPath ?? new Map()) ?? [];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.snippet).toContain('**');
  });
});

describe('VaultIndexStore: kaputte Ablage fuehrt zum Neuaufbau', () => {
  it('fehlende Datei → null', async () => {
    expect(await new VaultIndexStore(new MemoryVaultStore()).load()).toBeNull();
  });

  it('kaputtes JSON → null statt Absturz', async () => {
    const store = new MemoryVaultStore();
    await store.writeText(indexPath(), '{"schema":1,"docs":[{"path":"a.md"');
    expect(await new VaultIndexStore(store).load()).toBeNull();
  });

  it('leere Datei → null', async () => {
    const store = new MemoryVaultStore();
    await store.writeText(indexPath(), '   \n');
    expect(await new VaultIndexStore(store).load()).toBeNull();
  });

  it('andere Schema-Fassung → null', async () => {
    const { store, persistence } = await saved();
    const raw = JSON.parse((await store.readText(indexPath())) ?? '{}');
    await store.writeText(indexPath(), JSON.stringify({ ...raw, schema: 99 }));
    expect(await persistence.load()).toBeNull();
  });

  it('ein unbrauchbares Dokument macht die ganze Datei unbrauchbar', async () => {
    const { store, persistence } = await saved();
    const raw = JSON.parse((await store.readText(indexPath())) ?? '{}');
    raw.docs[1] = { path: 'a.md' };
    await store.writeText(indexPath(), JSON.stringify(raw));
    expect(await persistence.load()).toBeNull();
  });

  it('unlesbarer Suchzustand kostet nur den Suchindex, nicht den Index', async () => {
    const { store, persistence } = await saved();
    const raw = JSON.parse((await store.readText(indexPath())) ?? '{}');
    await store.writeText(indexPath(), JSON.stringify({ ...raw, search: { kaputt: true } }));
    const loaded = await persistence.load();
    expect(loaded?.index.docs.length).toBeGreaterThan(0);
    expect(SearchEngine.restore(loaded?.search ?? null)).toBeNull();
  });
});

describe('VaultIndexStore: clear', () => {
  it('verwirft den Index, ohne Nutzerinhalt in den Papierkorb zu legen', async () => {
    const { store, persistence } = await saved();
    await persistence.clear();
    expect(await persistence.load()).toBeNull();
    expect([...Object.keys(store.snapshot())].some((path) => path.includes('trash'))).toBe(false);
  });

  it('tut nichts, wenn es nichts zu verwerfen gibt', async () => {
    const store = new MemoryVaultStore();
    await new VaultIndexStore(store).clear();
    expect(await store.exists(indexPath())).toBe(false);
  });
});
