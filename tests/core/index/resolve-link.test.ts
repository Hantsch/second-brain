import { describe, expect, it } from 'vitest';
import { resolveLink } from '@core/index/resolve-link';
import { makeDoc } from './fixtures';

describe('resolveLink: Rule 1 — existing vault path', () => {
  const docs = [makeDoc({ path: 'notes/plan.md', docType: 'note' })];

  it('findet einen unveraenderten Pfad', () => {
    expect(resolveLink('notes/plan.md', 'inbox/dump.md', docs)).toBe('notes/plan.md');
  });

  it('entfernt ein fuehrendes "./"', () => {
    expect(resolveLink('./notes/plan.md', 'inbox/dump.md', docs)).toBe('notes/plan.md');
  });

  it('entfernt einen angehaengten ":Zeile"-Verweis', () => {
    expect(resolveLink('notes/plan.md:42', 'inbox/dump.md', docs)).toBe('notes/plan.md');
  });

  it('entfernt beides zugleich', () => {
    expect(resolveLink('./notes/plan.md:7', 'inbox/dump.md', docs)).toBe('notes/plan.md');
  });
});

describe('resolveLink: Rule 2 — Wikilink', () => {
  const rbacPage = makeDoc({
    path: 'modules/identity-management/wiki/concepts/rbac.md',
    docType: 'concept',
    frontmatter: { type: 'concept' },
  });
  const docs = [rbacPage];

  it('[[modul/slug]] loest auf die Wiki-Seite des Moduls auf', () => {
    expect(resolveLink('[[identity-management/rbac]]', 'inbox/dump.md', docs)).toBe(rbacPage.path);
  });

  it('[[slug]] loest innerhalb des eigenen Moduls auf', () => {
    const fromInsideModule = 'modules/identity-management/wiki/entities/auth0.md';
    expect(resolveLink('[[rbac]]', fromInsideModule, docs)).toBe(rbacPage.path);
  });
});

describe('resolveLink: Rule 3 — Projekt- oder Area-Slug', () => {
  const project = makeDoc({
    path: 'projects/work/nyota-auth0-migration/project.md',
    docType: 'project',
    project: 'nyota-auth0-migration',
  });
  const area = makeDoc({ path: 'areas/gesundheit.md', docType: 'area' });
  const docs = [project, area];

  it('Projekt-Slug loest auf die project.md auf', () => {
    expect(resolveLink('nyota-auth0-migration', 'inbox/dump.md', docs)).toBe(project.path);
  });

  it('Area-Slug loest auf die Area-Datei auf', () => {
    expect(resolveLink('gesundheit', 'inbox/dump.md', docs)).toBe(area.path);
  });
});

describe('resolveLink: Rule 4 — eindeutiger Dateiname', () => {
  it('ein einzelner Treffer auf den Dateinamen-Stamm loest auf', () => {
    const docs = [makeDoc({ path: 'notes/unique-name.md', docType: 'note' })];
    expect(resolveLink('unique-name', 'inbox/dump.md', docs)).toBe('notes/unique-name.md');
  });

  it('mehrdeutiger Dateiname loest auf null auf, statt zu raten', () => {
    const docs = [
      makeDoc({ path: 'notes/duplicate.md', docType: 'note' }),
      makeDoc({ path: 'archive/duplicate.md', docType: 'note' }),
    ];
    expect(resolveLink('duplicate', 'inbox/dump.md', docs)).toBeNull();
  });

  it('ein Ziel, das gar nichts trifft, ist null', () => {
    const docs = [makeDoc({ path: 'notes/plan.md', docType: 'note' })];
    expect(resolveLink('does-not-exist-anywhere', 'inbox/dump.md', docs)).toBeNull();
  });
});
