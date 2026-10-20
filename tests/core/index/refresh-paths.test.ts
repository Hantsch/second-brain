import { describe, expect, it } from 'vitest';
import { IndexService } from '@core/index/service';
import { bodyBucket } from '@core/index/persist';
import { indexBucketPath, indexFiles, indexPath } from '@core/vault/paths';
import { CountingVaultStore } from './counting-store';
import { TODAY, vaultFiles } from './fixtures';

const OPTIONS = { now: () => new Date(`${TODAY}T09:00:00.000Z`), staleAfterDays: 14 };

/** Ein Vault mit vielen Dateien — genug, dass ein Baumlauf sich lohnen wuerde. */
function bigVaultFiles(count: number, otherBodyWords: number): Record<string, string> {
  const files: Record<string, string> = {};
  const filler = Array.from({ length: otherBodyWords }, (_, word) => `wort${word}`).join(' ');
  for (let index = 0; index < count; index += 1) {
    const id = String(index).padStart(4, '0');
    files[`areas/area-${id}.md`] = `---\ntype: area\ntitle: Bereich ${id}\n---\n\n${filler}\n`;
  }
  return files;
}

function bigStore(otherBodyWords = 5): CountingVaultStore {
  return new CountingVaultStore({
    files: bigVaultFiles(500, otherBodyWords),
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function fixtureStore(): CountingVaultStore {
  return new CountingVaultStore({ files: vaultFiles(), now: new Date('2026-08-09T08:00:00.000Z') });
}

describe('IndexService: pfadgezielter Refresh', () => {
  it('a single-file refresh stats and reads only that file', async () => {
    const vault = bigStore();
    const service = await IndexService.open(vault, {
      now: () => new Date('2026-01-02T00:00:00.000Z'),
    });
    await vault.writeText(
      'areas/area-0001.md',
      '---\ntype: area\ntitle: Bereich 1 geaendert\n---\n\nNeuer Inhalt.\n',
    );
    vault.reset();

    await service.refresh(['areas/area-0001.md']);

    expect(vault.walkCalls).toBe(0);
    expect(vault.statPaths).toEqual(['areas/area-0001.md']);
    expect(vault.readTextPaths).toEqual(['areas/area-0001.md']);
  });

  it("a single-file refresh writes no other document's body", async () => {
    async function refreshAndMeasure(otherBodyWords: number): Promise<number> {
      const vault = bigStore(otherBodyWords);
      const service = await IndexService.open(vault, {
        now: () => new Date('2026-01-02T00:00:00.000Z'),
      });
      await vault.writeText(
        'areas/area-0001.md',
        '---\ntype: area\ntitle: Bereich 1 geaendert\n---\n\nNeuer Inhalt.\n',
      );
      vault.reset();
      await service.refresh(['areas/area-0001.md']);

      const files = indexFiles(indexPath());
      const bucket = indexBucketPath(files, bodyBucket('areas/area-0001.md'));
      expect(new Set(vault.writeTextPaths)).toEqual(new Set([files.manifest, bucket]));
      expect(vault.writeTextPaths.length).toBe(2);
      return vault.writtenBytes;
    }

    // The other 499 documents' bodies never enter a bucket save — only their
    // body-free metadata (title, word count, …) sits in the manifest. Making
    // their bodies 200x bigger may nudge the manifest's `words` digits, but
    // must not drag the bodies themselves (megabytes) into what gets written.
    const small = await refreshAndMeasure(5);
    const huge = await refreshAndMeasure(1_000);
    expect(huge - small).toBeLessThan(5_000);
  });

  it('a rename reaches the index', async () => {
    const vault = fixtureStore();
    const service = await IndexService.open(vault, OPTIONS);
    const oldPath = 'areas/gesundheit.md';
    const newPath = 'areas/wellness.md';
    const content = await vault.readText(oldPath);
    await vault.delete(oldPath);
    await vault.writeText(newPath, content ?? '');

    await service.refresh([oldPath, newPath]);

    const index = service.index();
    expect(index.byPath.has(oldPath)).toBe(false);
    expect(index.byPath.has(newPath)).toBe(true);
    expect(service.stats().docs).toBe(14);
  });

  it('a deleted folder removes its documents', async () => {
    const vault = fixtureStore();
    const service = await IndexService.open(vault, OPTIONS);
    const projectDir = 'projects/work/nyota-auth0-migration';
    await vault.delete(projectDir);

    await service.refresh([projectDir]);

    const remaining = service.index().docs.filter((doc) => doc.path.startsWith(`${projectDir}/`));
    expect(remaining).toEqual([]);
    expect(service.stats().docs).toBe(12);
  });

  it('an ingest protocol change refreshes sources', async () => {
    const vault = fixtureStore();
    const service = await IndexService.open(vault, OPTIONS);
    const protocolPath = 'raw/youtube/xOFkpf9KgKg/.ingest.json';
    const raw = await vault.readText(protocolPath);
    const record = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    record['title'] = 'Neuer Titel';
    await vault.writeText(protocolPath, `${JSON.stringify(record)}\n`);

    await service.refresh([protocolPath]);

    expect(service.sources()[0]?.title).toBe('Neuer Titel');
  });

  it('a touched-but-unchanged file persists nothing', async () => {
    const vault = fixtureStore();
    const service = await IndexService.open(vault, OPTIONS);
    const path = 'areas/gesundheit.md';
    const content = await vault.readText(path);
    await vault.writeText(path, content ?? ''); // same content, newer mtime
    vault.reset();

    await service.refresh([path]);

    expect(vault.statPaths).toEqual([path]);
    expect(vault.readTextPaths).toEqual([path]);
    expect(vault.writeTextPaths).toEqual([]);
  });
});
