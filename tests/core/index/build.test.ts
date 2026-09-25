import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  deriveIndex,
  deriveIndexIncremental,
  docTypeFromPath,
  toIndexedDoc,
} from '@core/index/build';
import { SearchEngine } from '@core/index/search';
import type { IndexedDoc } from '@core/index/types';
import { YIELD_EVERY } from '@core/index/yield';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { VaultStat } from '@core/vault/types';
import { ALL_DOC_TYPES } from '@shared/types';
import { CountingStore, NYOTA_PROJECT, TODAY, makeDoc, vaultFiles, vaultStore } from './fixtures';

const NOTE = (title: string, body: string): string =>
  ['---', 'type: note', `title: ${title}`, '---', '', body, ''].join('\n');

function smallStore(): CountingStore {
  return new CountingStore({
    files: {
      'areas/a.md': NOTE('A', 'Erster Text.'),
      'areas/b.md': NOTE('B', 'Zweiter Text.'),
      'inbox/c.md': NOTE('C', 'Dritter Text.'),
    },
    now: new Date('2026-08-09T08:00:00.000Z'),
  });
}

describe('buildIndex: Durchlauf', () => {
  it('indiziert jede Markdown-Datei und leitet Typ, Modul, Projekt und Scope ab', async () => {
    const index = await buildIndex(vaultStore(), { now: TODAY });
    expect(index.docs).toHaveLength(Object.keys(vaultFiles()).length - 1);
    expect(index.byPath.size).toBe(index.docs.length);

    const project = index.byPath.get('projects/work/nyota-auth0-migration/project.md');
    expect(project).toMatchObject({
      docType: 'project',
      title: 'Nyota Auth0 Migration',
      scope: 'work',
      project: 'nyota-auth0-migration',
      module: null,
      tags: ['auth0', 'infrastruktur'],
      bodyLine: 20,
    });
    expect(project?.text).toBe(project?.body.toLowerCase());
    expect(project?.words).toBeGreaterThan(20);

    expect(index.byPath.get('modules/identity-management/wiki/entities/auth0.md')).toMatchObject({
      docType: 'entity',
      module: 'identity-management',
      scope: null,
    });
    expect(index.byPath.get('journal/2026/08/2026-08-10.md')?.scope).toBe('work');
    expect(index.builtAt.length).toBeGreaterThan(0);
    expect(index.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('laesst `.secondbrain/` und Nicht-Markdown aussen vor', async () => {
    const store = vaultStore();
    await store.writeText('.secondbrain/index/index.json', '{"schema":1}');
    await store.writeText('raw/files/2026-08-10-vertrag/vertrag.pdf', 'nicht lesbar');
    const index = await buildIndex(store, { now: TODAY });
    expect([...index.byPath.keys()].some((path) => path.startsWith('.secondbrain/'))).toBe(false);
    expect([...index.byPath.keys()].some((path) => path.endsWith('.pdf'))).toBe(false);
  });

  it('sammelt Todos aller Dateien mit Projekttitel', async () => {
    const index = await buildIndex(vaultStore(), { now: TODAY });
    expect(index.todos).toHaveLength(9);
    const mapping = index.todos.find((todo) => todo.text.startsWith('Rollen-Mapping'));
    expect(mapping?.projectTitle).toBe('Nyota Auth0 Migration');
    expect(index.projects.map((project) => project.slug).sort()).toEqual([
      'keller-ausbau',
      'nyota-auth0-migration',
    ]);
    const nyota = index.projects.find((project) => project.slug === 'nyota-auth0-migration');
    expect(nyota?.todoCount).toBe(5);
    expect(nyota?.openTodoCount).toBe(4);
  });

  it('meldet Fortschritt bis zum Ende', async () => {
    const seen: [number, number][] = [];
    await buildIndex(vaultStore(), {
      now: TODAY,
      onProgress: (done, total) => seen.push([done, total]),
    });
    const total = Object.keys(vaultFiles()).length - 1;
    expect(seen[0]).toEqual([0, total]);
    expect(seen[seen.length - 1]).toEqual([total, total]);
    expect(seen.every(([done, count]) => done <= count && count === total)).toBe(true);
  });
});

describe('buildIndex: Groessengrenze', () => {
  it('an oversized file is indexed by name only and never read', async () => {
    const store = smallStore();
    const big = 'x'.repeat(2 * 1024 * 1024 + 1);
    await store.write({ path: 'areas/big.md', body: big });
    store.reads.length = 0;

    const index = await buildIndex(store);

    expect(store.markdownReads()).not.toContain('areas/big.md');
    expect(store.markdownReads().sort()).toEqual(['areas/a.md', 'areas/b.md', 'inbox/c.md']);

    const doc = index.byPath.get('areas/big.md');
    expect(doc).toMatchObject({
      docType: 'area',
      body: '',
      text: '',
      words: 0,
      hash: '',
      frontmatter: {},
      oversized: true,
    });
    expect(doc?.title.length).toBeGreaterThan(0);
    expect(index.docs).toHaveLength(4);
  });
});

describe('buildIndex: inkrementell', () => {
  it('liest beim ersten Lauf alles', async () => {
    const store = smallStore();
    const index = await buildIndex(store);
    expect(store.markdownReads().sort()).toEqual(['areas/a.md', 'areas/b.md', 'inbox/c.md']);
    expect(index.docs).toHaveLength(3);
  });

  it('liest beim zweiten Lauf nichts, wenn sich nichts geaendert hat', async () => {
    const store = smallStore();
    const first = await buildIndex(store);
    store.reads.length = 0;
    const second = await buildIndex(store, { previous: first });
    expect(store.markdownReads()).toEqual([]);
    expect(second.docs).toHaveLength(3);
    // Dieselben Objekte: die Ableitung wurde uebernommen, nicht neu gerechnet.
    expect(second.byPath.get('areas/a.md')).toBe(first.byPath.get('areas/a.md'));
  });

  it('liest genau die geaenderte Datei neu', async () => {
    const store = smallStore();
    const first = await buildIndex(store);
    await store.write({ path: 'areas/b.md', body: 'Zweiter Text, jetzt mit Kaffeemaschine.' });
    store.reads.length = 0;
    const second = await buildIndex(store, { previous: first });
    expect(store.markdownReads()).toEqual(['areas/b.md']);
    expect(second.byPath.get('areas/b.md')?.body).toContain('Kaffeemaschine');
    expect(second.byPath.get('areas/b.md')?.hash).not.toBe(first.byPath.get('areas/b.md')?.hash);
  });

  it('behaelt die Ableitung, wenn eine Datei nur angefasst wurde', async () => {
    const store = smallStore();
    const first = await buildIndex(store);
    const before = first.byPath.get('areas/a.md');
    await store.writeText('areas/a.md', (await store.readText('areas/a.md')) ?? '');
    store.reads.length = 0;
    const second = await buildIndex(store, { previous: first });
    const after = second.byPath.get('areas/a.md');
    // Einmal gelesen, um den Hash zu vergleichen — danach unveraendert uebernommen.
    expect(store.markdownReads()).toEqual(['areas/a.md']);
    expect(after?.hash).toBe(before?.hash);
    expect(after?.words).toBe(before?.words);
    expect(after?.updated).not.toBe(before?.updated);
  });

  it('nimmt neue Dateien auf und verschwundene heraus', async () => {
    const store = smallStore();
    const first = await buildIndex(store);
    await store.delete('areas/b.md');
    await store.writeText('areas/d.md', NOTE('D', 'Vierter Text.'));
    store.reads.length = 0;
    const second = await buildIndex(store, { previous: first });
    expect(store.markdownReads()).toEqual(['areas/d.md']);
    expect([...second.byPath.keys()].sort()).toEqual(['areas/a.md', 'areas/d.md', 'inbox/c.md']);
  });
});

describe('toIndexedDoc', () => {
  const stat: VaultStat = {
    path: 'notes/ohne-frontmatter.md',
    size: 12,
    modified: '2026-08-10T09:00:00.000Z',
    dir: false,
  };

  it('kommt ohne Frontmatter aus und nimmt den Dateinamen als Titel', () => {
    const doc = toIndexedDoc(stat.path, 'Nur Text, kein Kopf.\n', stat);
    expect(doc).toMatchObject({ title: 'ohne frontmatter', docType: 'note', bodyLine: 1 });
    expect(doc.frontmatter).toEqual({});
  });

  it('deutet kaputtes Frontmatter nicht, statt zu scheitern', () => {
    const content = ['---', 'title: [unclosed', '---', '', 'Rumpf.'].join('\n');
    const doc = toIndexedDoc(stat.path, content, stat);
    expect(doc.frontmatter).toEqual({});
    expect(doc.body.trim()).toBe('Rumpf.');
    expect(doc.bodyLine).toBe(4);
  });

  it('uebernimmt type: condensed aus dem Frontmatter unverändert', () => {
    const content = ['---', 'type: condensed', 'title: Verdichtet', '---', '', 'Rumpf.'].join('\n');
    const doc = toIndexedDoc(stat.path, content, stat);
    expect(doc.docType).toBe('condensed');
  });

  it('faellt bei unbekanntem type auf docTypeFromPath zurueck', () => {
    const content = ['---', 'type: unbekannt', 'title: X', '---', '', 'Rumpf.'].join('\n');
    const doc = toIndexedDoc(stat.path, content, stat);
    expect(doc.docType).toBe(docTypeFromPath(stat.path));
    expect(doc.docType).toBe('note');
  });
});

describe('ALL_DOC_TYPES', () => {
  it('enthaelt genau die Mitglieder von DocType', () => {
    // Hardcodiert statt aus dem Typ abgeleitet: TS-Unions sind zur Laufzeit nicht
    // einsehbar. Dieser Laufzeit-Test ist nur eine zusaetzliche Regressionspruefung —
    // die eigentliche Exhaustivitaet wird durch den Typ-Level-Check direkt neben
    // `ALL_DOC_TYPES` in vault.ts erzwungen: wird `DocType` erweitert, ohne
    // `ALL_DOC_TYPES` zu pflegen, schlaegt dort schon `tsc` fehl, bevor dieser Test
    // ueberhaupt laeuft.
    const expected = [
      'dump',
      'note',
      'project',
      'area',
      'condensed',
      'journal',
      'source',
      'entity',
      'concept',
      'overview',
    ];
    expect([...ALL_DOC_TYPES].sort()).toEqual([...expected].sort());
  });
});

describe('docTypeFromPath', () => {
  it('kennt die Orte aus VAULT-FORMAT.md', () => {
    expect(docTypeFromPath('inbox/2026-08-10-1432-x.md')).toBe('dump');
    expect(docTypeFromPath('journal/2026/08/2026-08-10.md')).toBe('journal');
    expect(docTypeFromPath('projects/work/x/project.md')).toBe('project');
    expect(docTypeFromPath('projects/work/x/notes/y.md')).toBe('note');
    expect(docTypeFromPath('areas/gesundheit.md')).toBe('area');
    expect(docTypeFromPath('modules/m/wiki/sources/s-2026-08-10-x.md')).toBe('source');
    expect(docTypeFromPath('modules/m/wiki/entities/x.md')).toBe('entity');
    expect(docTypeFromPath('modules/m/wiki/concepts/x.md')).toBe('concept');
    expect(docTypeFromPath('modules/m/wiki/overview.md')).toBe('overview');
    expect(docTypeFromPath('raw/youtube/abc/transcript.md')).toBe('note');
  });

  it('erkennt beide Verdichtungs-Artefakte am Pfad, auch ohne Frontmatter (046, D3)', () => {
    // Der Fallback greift nur, wenn kein `type:` deklariert ist — genau der Fall,
    // den 037/044 als Ausnahme neben `area`/`project` dokumentieren.
    expect(docTypeFromPath('areas/gesundheit.condensed.md')).toBe('condensed');
    expect(docTypeFromPath('projects/work/nyota/condensed.md')).toBe('condensed');
    // Eine gewoehnliche Projektdatei bleibt `project`, keine falsche Uebernahme.
    expect(docTypeFromPath('projects/work/nyota/project.md')).toBe('project');
  });
});

describe('deriveIndex', () => {
  it('rechnet ohne Dateizugriff und bezieht Fristen auf das uebergebene heute', () => {
    const stat: VaultStat = {
      path: 'projects/work/nyota-auth0-migration/project.md',
      size: NYOTA_PROJECT.length,
      modified: '2026-08-10T09:00:00.000Z',
      dir: false,
    };
    const doc = toIndexedDoc(stat.path, NYOTA_PROJECT, stat);
    const index = deriveIndex([doc], { now: '2026-08-14' });
    expect(index.todos.find((todo) => todo.due === '2026-08-15')?.dueInDays).toBe(1);
    expect(index.projects[0]?.ageDays).toBe(4);
  });

  it('liest keine Todos aus einem kondensierten Artefakt (story 044, review fix)', () => {
    // A project's condensed.md sits inside projects/<scope>/<slug>/, so
    // projectOfPath() resolves it to that project — a checkbox-looking line the
    // model writes as prose (e.g. quoting an existing todo as evidence) must not
    // become a second, phantom open todo of that project.
    const stat: VaultStat = {
      path: 'projects/work/nyota/condensed.md',
      size: 0,
      modified: '2026-08-10T09:00:00.000Z',
      dir: false,
    };
    const content = [
      '---',
      'type: condensed',
      'title: Nyota',
      'condensed_at: 2026-08-10T09:00:00+02:00',
      'sources: []',
      '---',
      '## State',
      '',
      '- [ ] Sieht aus wie ein Todo, ist aber zitierte Prosa.',
      '',
      'Aus: projects/work/nyota/project.md',
    ].join('\n');
    const doc = toIndexedDoc(stat.path, content, stat);
    expect(doc.docType).toBe('condensed');
    const index = deriveIndex([doc], { now: '2026-08-14' });
    expect(index.todos).toEqual([]);
  });
});

describe('deriveIndexIncremental', () => {
  it('yields to the event loop between chunks on a large build', async () => {
    const docs: IndexedDoc[] = [];
    for (let i = 0; i < 1000; i += 1) {
      docs.push(makeDoc({ path: `areas/n-${i}.md`, body: `Text ${i}` }));
    }
    let calls = 0;
    await deriveIndexIncremental(docs, null, {
      now: TODAY,
      yieldControl: async () => {
        calls += 1;
      },
    });
    expect(calls).toBeGreaterThanOrEqual(Math.floor(1000 / YIELD_EVERY));
  });

  it("reuses an unchanged doc's todos instead of re-parsing, but refreshes dueInDays", async () => {
    const stat: VaultStat = {
      path: 'projects/work/nyota-auth0-migration/project.md',
      size: NYOTA_PROJECT.length,
      modified: '2026-08-10T09:00:00.000Z',
      dir: false,
    };
    const doc = toIndexedDoc(stat.path, NYOTA_PROJECT, stat);
    const previous = deriveIndex([doc], { now: '2026-08-10' });
    // A marker a real parse run would never produce — proof that the todo was
    // carried over from the previous index instead of parsed anew.
    const target = previous.todos.find((todo) => todo.due === '2026-08-15');
    expect(target).toBeDefined();
    if (target !== undefined) target.text = 'MARKER-FROM-PREVIOUS-RUN';

    const next = await deriveIndexIncremental([doc], previous, { now: '2026-08-14' });
    const reused = next.todos.find((todo) => todo.due === '2026-08-15');
    expect(reused?.text).toBe('MARKER-FROM-PREVIOUS-RUN');
    // Reused, not the exact same object — a shallow copy so refreshing dueInDays
    // below does not mutate the previous index's todo.
    expect(reused).not.toBe(target);
    expect(reused?.dueInDays).toBe(1);
    expect(target?.dueInDays).not.toBe(1);
  });
});

describe('buildIndex: Tempo', () => {
  it('schafft 5000 Dokumente samt Suchindex in unter 10 Sekunden', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5000; i += 1) {
      files[`areas/notiz-${i}.md`] = [
        '---',
        'type: note',
        `title: Notiz ${i} über Rollen und Zugriff`,
        'tags: [rollen, zugriff]',
        '---',
        '',
        `Das Rollenkonzept in Notiz ${i} beschreibt, wie Rechte an Rollen haengen`,
        'und welche Rückmeldung dafür noch fehlt.',
        '',
        '- [ ] Notiz durchsehen @due:2026-08-15 !!',
        '',
      ].join('\n');
    }
    const store = new MemoryVaultStore({ files, now: new Date('2026-08-09T08:00:00.000Z') });
    const started = Date.now();
    const index = await buildIndex(store, { now: TODAY });
    const engine = SearchEngine.from(index.docs);
    const elapsed = Date.now() - started;
    expect(index.docs).toHaveLength(5000);
    expect(index.todos).toHaveLength(5000);
    expect(engine.search({ text: 'Rückmeldung', limit: 5 }, index.byPath)).toHaveLength(5);
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);
});
