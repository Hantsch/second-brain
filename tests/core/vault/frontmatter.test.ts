import { describe, expect, it } from 'vitest';
import { mergeFrontmatter, parse, serialize, splitFrontmatterBlock } from '@core/vault/frontmatter';

const PROJECT = [
  '---',
  'type: project',
  'title: Nyota Auth0 Migration',
  'created: 2026-06-12',
  'deadline: 2026-09-01',
  'started: 2026-06-12T08:00:00+02:00',
  'tags: [auth0, infrastruktur]',
  'waiting_on:',
  '  - who: Stefan',
  '    what: Freigabe des Rollenkonzepts',
  '    since: 2026-08-04',
  '---',
  '',
  '## Stand',
  '',
  'Wo das Projekt steht.',
  '',
].join('\n');

describe('parse', () => {
  it('trennt Frontmatter und Rumpf', () => {
    const parsed = parse(PROJECT);
    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.warning).toBeUndefined();
    expect(parsed.frontmatter['title']).toBe('Nyota Auth0 Migration');
    expect(parsed.body.trim()).toBe('## Stand\n\nWo das Projekt steht.');
  });

  it('macht aus Datumsfeldern keine Date-Objekte', () => {
    const parsed = parse(PROJECT);
    expect(typeof parsed.frontmatter['created']).toBe('string');
    expect(parsed.frontmatter['created']).toBe('2026-06-12');
    expect(typeof parsed.frontmatter['started']).toBe('string');
    expect(parsed.frontmatter['started']).toBe('2026-06-12T08:00:00+02:00');
    const waiting = parsed.frontmatter['waiting_on'] as { since: unknown }[];
    expect(typeof waiting[0]?.since).toBe('string');
  });

  it('behandelt Werte nach YAML-1.2-Kernschema', () => {
    const parsed = parse('---\nmood: 3\naktiv: yes\nleer: null\nja: true\n---\n\nText\n');
    expect(parsed.frontmatter['mood']).toBe(3);
    expect(parsed.frontmatter['aktiv']).toBe('yes');
    expect(parsed.frontmatter['leer']).toBeNull();
    expect(parsed.frontmatter['ja']).toBe(true);
  });

  it('wirft bei fehlendem Frontmatter nicht, sondern warnt', () => {
    const parsed = parse('# Nur Markdown\n\nText.\n');
    expect(parsed.hadFrontmatter).toBe(false);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.warning).toMatch(/Kein Frontmatter/);
    expect(parsed.body).toBe('# Nur Markdown\n\nText.\n');
  });

  it('wirft bei kaputtem YAML nicht, sondern warnt und bewahrt den Rohtext', () => {
    const broken = '---\ntitle: [offen\nfoo: : bar\n---\n\nText.\n';
    const parsed = parse(broken);
    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.warning).toMatch(/YAML/);
    expect(parsed.rawFrontmatter).toContain('title: [offen');
    expect(parsed.body.trim()).toBe('Text.');
  });

  it('warnt, wenn der Block nicht geschlossen ist', () => {
    const parsed = parse('---\ntype: dump\n\nText ohne Ende\n');
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.warning).toMatch(/abschliessende/);
  });

  it('vertraegt ein BOM am Dateianfang', () => {
    const parsed = parse('\uFEFF---\ntype: dump\n---\n\nText\n');
    expect(parsed.frontmatter['type']).toBe('dump');
  });
});

describe('serialize', () => {
  it('schreibt Frontmatter, Leerzeile, Rumpf', () => {
    const text = serialize({ type: 'dump', title: 'Gedanke', tags: [] }, 'Roher Text.');
    expect(text).toBe('---\ntype: dump\ntitle: Gedanke\ntags: []\n---\n\nRoher Text.\n');
  });

  it('haelt Datumsstrings unquotiert und schreibt kein Date', () => {
    const text = serialize({ created: '2026-08-10T14:32:11+02:00', date: '2026-08-10' }, 'x');
    expect(text).toContain('created: 2026-08-10T14:32:11+02:00');
    expect(text).toContain('date: 2026-08-10');
  });

  it('bricht lange Werte nicht um', () => {
    const long = `Rueckmeldung von Stefan zur Rollenzuordnung einarbeiten ${'und weiter '.repeat(12)}`;
    const text = serialize({ next_step: long }, 'x');
    const line = text.split('\n').find((candidate) => candidate.startsWith('next_step:')) ?? '';
    expect(line).toContain('und weiter und weiter');
  });

  it('erzeugt ohne Felder keinen leeren Block', () => {
    expect(serialize({}, '## [2026-08-10] ingest')).toBe('## [2026-08-10] ingest\n');
  });

  it('ist mit parse eine Runde', () => {
    const round = parse(serialize(parse(PROJECT).frontmatter, parse(PROJECT).body));
    expect(round.frontmatter).toEqual(parse(PROJECT).frontmatter);
    expect(round.body.trim()).toBe(parse(PROJECT).body.trim());
  });
});

describe('mergeFrontmatter', () => {
  it('erhaelt unbekannte Felder und die Reihenfolge', () => {
    const existing = {
      type: 'project',
      title: 'Nyota',
      obsidian_kanban: true,
      cssclass: 'breit',
    };
    const merged = mergeFrontmatter(existing, { title: 'Nyota Auth0', status: 'active' });
    expect(Object.keys(merged)).toEqual(['type', 'title', 'obsidian_kanban', 'cssclass', 'status']);
    expect(merged['title']).toBe('Nyota Auth0');
    expect(merged['obsidian_kanban']).toBe(true);
  });

  it('laesst undefined das Feld unberuehrt und setzt null ausdruecklich', () => {
    const merged = mergeFrontmatter(
      { title: 'Nyota', deadline: '2026-09-01', scope: 'work' },
      { title: undefined, deadline: null },
    );
    expect(merged['title']).toBe('Nyota');
    expect(merged['deadline']).toBeNull();
    expect(merged['scope']).toBe('work');
  });

  it('ersetzt Arrays und Objekte als Ganzes', () => {
    const merged = mergeFrontmatter({ tags: ['a', 'b'] }, { tags: ['c'] });
    expect(merged['tags']).toEqual(['c']);
  });

  it('veraendert die Eingaben nicht', () => {
    const existing = { title: 'Nyota' };
    mergeFrontmatter(existing, { title: 'Anders' });
    expect(existing.title).toBe('Nyota');
  });
});

describe('splitFrontmatterBlock', () => {
  it('gibt den Block wortwoertlich zurueck', () => {
    const split = splitFrontmatterBlock(PROJECT);
    expect(split.prefix.startsWith('---\ntype: project')).toBe(true);
    expect(split.prefix.endsWith('---\n')).toBe(true);
    expect(split.body.trim()).toBe('## Stand\n\nWo das Projekt steht.');
    expect(`${split.prefix}${split.body}`).toBe(PROJECT);
  });

  it('laesst Dateien ohne Frontmatter unangetastet', () => {
    const split = splitFrontmatterBlock('## Log\n\n- eins\n');
    expect(split.prefix).toBe('');
    expect(split.body).toBe('## Log\n\n- eins\n');
  });
});
