/**
 * Ein Vertrag, zwei Implementierungen: diese Suite laeuft gegen `FsVaultStore` und
 * `MemoryVaultStore`. Was hier gruen ist, verhaelt sich im Speicher wie auf der Platte —
 * einschliesslich Konflikt-Semantik.
 */

import { describe, expect, it } from 'vitest';
import { VaultConflictError, VaultNotFoundError } from '@core/vault/types';
import type { VaultStore } from '@core/vault/types';

export interface StoreHarness {
  store: VaultStore;
  cleanup: () => Promise<void>;
}

const PROJECT = 'projects/work/nyota/project.md';

const projectFrontmatter = {
  type: 'project',
  title: 'Nyota Auth0 Migration',
  slug: 'nyota-auth0-migration',
  scope: 'work',
  status: 'active',
  created: '2026-06-12',
  deadline: '2026-09-01',
  tags: ['auth0'],
};

const projectBody = [
  '## Stand',
  '',
  'Rollenkonzept liegt bei Stefan.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren @due:2026-08-15 !!',
  '',
  '## Notizen',
  '',
  '### 2026-08-01',
  '',
  'Erster Testmandant steht.',
].join('\n');

export function runStoreContract(label: string, createHarness: () => Promise<StoreHarness>): void {
  describe(`VaultStore-Vertrag: ${label}`, () => {
    const withStore = async (run: (store: VaultStore) => Promise<void>): Promise<void> => {
      const harness = await createHarness();
      try {
        await run(harness.store);
      } finally {
        await harness.cleanup();
      }
    };

    it('schreibt und liest verlustfrei zurueck', async () => {
      await withStore(async (store) => {
        const written = await store.write({
          path: PROJECT,
          frontmatter: projectFrontmatter,
          body: projectBody,
        });
        expect(written.created).toBe(true);

        const doc = await store.read(PROJECT);
        expect(doc).not.toBeNull();
        expect(doc?.frontmatter.title).toBe('Nyota Auth0 Migration');
        expect(doc?.body.trim()).toBe(projectBody);
        expect(doc?.hash).toBe(written.hash);
        expect(await store.hash(PROJECT)).toBe(written.hash);
        expect(doc?.size).toBeGreaterThan(0);
      });
    });

    /* Die Felder des Nutzers behalten ihre Reihenfolge **und** ihren Stil:
       `mein_feld: [a, b]` bleibt eine Flow-Liste. Ein neues Feld kommt an seine
       kanonische Stelle (`status` gehoert vor die Datumsfelder), nicht hinten
       dran — sonst waechst das Frontmatter in Klickreihenfolge. */
    it('erhaelt unbekannte Frontmatter-Felder und ihre Reihenfolge ueber einen Patch', async () => {
      await withStore(async (store) => {
        await store.writeText(
          PROJECT,
          [
            '---',
            'type: project',
            'title: Nyota',
            'created: 2026-06-12',
            'obsidian_kanban: true',
            'mein_feld: [a, b]',
            '---',
            '',
            '## Stand',
            '',
            'Text.',
            '',
          ].join('\n'),
        );

        await store.write({ path: PROJECT, frontmatter: { status: 'waiting' } });

        const doc = await store.read(PROJECT);
        expect(doc?.frontmatter['obsidian_kanban']).toBe(true);
        expect(doc?.frontmatter['mein_feld']).toEqual(['a', 'b']);
        expect(doc?.frontmatter['status']).toBe('waiting');
        expect(Object.keys(doc?.frontmatter ?? {})).toEqual([
          'type',
          'title',
          'status',
          'created',
          'obsidian_kanban',
          'mein_feld',
        ]);
        expect(await store.readText(PROJECT)).toContain('mein_feld: [a, b]');
        expect(doc?.body.trim()).toBe('## Stand\n\nText.');
      });
    });

    it('laesst Datumsfelder Strings bleiben', async () => {
      await withStore(async (store) => {
        await store.write({
          path: PROJECT,
          frontmatter: {
            type: 'project',
            title: 'Nyota',
            created: '2026-08-10T14:32:11+02:00',
            deadline: '2026-09-01',
          },
          body: 'Text.',
        });
        await store.write({ path: PROJECT, frontmatter: { updated: '2026-08-11' } });

        const doc = await store.read(PROJECT);
        expect(typeof doc?.frontmatter['created']).toBe('string');
        expect(doc?.frontmatter['created']).toBe('2026-08-10T14:32:11+02:00');
        expect(doc?.frontmatter['deadline']).toBe('2026-09-01');
        const raw = (await store.readText(PROJECT)) ?? '';
        expect(raw).toContain('deadline: 2026-09-01');
        expect(raw).toContain('created: 2026-08-10T14:32:11+02:00');
      });
    });

    it('verweigert das Schreiben mit veraltetem Hash und laesst die Datei unveraendert', async () => {
      await withStore(async (store) => {
        const first = await store.write({
          path: PROJECT,
          frontmatter: projectFrontmatter,
          body: projectBody,
        });
        // Jemand anders (Obsidian, der Nutzer) schreibt dazwischen.
        await store.write({ path: PROJECT, frontmatter: { status: 'paused' } });
        const before = await store.readText(PROJECT);

        await expect(
          store.write({
            path: PROJECT,
            frontmatter: { status: 'done' },
            expectedHash: first.hash,
          }),
        ).rejects.toThrow(VaultConflictError);

        expect(await store.readText(PROJECT)).toBe(before);
      });
    });

    it('meldet Konflikt, wenn eine neue Datei schon existiert', async () => {
      await withStore(async (store) => {
        await store.create('inbox/2026-08-10-1432-notiz.md', { type: 'dump' }, 'Text');
        await expect(
          store.create('inbox/2026-08-10-1432-notiz.md', { type: 'dump' }, 'Anderer Text'),
        ).rejects.toThrow(VaultConflictError);
      });
    });

    it('haengt unter einem vorhandenen Abschnitt an, ohne die folgenden zu stoeren', async () => {
      await withStore(async (store) => {
        await store.write({
          path: PROJECT,
          frontmatter: projectFrontmatter,
          body: projectBody,
        });

        const result = await store.append(PROJECT, 'Todos', '- [ ] Testmandant aufsetzen');
        expect(result.sectionCreated).toBe(false);

        const doc = await store.read(PROJECT);
        const lines = (doc?.body ?? '').split('\n');
        const todosAt = lines.indexOf('## Todos');
        const notesAt = lines.indexOf('## Notizen');
        const addedAt = lines.indexOf('- [ ] Testmandant aufsetzen');
        expect(addedAt).toBeGreaterThan(todosAt);
        expect(addedAt).toBeLessThan(notesAt);
        expect(doc?.body).toContain('### 2026-08-01');
        expect(doc?.frontmatter['title']).toBe('Nyota Auth0 Migration');
      });
    });

    it('legt einen fehlenden Abschnitt am Dateiende an', async () => {
      await withStore(async (store) => {
        await store.write({
          path: PROJECT,
          frontmatter: projectFrontmatter,
          body: '## Stand\n\nAlles ruhig.',
        });

        const result = await store.append(PROJECT, 'Notizen', 'Erster Eintrag.');
        expect(result.sectionCreated).toBe(true);

        const doc = await store.read(PROJECT);
        expect(doc?.body.trim()).toBe(
          ['## Stand', '', 'Alles ruhig.', '', '## Notizen', '', 'Erster Eintrag.'].join('\n'),
        );
      });
    });

    it('verlangt fuer append eine vorhandene Datei oder ein Start-Frontmatter', async () => {
      await withStore(async (store) => {
        await expect(store.append('journal/2026/08/2026-08-10.md', 'Tag', 'Text')).rejects.toThrow(
          VaultNotFoundError,
        );

        const created = await store.append('journal/2026/08/2026-08-10.md', 'Tag', 'Text', {
          frontmatterIfNew: { type: 'journal', title: 'Montag', date: '2026-08-10' },
        });
        expect(created.created).toBe(true);
        expect(created.sectionCreated).toBe(true);
        const doc = await store.read('journal/2026/08/2026-08-10.md');
        expect(doc?.frontmatter['date']).toBe('2026-08-10');
        expect(doc?.body.trim()).toBe('## Tag\n\nText');
      });
    });

    it('loescht in den Papierkorb und stellt bitgenau wieder her', async () => {
      await withStore(async (store) => {
        const original = ['---', 'type: dump', 'title: Gedanke', '---', '', 'Roher Text.', ''].join(
          '\n',
        );
        await store.writeText('inbox/2026-08-10-1432-gedanke.md', original);

        const deleted = await store.delete('inbox/2026-08-10-1432-gedanke.md');
        expect(deleted.undoToken.length).toBeGreaterThan(8);
        expect(await store.read('inbox/2026-08-10-1432-gedanke.md')).toBeNull();
        expect(await store.exists('inbox/2026-08-10-1432-gedanke.md')).toBe(false);

        const restored = await store.undo(deleted.undoToken);
        expect(restored).toEqual(['inbox/2026-08-10-1432-gedanke.md']);
        expect(await store.readText('inbox/2026-08-10-1432-gedanke.md')).toBe(original);
        expect(await store.list({ includeInternal: true, dir: '.secondbrain/trash' })).toEqual([]);
      });
    });

    it('verschiebt und schuetzt dabei das Ziel', async () => {
      await withStore(async (store) => {
        await store.writeText('inbox/a.md', 'A\n');
        await store.writeText('inbox/b.md', 'B\n');

        await expect(store.move('inbox/a.md', 'inbox/b.md')).rejects.toThrow(VaultConflictError);
        await store.move('inbox/a.md', 'areas/a.md');
        expect(await store.readText('areas/a.md')).toBe('A\n');
        expect(await store.exists('inbox/a.md')).toBe(false);
        await expect(store.move('inbox/fehlt.md', 'areas/c.md')).rejects.toThrow(
          VaultNotFoundError,
        );
      });
    });

    it('listet nur Vault-Inhalt: kein .secondbrain, keine .tmp', async () => {
      await withStore(async (store) => {
        await store.writeText('inbox/eins.md', 'eins\n');
        await store.writeText('areas/zwei.md', 'zwei\n');
        await store.writeText('areas/drei.txt', 'drei\n');
        await store.writeText('areas/vier.md.tmp', 'halb\n');
        await store.writeText('.secondbrain/index/index.json', '{}\n');

        expect(await store.list()).toEqual(['areas/drei.txt', 'areas/zwei.md', 'inbox/eins.md']);
        expect(await store.list({ ext: '.md' })).toEqual(['areas/zwei.md', 'inbox/eins.md']);
        expect(await store.list({ dir: 'inbox' })).toEqual(['inbox/eins.md']);
        expect(await store.list({ includeInternal: true })).toContain(
          '.secondbrain/index/index.json',
        );

        const stat = await store.stat('inbox/eins.md');
        expect(stat?.dir).toBe(false);
        expect(stat?.size).toBe(5);
        expect(await store.stat('inbox/gibtsnicht.md')).toBeNull();
        expect(await store.hash('inbox/gibtsnicht.md')).toBeNull();
        expect(await store.read('inbox/gibtsnicht.md')).toBeNull();
      });
    });

    it('patcht kein unlesbares Frontmatter, haengt aber weiter an', async () => {
      await withStore(async (store) => {
        const broken = '---\ntitle: [offen\nfoo: : bar\n---\n\n## Stand\n\nText.\n';
        await store.writeText('areas/kaputt.md', broken);

        await expect(
          store.write({ path: 'areas/kaputt.md', frontmatter: { status: 'active' } }),
        ).rejects.toThrow(/Frontmatter/);
        expect(await store.readText('areas/kaputt.md')).toBe(broken);

        const appended = await store.append('areas/kaputt.md', 'Stand', 'Zweiter Satz.');
        expect(appended.sectionCreated).toBe(false);
        const after = (await store.readText('areas/kaputt.md')) ?? '';
        expect(after).toContain('title: [offen');
        expect(after).toContain('Zweiter Satz.');
      });
    });

    it('lehnt Pfade ab, die den Vault verlassen', async () => {
      await withStore(async (store) => {
        await expect(store.read('../geheim.md')).rejects.toThrow(/Unzulaessiger Pfad/);
        await expect(store.write({ path: 'C:/windows/system.ini', body: 'x' })).rejects.toThrow(
          /Unzulaessiger Pfad/,
        );
        await expect(store.readText('inbox/../../etc/passwd')).rejects.toThrow(/Unzulaessiger/);
        await expect(store.delete('/etc/passwd')).rejects.toThrow(/Unzulaessiger Pfad/);
      });
    });
  });
}
