import { describe, expect, it } from 'vitest';
import { INDEX_SCHEMA_VERSION, VaultIndexStore, bodyBucket } from '@core/index/persist';
import { buildIndex } from '@core/index/build';
import { SearchEngine } from '@core/index/search';
import { IndexService } from '@core/index/service';
import type { VaultIndex } from '@core/index/types';
import { indexBucketPath, indexFiles, indexPath } from '@core/vault/paths';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { WriteTextOptions } from '@core/vault/types';
import type { WriteResult } from '@shared/types';
import { TODAY, vaultFiles, vaultStore } from './fixtures';

const FILES = indexFiles();
const CLOCK = new Date('2026-08-09T08:00:00.000Z');

/** Memory store that records every raw text write — the proof of what a save costs. */
class WriteLog extends MemoryVaultStore {
  readonly writes: { path: string; content: string }[] = [];

  override async writeText(
    path: string,
    content: string,
    options?: WriteTextOptions,
  ): Promise<WriteResult> {
    this.writes.push({ path, content });
    return super.writeText(path, content, options);
  }
}

function covers(index: VaultIndex): Map<string, string> {
  return new Map(index.docs.map((doc) => [doc.path, doc.hash]));
}

async function saveAll(persistence: VaultIndexStore, index: VaultIndex): Promise<void> {
  await persistence.save(index, 'all', { day: TODAY, staleAfterDays: 14 });
  await persistence.saveSearch(SearchEngine.from(index.docs).serialize(), covers(index));
}

async function saved(): Promise<{
  store: MemoryVaultStore;
  persistence: VaultIndexStore;
  index: VaultIndex;
}> {
  const store = vaultStore();
  const persistence = new VaultIndexStore(store);
  const index = await buildIndex(store, { now: TODAY });
  await saveAll(persistence, index);
  return { store, persistence, index };
}

/** A body as it appears inside JSON text; only bodies long enough to be telling. */
function jsonBodies(index: VaultIndex, except: readonly string[] = []): string[] {
  return index.docs
    .filter((doc) => !except.includes(doc.path) && doc.body.trim().length >= 20)
    .map((doc) => JSON.stringify(doc.body).slice(1, -1));
}

async function readJson(store: MemoryVaultStore, path: string): Promise<Record<string, unknown>> {
  return JSON.parse((await store.readText(path)) ?? '{}') as Record<string, unknown>;
}

describe('VaultIndexStore: Roundtrip', () => {
  it('legt das Manifest unter `.secondbrain/index/index.json` ab', async () => {
    const { store } = await saved();
    expect(FILES.manifest).toBe(indexPath());
    expect(await store.exists(indexPath())).toBe(true);
    expect(await store.exists(FILES.search)).toBe(true);
    expect((await readJson(store, indexPath()))['schema']).toBe(INDEX_SCHEMA_VERSION);
    expect(INDEX_SCHEMA_VERSION).toBe(3);
  });

  it('gibt jedes Feld unveraendert zurueck', async () => {
    const { persistence, index } = await saved();
    const loaded = await persistence.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.partial).toBe(false);
    expect(loaded?.derivedFor).toEqual({ day: TODAY, staleAfterDays: 14 });
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
    expect(loaded?.covers).toEqual(covers(index));
  });

  it('speichert das klein geschriebene Suchfeld nicht mit, sondern leitet es ab', async () => {
    const { store, persistence, index } = await saved();
    const first = index.docs[0];
    const bucket = await readJson(store, indexBucketPath(FILES, bodyBucket(first?.path ?? '')));
    const entry = (bucket['entries'] as Record<string, unknown>[]).find(
      (candidate) => candidate['path'] === first?.path,
    );
    expect(Object.keys(entry ?? {}).sort()).toEqual(['body', 'hash', 'path']);
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

  it('the manifest carries no document body', async () => {
    const { store, index } = await saved();
    const raw = (await store.readText(FILES.manifest)) ?? '';
    const docs = JSON.parse(raw).docs as Record<string, unknown>[];
    expect(docs).toHaveLength(index.docs.length);
    for (const doc of docs) {
      expect(doc).not.toHaveProperty('body');
      expect(doc).not.toHaveProperty('text');
      expect(typeof doc['hash']).toBe('string');
    }
    const bodies = jsonBodies(index);
    expect(bodies.length).toBeGreaterThan(5);
    for (const body of bodies) expect(raw).not.toContain(body);
    // The bodies did not vanish — they are in the buckets.
    const bucketText = Object.entries(store.allFiles())
      .filter(([path]) => path.startsWith(`${FILES.bodiesDir}/`))
      .map(([, content]) => content)
      .join('\n');
    for (const body of bodies) expect(bucketText).toContain(body);
  });
});

describe('VaultIndexStore: what a save writes', () => {
  it("saving after one changed doc rewrites only that doc's body bucket", async () => {
    const store = new WriteLog({ files: vaultFiles(), now: CLOCK });
    const persistence = new VaultIndexStore(store);
    const before = await buildIndex(store, { now: TODAY });
    await saveAll(persistence, before);

    // A document alone in its bucket, so "only its bucket" also means "only its body".
    const buckets = before.docs.map((doc) => bodyBucket(doc.path));
    const target = before.docs.find(
      (doc, at) => doc.body.length > 0 && buckets.filter((b) => b === buckets[at]).length === 1,
    );
    expect(target).toBeDefined();
    const path = target?.path ?? '';
    const original = (await store.readText(path)) ?? '';
    await store.writeText(path, `${original}\nEin neuer Absatz ueber Wasserstandsmeldungen.\n`);
    const after = await buildIndex(store, { previous: before, now: TODAY });

    store.writes.length = 0;
    await persistence.save(after, [path]);

    const bucketFile = indexBucketPath(FILES, bodyBucket(path));
    expect(store.writes.map((write) => write.path)).toEqual([bucketFile, FILES.manifest]);
    const written = store.writes.map((write) => write.content).join('\n');
    expect(written).toContain('Wasserstandsmeldungen');
    for (const body of jsonBodies(after, [path])) expect(written).not.toContain(body);
    // One bucket plus a body-free manifest: a fraction of what the whole vault text weighs.
    const allBodies = after.docs.reduce((sum, doc) => sum + doc.body.length, 0);
    const bucketBytes = store.writes[0]?.content.length ?? 0;
    expect(bucketBytes).toBeLessThan(allBodies / 2);

    const loaded = await persistence.load();
    expect(loaded?.partial).toBe(false);
    expect(loaded?.index.docs).toEqual(after.docs);
  });

  it("a deleted path's bucket is rewritten without it", async () => {
    const { store, persistence, index } = await saved();
    const gone = index.docs[1]?.path ?? '';
    const rest = index.docs.filter((doc) => doc.path !== gone);
    const without: VaultIndex = {
      ...index,
      docs: rest,
      byPath: new Map(rest.map((doc) => [doc.path, doc])),
    };
    await persistence.save(without, [gone]);
    const bucket = await readJson(store, indexBucketPath(FILES, bodyBucket(gone)));
    const paths = (bucket['entries'] as { path: string }[]).map((entry) => entry.path);
    expect(paths).not.toContain(gone);
    const loaded = await persistence.load();
    expect(loaded?.partial).toBe(false);
    expect(loaded?.index.byPath.has(gone)).toBe(false);
    expect(loaded?.index.docs).toHaveLength(index.docs.length - 1);
  });
});

describe('VaultIndexStore: kaputte Ablage fuehrt zum Neuaufbau', () => {
  it('fehlende Datei → null', async () => {
    expect(await new VaultIndexStore(new MemoryVaultStore()).load()).toBeNull();
  });

  it('kaputtes JSON → null statt Absturz', async () => {
    const store = new MemoryVaultStore();
    await store.writeText(indexPath(), '{"schema":3,"docs":[{"path":"a.md"');
    expect(await new VaultIndexStore(store).load()).toBeNull();
  });

  it('leere Datei → null', async () => {
    const store = new MemoryVaultStore();
    await store.writeText(indexPath(), '   \n');
    expect(await new VaultIndexStore(store).load()).toBeNull();
  });

  it('andere Schema-Fassung → null', async () => {
    const { store, persistence } = await saved();
    const raw = await readJson(store, indexPath());
    await store.writeText(indexPath(), JSON.stringify({ ...raw, schema: 99 }));
    expect(await persistence.load()).toBeNull();
  });

  it('a schema-2 index.json with inline bodies is discarded, not half-read', async () => {
    const { store, persistence, index } = await saved();
    const legacy = {
      ...(await readJson(store, indexPath())),
      schema: 2,
      docs: index.docs.map(({ text: _text, ...rest }) => rest),
      search: SearchEngine.from(index.docs).serialize(),
    };
    await store.writeText(indexPath(), JSON.stringify(legacy));
    expect(await persistence.load()).toBeNull();
  });

  it('ein unbrauchbares Dokument macht das ganze Manifest unbrauchbar', async () => {
    const { store, persistence } = await saved();
    const raw = await readJson(store, indexPath());
    (raw['docs'] as unknown[])[1] = { path: 'a.md' };
    await store.writeText(indexPath(), JSON.stringify(raw));
    expect(await persistence.load()).toBeNull();
  });

  it('a corrupt bucket drops only its documents and marks the load partial', async () => {
    const { store, persistence, index } = await saved();
    const broken = bodyBucket(index.docs[0]?.path ?? '');
    await store.writeText(indexBucketPath(FILES, broken), '{"schema":3,"entries":[{"pa');
    const loaded = await persistence.load();
    expect(loaded?.partial).toBe(true);
    const expected = index.docs.filter((doc) => bodyBucket(doc.path) !== broken);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(index.docs.length);
    expect(loaded?.index.docs).toEqual(expected);
    expect(loaded?.index.byPath.size).toBe(expected.length);
  });

  it('a missing bucket or an entry with another hash drops that document', async () => {
    const { store, persistence, index } = await saved();
    const [first, second] = index.docs;
    const missing = bodyBucket(first?.path ?? '');
    await store.writeText(indexBucketPath(FILES, missing), '');
    const staleFile = indexBucketPath(FILES, bodyBucket(second?.path ?? ''));
    const stale = await readJson(store, staleFile);
    for (const entry of stale['entries'] as { path: string; hash: string; body: string }[]) {
      if (entry.path !== second?.path) continue;
      entry.hash = 'f'.repeat(64);
      entry.body = 'Ein veralteter Rumpf, dem niemand trauen darf.';
    }
    await store.writeText(staleFile, JSON.stringify(stale));
    const loaded = await persistence.load();
    expect(loaded?.partial).toBe(true);
    expect(loaded?.index.byPath.has(first?.path ?? '')).toBe(false);
    expect(loaded?.index.byPath.has(second?.path ?? '')).toBe(false);
    expect(loaded?.index.docs.some((doc) => doc.body.includes('veralteter Rumpf'))).toBe(false);
  });

  it('unlesbarer Suchzustand kostet nur den Suchindex, nicht den Index', async () => {
    const { store, persistence } = await saved();
    await store.writeText(FILES.search, '{"schema":3,"covers":[["a.md"');
    const loaded = await persistence.load();
    expect(loaded?.index.docs.length).toBeGreaterThan(0);
    expect(loaded?.search).toBeNull();
    expect(loaded?.covers.size).toBe(0);
  });
});

describe('IndexService: persisted index', () => {
  const OPTIONS = { now: () => new Date(`${TODAY}T09:00:00.000Z`), staleAfterDays: 14 };

  it('a deleted index directory rebuilds to the same index', async () => {
    const vault = new MemoryVaultStore({ files: vaultFiles(), now: CLOCK });
    const first = await IndexService.open(vault, OPTIONS);
    const indexFilesOnDisk = Object.keys(vault.allFiles()).filter((path) =>
      path.startsWith('.secondbrain/index/'),
    );
    expect(indexFilesOnDisk).toContain(FILES.manifest);
    expect(indexFilesOnDisk).toContain(FILES.search);
    expect(indexFilesOnDisk.some((path) => path.startsWith(`${FILES.bodiesDir}/`))).toBe(true);

    const withoutIndex = Object.fromEntries(
      Object.entries(vault.allFiles()).filter(([path]) => !path.startsWith('.secondbrain/index/')),
    );
    const fresh = new MemoryVaultStore({ files: withoutIndex, now: CLOCK });
    const second = await IndexService.open(fresh, OPTIONS);

    expect(second.index().docs).toEqual(first.index().docs);
    expect(second.todos()).toEqual(first.todos());
    expect(second.projects()).toEqual(first.projects());
    for (const text of ['Rueckmeldung', 'Rollenkonzept']) {
      const hits = second.search({ text });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits).toEqual(first.search({ text }));
    }
  });

  it('a search file left behind for older hashes is not trusted on open', async () => {
    const vault = new MemoryVaultStore({ files: vaultFiles(), now: CLOCK });
    const first = await IndexService.open(vault, OPTIONS);
    const oldSearch = (await vault.readText(FILES.search)) ?? '';
    const path = first.search({ text: 'Rueckmeldung' })[0]?.path ?? '';
    expect(path).not.toBe('');
    const original = (await vault.readText(path)) ?? '';
    await vault.writeText(path, original.replace(/r(ue|ü)ckmeldung/gi, 'Antwort'));
    await first.refresh([path]);
    expect(first.search({ text: 'Rueckmeldung' }).map((hit) => hit.path)).not.toContain(path);
    // A run that stopped after the manifest but before the search file.
    await vault.writeText(FILES.search, oldSearch);

    // Trusting the old state would still find the word the file no longer contains.
    const second = await IndexService.open(vault, OPTIONS);
    expect(second.search({ text: 'Rueckmeldung' }).map((hit) => hit.path)).not.toContain(path);
  });

  it('a corrupt bucket costs a re-read of its documents, not their content', async () => {
    const vault = new MemoryVaultStore({ files: vaultFiles(), now: CLOCK });
    const first = await IndexService.open(vault, OPTIONS);
    for (const path of Object.keys(vault.allFiles())) {
      if (path.startsWith(`${FILES.bodiesDir}/`)) await vault.writeText(path, 'kaputt');
    }
    const second = await IndexService.open(vault, OPTIONS);
    expect(second.index().docs).toEqual(first.index().docs);
    expect(second.search({ text: 'Rueckmeldung' })).toEqual(first.search({ text: 'Rueckmeldung' }));
  });
});

describe('VaultIndexStore: clear', () => {
  it('verwirft den Index, ohne Nutzerinhalt in den Papierkorb zu legen', async () => {
    const { store, persistence } = await saved();
    await persistence.clear();
    expect(await persistence.load()).toBeNull();
    expect([...Object.keys(store.allFiles())].some((path) => path.includes('trash'))).toBe(false);
  });

  it('tut nichts, wenn es nichts zu verwerfen gibt', async () => {
    const store = new MemoryVaultStore();
    await new VaultIndexStore(store).clear();
    expect(await store.exists(indexPath())).toBe(false);
  });
});
