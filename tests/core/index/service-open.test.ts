import { describe, expect, it } from 'vitest';
import { IndexService } from '@core/index/service';
import { bodyBucket } from '@core/index/persist';
import { indexBucketPath, indexFiles, indexPath } from '@core/vault/paths';
import { CountingVaultStore } from './counting-store';

/** Ein kleiner Vault ohne Rohquellen — jeder `.ingest.json`-Lesevorgang waere
 *  sonst ein falsches Positiv fuer "liest nichts". */
function twoAreaFiles(): Record<string, string> {
  return {
    'areas/one.md': '---\ntype: area\ntitle: Eins\n---\n\nErster Inhalt.\n',
    'areas/two.md': '---\ntype: area\ntitle: Zwei\n---\n\nZweiter Inhalt.\n',
  };
}

function deadlineFiles(): Record<string, string> {
  return {
    ...twoAreaFiles(),
    'projects/work/demo/project.md': [
      '---',
      'type: project',
      'title: Demo',
      'slug: demo',
      'scope: work',
      'status: active',
      '---',
      '',
      '## Todos',
      '',
      '- [ ] Etwas erledigen @due:2026-01-05',
      '',
    ].join('\n'),
  };
}

const FILES = indexFiles(indexPath());

describe('IndexService: Oeffnen eines unveraenderten Vaults', () => {
  it('opening an unchanged vault re-reads, re-derives and re-persists nothing', async () => {
    const vault = new CountingVaultStore({
      files: twoAreaFiles(),
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const options = { now: () => new Date('2026-01-02T09:00:00.000Z'), staleAfterDays: 14 };
    await IndexService.open(vault, options);
    vault.reset();

    const service = await IndexService.open(vault, options);

    expect(vault.readTextPaths.filter((path) => path.endsWith('.md'))).toEqual([]);
    expect(vault.writeTextPaths).toEqual([]);
    expect(service.stats().docs).toBe(2);
  });

  it('opening on a new day re-derives deadlines but writes no body', async () => {
    const vault = new CountingVaultStore({
      files: deadlineFiles(),
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    await IndexService.open(vault, {
      now: () => new Date('2026-01-01T09:00:00.000Z'),
      staleAfterDays: 14,
    });
    vault.reset();

    const service = await IndexService.open(vault, {
      now: () => new Date('2026-01-10T09:00:00.000Z'),
      staleAfterDays: 14,
    });

    // Kein Dokument wurde geaendert — der Baumlauf braucht keine Rumpftexte.
    expect(vault.readTextPaths.filter((path) => path.endsWith('.md'))).toEqual([]);
    // Nur das Manifest wird neu geschrieben, keine Bucket-Datei.
    expect(vault.writeTextPaths).toEqual([FILES.manifest]);

    const todo = service.index().todos.find((entry) => entry.due === '2026-01-05');
    expect(todo?.dueInDays).toBe(-5);
  });

  it('a missing body bucket costs only its documents a re-read', async () => {
    const vault = new CountingVaultStore({
      files: twoAreaFiles(),
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const options = { now: () => new Date('2026-01-02T09:00:00.000Z'), staleAfterDays: 14 };
    await IndexService.open(vault, options);

    const bucket = bodyBucket('areas/one.md');
    await vault.delete(indexBucketPath(FILES, bucket));
    vault.reset();

    const service = await IndexService.open(vault, options);

    // Nur der Pfad, dessen Bucket fehlte, wird wieder gelesen — nicht der andere.
    expect(vault.readTextPaths.filter((path) => path.endsWith('.md'))).toEqual(['areas/one.md']);
    expect(service.stats().docs).toBe(2);
    expect(service.search({ text: 'Erster' }).map((hit) => hit.path)).toEqual(['areas/one.md']);
  });

  it('a stale search file is reconciled by coverage', async () => {
    const vault = new CountingVaultStore({
      files: twoAreaFiles(),
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const options = { now: () => new Date('2026-01-02T09:00:00.000Z'), staleAfterDays: 14 };
    const service = await IndexService.open(vault, options);

    await vault.writeText(
      'areas/one.md',
      '---\ntype: area\ntitle: Eins\n---\n\nGanz neuer Schneesturm-Inhalt.\n',
    );
    // Gezielter Refresh: Manifest und Bucket werden sofort geschrieben, die
    // Suchdatei bleibt verzoegert (Standard 30s) und damit auf Platte veraltet.
    await service.refresh(['areas/one.md']);

    const reopened = await IndexService.open(vault, options);

    expect(reopened.search({ text: 'Schneesturm' }).map((hit) => hit.path)).toEqual([
      'areas/one.md',
    ]);
    expect(reopened.search({ text: 'Erster' })).toEqual([]);
  });

  it('dispose flushes the pending search save', async () => {
    const vault = new CountingVaultStore({
      files: twoAreaFiles(),
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const options = { now: () => new Date('2026-01-02T09:00:00.000Z'), staleAfterDays: 14 };
    const service = await IndexService.open(vault, options);

    await vault.writeText(
      'areas/one.md',
      '---\ntype: area\ntitle: Eins\n---\n\nGanz neuer Inhalt.\n',
    );
    await service.refresh(['areas/one.md']);
    vault.reset();

    await service.dispose();

    expect(vault.writeTextPaths).toEqual([FILES.search]);
  });
});
