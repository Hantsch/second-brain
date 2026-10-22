/* The migration engine (`core/vault/section-migration.ts`): the one path that
   renames a heading in a file the app did not write. Two things are nailed down
   here — a fold loses no line of the user's content, and a stale hash ends as a
   `conflict` with the file exactly as it was. */

import { describe, expect, it } from 'vitest';
import { MemoryVaultStore } from '@core/vault/memory-store';
import {
  applySectionMigration,
  isMigratablePath,
  migrateSectionHeadings,
  planSectionMigration,
} from '@core/vault/section-migration';

const PROJECT = 'projects/work/kundenportal/project.md';

function file(...body: string[]): string {
  return ['---', 'type: project', 'title: Kundenportal', '---', '', ...body].join('\n');
}

/** Every line that carries content — the set a migration may not shrink. */
function contentLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('## '));
}

function headings(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
}

async function docOf(store: MemoryVaultStore, path: string) {
  const doc = await store.read(path);
  if (doc === null) throw new Error(`missing: ${path}`);
  return doc;
}

describe('planSectionMigration', () => {
  it('plans a rename where only the old-language heading is there', () => {
    const body = ['## Status', '', 'Wo es steht.', '', '## Notizen', '', 'Erste Notiz.', ''];
    const plan = planSectionMigration([{ path: PROJECT, body: body.join('\n'), hash: 'h1' }], 'en');

    expect(plan).toEqual([
      {
        path: PROJECT,
        hash: 'h1',
        renames: [{ kind: 'notes', from: 'Notizen', to: 'Notes' }],
        folds: [],
      },
    ]);
  });

  it('plans a fold where the file carries both headings', () => {
    const body = ['## Notes', '', 'Mine.', '', '## Notizen', '', 'The app added this.', ''];
    const plan = planSectionMigration([{ path: PROJECT, body: body.join('\n'), hash: 'h1' }], 'en');

    expect(plan[0]?.renames).toEqual([]);
    expect(plan[0]?.folds).toEqual([{ kind: 'notes', from: 'Notizen', into: 'Notes' }]);
  });

  it('is empty when every heading already speaks the target language', () => {
    const body = ['## Status', '', 'Where it stands.', '', '## Todos', '', '- [ ] Ship it.', ''];
    expect(
      planSectionMigration([{ path: PROJECT, body: body.join('\n'), hash: 'h1' }], 'en'),
    ).toEqual([]);
  });

  it('leaves "Todos" alone — it is the same word in both languages', () => {
    const body = ['## Todos', '', '- [ ] Rollenmapping.', ''];
    expect(
      planSectionMigration([{ path: PROJECT, body: body.join('\n'), hash: 'h1' }], 'en'),
    ).toEqual([]);
    expect(
      planSectionMigration([{ path: PROJECT, body: body.join('\n'), hash: 'h1' }], 'de'),
    ).toEqual([]);
  });

  it('ignores a `###` heading — only the managed `##` sections are migrated', () => {
    const body = ['## Notes', '', '### Notizen', '', 'A subheading of my own.', ''];
    expect(
      planSectionMigration([{ path: PROJECT, body: body.join('\n'), hash: 'h1' }], 'en'),
    ).toEqual([]);
  });

  it('leaves module-only headings alone while still migrating the shared kinds', () => {
    const body = [
      '## Contradictions',
      '',
      'Mine.',
      '',
      '## Decided',
      '',
      'Also mine.',
      '',
      '## Notes',
      '',
      'Migrates.',
      '',
    ].join('\n');
    const plan = planSectionMigration([{ path: PROJECT, body, hash: 'h1' }], 'de');

    expect(plan).toEqual([
      {
        path: PROJECT,
        hash: 'h1',
        renames: [{ kind: 'notes', from: 'Notes', to: 'Notizen' }],
        folds: [],
      },
    ]);
    const migrated = migrateSectionHeadings(body, 'de');
    expect(headings(migrated)).toEqual(['Contradictions', 'Decided', 'Notizen']);
    expect(contentLines(migrated)).toEqual(contentLines(body));
  });

  it('never plans anything under raw/, .secondbrain/ or a wiki folder', () => {
    const body = ['## Notizen', '', 'Text.', ''].join('\n');
    const docs = [
      { path: 'raw/web/2026-08-10-page.md', body, hash: 'h1' },
      { path: '.secondbrain/logs/note.md', body, hash: 'h2' },
      { path: 'modules/identity/wiki/concepts/rbac.md', body, hash: 'h3' },
      { path: 'inbox/2026-08-10-1432-note.txt', body, hash: 'h4' },
    ];
    expect(planSectionMigration(docs, 'en')).toEqual([]);
    expect(isMigratablePath('areas/gesundheit.md')).toBe(true);
    expect(isMigratablePath('modules/identity/module.md')).toBe(true);
  });

  it('never plans a heading inside the Gaston-managed agent setup files', () => {
    const body = ['## Notizen', '', 'Text.', ''].join('\n');
    const docs = [
      { path: '.claude/skills/x/SKILL.md', body, hash: 'h1' },
      { path: 'CLAUDE.md', body, hash: 'h2' },
      { path: 'areas/gesundheit.md', body, hash: 'h3' },
    ];

    expect(planSectionMigration(docs, 'en').map((entry) => entry.path)).toEqual([
      'areas/gesundheit.md',
    ]);
    expect(isMigratablePath('.claude/skills/x/SKILL.md')).toBe(false);
    expect(isMigratablePath('CLAUDE.md')).toBe(false);
    expect(isMigratablePath('modules/identity/CLAUDE.md')).toBe(true);
  });
});

describe('migrateSectionHeadings', () => {
  it('renames the heading and touches nothing else', () => {
    const body = ['## Stand', '', 'Wo es steht.', '', '## Notizen', '', 'Erste Notiz.', ''].join(
      '\n',
    );
    const next = migrateSectionHeadings(body, 'en');

    expect(headings(next)).toEqual(['Status', 'Notes']);
    expect(contentLines(next)).toEqual(contentLines(body));
  });

  it('folds both sections into the target heading without losing a line', () => {
    const body = [
      '## Notes',
      '',
      '### 2026-08-09',
      '',
      'My own note.',
      '',
      '## Todos',
      '',
      '- [ ] Keep this todo.',
      '',
      '## Notizen',
      '',
      '### 2026-08-10',
      '',
      'What the app filed.',
      'A second line of it.',
      '',
    ].join('\n');
    const next = migrateSectionHeadings(body, 'en');

    expect(headings(next)).toEqual(['Notes', 'Todos']);
    for (const line of contentLines(body)) expect(next).toContain(line);
    /* Not a line more and not a line less — the order changes, because the
       moved lines now sit inside `## Notes` and no longer behind `## Todos`. */
    expect(contentLines(next).sort()).toEqual(contentLines(body).sort());
    /* The moved lines sit under `## Notes`, above the next heading. */
    const notes = next.slice(next.indexOf('## Notes'), next.indexOf('## Todos'));
    expect(notes).toContain('What the app filed.');
    expect(notes).toContain('A second line of it.');
    expect(notes).toContain('My own note.');
  });

  it('folds an old section that stands before the target one', () => {
    const body = [
      '## Notizen',
      '',
      'Aelter, aber zuerst im Dokument.',
      '',
      '## Notes',
      '',
      'Newer.',
      '',
    ].join('\n');
    const next = migrateSectionHeadings(body, 'en');

    expect(headings(next)).toEqual(['Notes']);
    expect(contentLines(next)).toEqual(['Newer.', 'Aelter, aber zuerst im Dokument.']);
  });

  it('drops an emptied old heading and keeps the target section as it was', () => {
    const body = ['## Notes', '', 'Mine.', '', '## Notizen', '', ''].join('\n');
    const next = migrateSectionHeadings(body, 'en');

    expect(headings(next)).toEqual(['Notes']);
    expect(contentLines(next)).toEqual(['Mine.']);
  });

  it('folds every duplicate of the old heading into the one target section', () => {
    const body = [
      '## Notizen',
      '',
      'Erste.',
      '',
      '## Notes',
      '',
      'Mine.',
      '',
      '## Notizen',
      '',
      'Zweite.',
      '',
    ].join('\n');
    const next = migrateSectionHeadings(body, 'en');

    expect(headings(next)).toEqual(['Notes']);
    expect(contentLines(next).sort()).toEqual(['Erste.', 'Mine.', 'Zweite.']);
  });

  it('migrates the other way round as well', () => {
    const body = ['## Status', '', 'Where it stands.', '', '## Notes', '', 'A note.', ''].join(
      '\n',
    );
    expect(headings(migrateSectionHeadings(body, 'de'))).toEqual(['Stand', 'Notizen']);
  });
});

describe('applySectionMigration', () => {
  it('writes the renamed heading and reports what it did', async () => {
    const before = file('## Notizen', '', '### 2026-08-10', '', 'Erste Notiz.', '');
    const store = new MemoryVaultStore({ files: { [PROJECT]: before } });
    const doc = await docOf(store, PROJECT);

    const plan = planSectionMigration([doc], 'en');
    const results = await applySectionMigration(store, plan, 'en');

    expect(results).toEqual([{ path: PROJECT, outcome: 'migrated', renames: 1, folds: 0 }]);
    const after = await docOf(store, PROJECT);
    expect(after.body).toContain('## Notes');
    expect(after.body).not.toContain('## Notizen');
    expect(after.body).toContain('### 2026-08-10');
    expect(after.body).toContain('Erste Notiz.');
    expect(after.frontmatter.title).toBe('Kundenportal');
  });

  it('folds two sections into one, keeping every line', async () => {
    const before = file(
      '## Notes',
      '',
      '### 2026-08-09',
      '',
      'My own note.',
      '',
      '## Notizen',
      '',
      '### 2026-08-10',
      '',
      'What the app filed.',
      '',
    );
    const store = new MemoryVaultStore({ files: { [PROJECT]: before } });
    const doc = await docOf(store, PROJECT);

    const results = await applySectionMigration(store, planSectionMigration([doc], 'en'), 'en');

    expect(results).toEqual([{ path: PROJECT, outcome: 'migrated', renames: 0, folds: 1 }]);
    const after = await docOf(store, PROJECT);
    expect(headings(after.body)).toEqual(['Notes']);
    for (const line of contentLines(doc.body)) expect(after.body).toContain(line);
    expect(contentLines(after.body)).toEqual(contentLines(doc.body));
  });

  it('does nothing at all when there is nothing to migrate', async () => {
    const before = file('## Status', '', 'Where it stands.', '', '## Notes', '', 'A note.', '');
    const store = new MemoryVaultStore({ files: { [PROJECT]: before } });
    const doc = await docOf(store, PROJECT);

    const plan = planSectionMigration([doc], 'en');
    expect(plan).toEqual([]);
    expect(await applySectionMigration(store, plan, 'en')).toEqual([]);
    expect((await docOf(store, PROJECT)).hash).toBe(doc.hash);
  });

  it('reports a conflict and writes nothing when the file changed since the plan', async () => {
    const before = file('## Notizen', '', 'Erste Notiz.', '');
    const store = new MemoryVaultStore({ files: { [PROJECT]: before } });
    const doc = await docOf(store, PROJECT);
    const plan = planSectionMigration([doc], 'en');

    /* The user edits the file in Obsidian between the preview and the confirm. */
    await store.write({ path: PROJECT, body: '## Notizen\n\nErste Notiz.\n\nUnd noch eine.\n' });
    const edited = await docOf(store, PROJECT);

    const results = await applySectionMigration(store, plan, 'en');

    expect(results).toEqual([{ path: PROJECT, outcome: 'conflict', renames: 0, folds: 0 }]);
    const after = await docOf(store, PROJECT);
    expect(after.hash).toBe(edited.hash);
    expect(after.body).toContain('## Notizen');
    expect(after.body).toContain('Und noch eine.');
    expect(after.body).not.toContain('## Notes');
  });

  it('keeps going after a conflict and reports a deleted file as missing', async () => {
    const other = 'areas/gesundheit.md';
    const store = new MemoryVaultStore({
      files: {
        [PROJECT]: file('## Notizen', '', 'Erste Notiz.', ''),
        [other]: [
          '---',
          'type: area',
          'title: Gesundheit',
          '---',
          '',
          '## Notizen',
          '',
          'Text.',
          '',
        ].join('\n'),
      },
    });
    const plan = planSectionMigration(
      [await docOf(store, PROJECT), await docOf(store, other)],
      'en',
    );
    expect(plan).toHaveLength(2);

    await store.write({ path: PROJECT, body: '## Notizen\n\nGeaendert.\n' });
    const results = await applySectionMigration(
      store,
      [...plan, { path: 'areas/weg.md', hash: 'h', renames: [], folds: [] }],
      'en',
    );

    expect(results.map((result) => result.outcome)).toEqual(['conflict', 'migrated', 'missing']);
    expect((await docOf(store, other)).body).toContain('## Notes');
  });

  it('refuses a plan entry whose path it may not write', async () => {
    const store = new MemoryVaultStore({ files: {} });
    const results = await applySectionMigration(
      store,
      [{ path: 'raw/web/2026-08-10-page.md', hash: 'h', renames: [], folds: [] }],
      'en',
    );
    expect(results[0]?.outcome).toBe('skipped');
  });

  it('leaves the managed agent setup files untouched even when a plan names them', async () => {
    const text = '## Notizen\n\nText.\n';
    const paths = ['.claude/skills/x/SKILL.md', 'CLAUDE.md'];
    const store = new MemoryVaultStore({ files: Object.fromEntries(paths.map((p) => [p, text])) });
    const entries = paths.map((path) => ({ path, hash: 'h', renames: [], folds: [] }));

    const results = await applySectionMigration(store, entries, 'en');

    expect(results.map((result) => result.outcome)).toEqual(['skipped', 'skipped']);
    for (const path of paths) expect((await docOf(store, path)).body).toBe(text);
  });
});
