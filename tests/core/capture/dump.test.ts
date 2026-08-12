/* Der Schreibpfad des Erfassens: Text rein, Datei in `inbox/`.
   Geprüft wird das Format aus docs/VAULT-FORMAT.md — und dass zwei Dumps in
   derselben Minute sich nicht überschreiben. */

import { describe, expect, it } from 'vitest';
import { parse } from '@core/vault/frontmatter';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { dumpTitle, EmptyDumpError, writeDump } from '@core/capture';

const NOW = new Date('2026-08-10T14:32:11+02:00');

function store(): MemoryVaultStore {
  return new MemoryVaultStore({ now: NOW });
}

describe('writeDump', () => {
  it('legt die Datei nach `inbox/<stamp>-<slug>.md` mit vollem Frontmatter', async () => {
    const vault = store();
    const dump = await writeDump(
      vault,
      { text: 'Gedanke zur Deployment-Pipeline\n\nMigrationen vorher prüfen.', origin: 'window' },
      { now: NOW },
    );

    expect(dump.path).toBe('inbox/2026-08-10-1432-gedanke-zur-deployment-pipeline.md');
    const content = await vault.readText(dump.path);
    expect(content).not.toBeNull();
    const parsed = parse(content ?? '');
    expect(parsed.frontmatter['type']).toBe('dump');
    expect(parsed.frontmatter['title']).toBe('Gedanke zur Deployment-Pipeline');
    expect(parsed.frontmatter['status']).toBe('raw');
    expect(parsed.frontmatter['origin']).toBe('window');
    expect(parsed.frontmatter['tags']).toEqual([]);
    expect(parsed.frontmatter['scope']).toBeNull();
    expect(parsed.body.trim()).toContain('Migrationen vorher prüfen.');
  });

  it('gibt den Dump so zurück, wie der Renderer ihn anzeigt', async () => {
    const dump = await writeDump(
      store(),
      { text: 'Kurzer Gedanke.', origin: 'quick-capture', tags: ['idee', ' '], scope: 'work' },
      { now: NOW },
    );

    expect(dump.status).toBe('raw');
    expect(dump.ageDays).toBe(0);
    expect(dump.wordCount).toBe(2);
    expect(dump.tags).toEqual(['idee']);
    expect(dump.scope).toBe('work');
    expect(dump.id).toBe('2026-08-10-1432-kurzer-gedanke');
  });

  it('überschreibt keinen Dump aus derselben Minute', async () => {
    const vault = store();
    const first = await writeDump(
      vault,
      { text: 'Derselbe Satz.', origin: 'window' },
      { now: NOW },
    );
    const second = await writeDump(
      vault,
      { text: 'Derselbe Satz.', origin: 'window' },
      { now: NOW },
    );

    expect(second.path).not.toBe(first.path);
    expect(await vault.readText(first.path)).not.toBeNull();
    expect(await vault.readText(second.path)).not.toBeNull();
  });

  /* Der lange Titel ist der interessante Fall: `slugify` kappt auf 60 Zeichen,
     und eine angehängte '-2' wäre damit wieder weg. Dann hieße jeder Versuch
     gleich — und der zweite Gedanke derselben Minute käme als Konflikt zurück. */
  it('überschreibt auch bei einem langen Titel keinen Dump aus derselben Minute', async () => {
    const vault = store();
    const text =
      'Kundenportal: die Angebotsliste braucht bei 400 Zeilen über drei Sekunden, das muss weg.';

    const first = await writeDump(vault, { text, origin: 'window' }, { now: NOW });
    const second = await writeDump(vault, { text, origin: 'window' }, { now: NOW });
    const third = await writeDump(vault, { text, origin: 'window' }, { now: NOW });

    expect(new Set([first.path, second.path, third.path]).size).toBe(3);
    for (const path of [first.path, second.path, third.path]) {
      expect(await vault.readText(path)).not.toBeNull();
      /* Der Dateiname bleibt trotzdem im Rahmen von VAULT-FORMAT.md. */
      expect((path.split('/').pop() ?? '').length).toBeLessThanOrEqual(80);
    }
  });

  it('weist leeren Text ab, statt eine leere Datei anzulegen', async () => {
    const vault = store();
    await expect(writeDump(vault, { text: '   \n  ', origin: 'window' })).rejects.toBeInstanceOf(
      EmptyDumpError,
    );
    expect(await vault.list({ dir: 'inbox' })).toEqual([]);
  });
});

describe('dumpTitle', () => {
  it('nimmt die erste inhaltliche Zeile ohne Markdown-Auszeichnung', () => {
    expect(dumpTitle('\n\n# Überschrift\nZweite Zeile')).toBe('Überschrift');
    expect(dumpTitle('- Einkauf fürs Hochbeet\nNoppenfolie')).toBe('Einkauf fürs Hochbeet');
  });

  it('kürzt an einer Wortgrenze', () => {
    const title = dumpTitle('Ein sehr langer Gedanke über die Pipeline und ihre Migrationen', 30);
    expect(title.length).toBeLessThanOrEqual(31);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain('Migrationen');
  });
});
