import { describe, expect, it } from 'vitest';
import { MemoryVaultStore } from '@core/vault/memory-store';
import {
  excerpt,
  extractSections,
  readDoc,
  slugFor,
  titleFor,
  toVaultDoc,
  wordCount,
} from '@core/vault/doc';
import { sha256 } from '@core/vault/hash';
import type { ProjectFrontmatter } from '@shared/types';

const CONTENT = [
  '---',
  'type: project',
  'title: Nyota Auth0 Migration',
  'slug: nyota-auth0-migration',
  '---',
  '',
  '## Stand',
  '',
  'Die Migration laeuft seit Juni. Das Rollenkonzept liegt bei Stefan',
  'und blockiert den Testmandanten.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren',
  '',
].join('\n');

describe('toVaultDoc', () => {
  it('haengt Hash und Groesse an den vollen Dateiinhalt', () => {
    const doc = toVaultDoc('projects/work/nyota/project.md', CONTENT, {
      modified: '2026-08-10T12:00:00.000Z',
    });
    expect(doc.hash).toBe(sha256(CONTENT));
    expect(doc.size).toBe(Buffer.byteLength(CONTENT, 'utf8'));
    expect(doc.frontmatter.title).toBe('Nyota Auth0 Migration');
    expect(doc.body.trim().startsWith('## Stand')).toBe(true);
  });
});

describe('readDoc', () => {
  it('liest ein Dokument mit erwartetem Frontmatter-Typ', async () => {
    const store = new MemoryVaultStore({ files: { 'projects/work/nyota/project.md': CONTENT } });
    const doc = await readDoc<ProjectFrontmatter>(store, 'projects/work/nyota/project.md');
    expect(doc?.frontmatter.slug).toBe('nyota-auth0-migration');
    expect(await readDoc(store, 'projects/work/fehlt/project.md')).toBeNull();
  });
});

describe('excerpt', () => {
  it('nimmt den ersten echten Absatz, keine Ueberschrift', () => {
    expect(excerpt(CONTENT)).toBe(
      'Die Migration laeuft seit Juni. Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten.',
    );
  });

  it('raeumt Wikilinks, Links und Belege weg', () => {
    const body = [
      '## Begriff',
      '',
      'Rollen erben Rechte (source: [[s-2026-07-02-auth0-rbac-guide]]).',
      'Siehe [[identity-management/auth0|Auth0]] und [die Doku](https://example.com).',
    ].join('\n');
    expect(excerpt(body)).toBe('Rollen erben Rechte. Siehe Auth0 und die Doku.');
  });

  it('kuerzt an einer Wortgrenze', () => {
    const long = `## Stand\n\n${'wort '.repeat(80)}`;
    const short = excerpt(long, 40);
    expect(short.length).toBeLessThanOrEqual(41);
    expect(short.endsWith('…')).toBe(true);
  });

  it('nimmt die erste Zeile, wenn es keine Prosa gibt', () => {
    const log = ['## [2026-08-10] ingest', '- summary: wiki/sources/s-x.md'].join('\n');
    expect(excerpt(log)).toBe('summary: wiki/sources/s-x.md');
  });

  it('bleibt bei leerem Rumpf leer', () => {
    expect(excerpt('')).toBe('');
    expect(excerpt('---\ntype: dump\n---\n')).toBe('');
  });
});

describe('wordCount', () => {
  it('zaehlt Woerter ohne Frontmatter und ohne Code', () => {
    expect(wordCount('---\ntitle: X\n---\n\nEins zwei drei.\n')).toBe(3);
    expect(wordCount('Eins\n\n```ts\nconst a = 1;\n```\n\nzwei')).toBe(2);
    expect(wordCount('')).toBe(0);
  });
});

describe('extractSections', () => {
  it('gibt Abschnitt auf Text ab', () => {
    const sections = extractSections(CONTENT);
    expect([...sections.keys()]).toEqual(['Stand', 'Todos']);
    expect(sections.get('Todos')).toBe('- [ ] Rollen-Mapping dokumentieren');
  });
});

describe('titleFor / slugFor', () => {
  it('nimmt das Frontmatter, sonst den Dateinamen', () => {
    expect(titleFor('inbox/a.md', { title: 'Gedanke' })).toBe('Gedanke');
    expect(titleFor('inbox/2026-08-10-1432-kurzer-gedanke.md', {})).toBe(
      '2026 08 10 1432 kurzer gedanke',
    );
    expect(slugFor('projects/work/nyota/project.md', { slug: 'Nyota Auth0' })).toBe('nyota-auth0');
    expect(slugFor('areas/Gesundheit.md', {})).toBe('gesundheit');
  });
});
