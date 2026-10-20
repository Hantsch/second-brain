/* Der Stil des Nutzers gehoert dem Nutzer.
 *
 * Diese Tests messen genau eine Sache: wie viele Zeilen sich aendern, wenn die
 * App ein Feld setzt. Vorher wurde beim Serialisieren neu erzeugt, und aus
 * `tags: [auth, migration]` wurde eine Blockliste ueber vier Zeilen — obwohl nur
 * `waiting_on[0].resolved` gesetzt werden sollte. */

import { describe, expect, it } from 'vitest';
import { composeContent } from '@core/vault/compose';
import { mergeFrontmatter, parse } from '@core/vault/frontmatter';
import { canonicalOrder } from '@core/vault/frontmatter-order';
import { patchFrontmatterYaml } from '@core/vault/frontmatter-patch';
import type { Frontmatter } from '@core/vault/frontmatter';

const FLOW = [
  '---',
  'type: project',
  'title: Nyota Auth0 Migration',
  'slug: nyota-auth0-migration',
  'scope: work',
  'status: active',
  'priority: 2',
  'started: 2026-06-12',
  'deadline: 2026-09-01',
  '# Repos zeigen auf die Arbeitskopien',
  'tags: [auth, migration]',
  "repos: ['C:/development/AIDU/Nyota-Auth0-Infrastructure']",
  'waiting_on:',
  '  - who: Stefan',
  '    what: Freigabe des Rollenkonzepts',
  '    since: 2026-08-04',
  '    resolved: false',
  '---',
  '',
  '## Stand',
  '',
  'Text.',
  '',
].join('\n');

/**
 * Die Zeilen, die sich zwischen zwei Fassungen unterscheiden — als Menge mit
 * Vielfachheit, nicht nach Position: eine eingefuegte Zeile verschiebt sonst
 * jede folgende und der Diff waere so lang wie die Datei.
 */
function diffLines(before: string, after: string): { removed: string[]; added: string[] } {
  const take = (lines: readonly string[], other: readonly string[]): string[] => {
    const rest = [...other];
    const only: string[] = [];
    for (const line of lines) {
      const at = rest.indexOf(line);
      if (at < 0) only.push(line);
      else rest.splice(at, 1);
    }
    return only;
  };
  const a = before.split('\n');
  const b = after.split('\n');
  return { removed: take(a, b), added: take(b, a) };
}

function write(existing: string, frontmatter: Frontmatter): string {
  return composeContent('projects/work/nyota/project.md', existing, {
    path: 'projects/work/nyota/project.md',
    frontmatter,
  });
}

describe('composeContent: Stil je Schluessel erhalten', () => {
  it('aendert beim Aufloesen eines Warte-auf genau eine Zeile', () => {
    const waiting = parse(FLOW).frontmatter['waiting_on'] as Record<string, unknown>[];
    const next = waiting.map((entry) => ({ ...entry, resolved: true }));

    const after = write(FLOW, { waiting_on: next });
    const diff = diffLines(FLOW, after);

    expect(diff.removed).toEqual(['    resolved: false']);
    expect(diff.added).toEqual(['    resolved: true']);
  });

  it('laesst Flow-Listen, Anfuehrungszeichen und Kommentare stehen', () => {
    const after = write(FLOW, { status: 'waiting' });

    expect(after).toContain('tags: [auth, migration]');
    expect(after).toContain("repos: ['C:/development/AIDU/Nyota-Auth0-Infrastructure']");
    expect(after).toContain('# Repos zeigen auf die Arbeitskopien');
    expect(diffLines(FLOW, after).added).toEqual(['status: waiting']);
  });

  it('setzt ein erstmaliges next_step an seine kanonische Stelle', () => {
    const after = write(FLOW, { next_step: 'Rollen-Mapping dokumentieren' });
    const keys = Object.keys(parse(after).frontmatter);

    expect(keys.indexOf('next_step')).toBe(keys.indexOf('deadline') + 1);
    expect(keys.indexOf('next_step')).toBeLessThan(keys.indexOf('tags'));
    expect(diffLines(FLOW, after).removed).toEqual([]);
  });

  it('setzt ein erstmaliges status_set an seine kanonische Stelle', () => {
    const after = write(FLOW, {
      next_step: 'Rollen-Mapping dokumentieren',
      status_set: { at: '2026-08-11', by: 'user' },
    });
    const keys = Object.keys(parse(after).frontmatter);

    expect(keys.indexOf('status_set')).toBeGreaterThan(keys.indexOf('next_step'));
    expect(keys.indexOf('status_set')).toBeLessThan(keys.indexOf('tags'));
  });

  it('behaelt vierer-Einrueckung und Listen ohne Einrueckung', () => {
    const odd = [
      '---',
      'type: project',
      'title: Nyota',
      'waiting_on:',
      '- who: Stefan',
      '  what: Freigabe',
      '  resolved: false',
      '---',
      '',
      'Text.',
      '',
    ].join('\n');
    const after = write(odd, { status: 'active' });

    expect(after).toContain('waiting_on:\n- who: Stefan');
    expect(diffLines(odd, after).added).toEqual(['status: active']);
  });

  it('haelt gepolsterte Flow-Listen gepolstert', () => {
    const padded = '---\ntype: project\ntags: [ auth, migration ]\n---\n\nText.\n';
    const after = write(padded, { status: 'active' });
    expect(after).toContain('tags: [ auth, migration ]');
  });

  it('ergibt denselben Inhalt wie ein Merge — nur anders geschrieben', () => {
    const patch: Frontmatter = {
      status: 'paused',
      next_step: 'Warten auf Stefan',
      tags: ['auth', 'migration', 'rollen'],
      updated: '2026-08-11',
    };
    const after = parse(write(FLOW, patch));
    expect(after.frontmatter).toEqual(mergeFrontmatter(parse(FLOW).frontmatter, patch));
  });

  it('ersetzt Objekte als Ganzes: was der neue Wert nicht nennt, ist weg', () => {
    const after = write(FLOW, { waiting_on: [{ who: 'Anna', what: 'Antwort' }] });
    const waiting = parse(after).frontmatter['waiting_on'] as Record<string, unknown>[];
    expect(waiting).toEqual([{ who: 'Anna', what: 'Antwort' }]);
    expect(after).not.toContain('resolved');
  });

  it('kuerzt eine Liste, statt Reste stehen zu lassen', () => {
    const many = '---\ntype: project\nrepos: [a, b, c]\n---\n\nText.\n';
    const after = write(many, { repos: ['a'] });
    expect(parse(after).frontmatter['repos']).toEqual(['a']);
  });

  it('verlaengert eine Liste um neue Eintraege', () => {
    const after = write(FLOW, {
      repos: ['C:/development/AIDU/Nyota-Auth0-Infrastructure', 'C:/development/AIDU/Zweitrepo'],
    });
    expect(parse(after).frontmatter['repos']).toEqual([
      'C:/development/AIDU/Nyota-Auth0-Infrastructure',
      'C:/development/AIDU/Zweitrepo',
    ]);
    /* Und in derselben Schreibweise wie sein Nachbar. Inhaltlich waere ein
       unzitierter Eintrag gleichwertig — aber `repos: ['C:/a', C:/b]` ist eine
       gemischte Zeile, die niemand geschrieben hat. */
    expect(after).toContain("'C:/development/AIDU/Zweitrepo'");
  });

  it('erfindet keine Anfuehrungszeichen, wo keine stehen', () => {
    const plain = '---\ntype: project\ntags: [auth, migration]\n---\n\nText.\n';
    const after = write(plain, { tags: ['auth', 'migration', 'kundenportal'] });
    expect(after).toContain('tags: [auth, migration, kundenportal]');
  });

  it('setzt null ausdruecklich und laesst undefined liegen', () => {
    const after = write(FLOW, { deadline: null, title: undefined });
    const frontmatter = parse(after).frontmatter;
    expect(frontmatter['deadline']).toBeNull();
    expect(frontmatter['title']).toBe('Nyota Auth0 Migration');
  });
});

describe('patchFrontmatterYaml', () => {
  it('gibt null zurueck, wo das Document-Modell nicht greift', () => {
    expect(patchFrontmatterYaml('', { status: 'active' })).toBeNull();
    expect(patchFrontmatterYaml('   \n', { status: 'active' })).toBeNull();
    expect(patchFrontmatterYaml('title: [offen\nfoo: : bar', { status: 'active' })).toBeNull();
    expect(patchFrontmatterYaml('- eins\n- zwei', { status: 'active' })).toBeNull();
  });

  it('haengt ein Feld hinten an, dessen Typ keine Reihenfolge kennt', () => {
    const patched = patchFrontmatterYaml('type: eigenes\ntitle: X\n', { obsidian_kanban: true });
    expect(patched).toBe('type: eigenes\ntitle: X\nobsidian_kanban: true\n');
  });
});

describe('canonicalOrder', () => {
  it('kennt die dokumentierten Typen und raet bei unbekannten nicht', () => {
    expect(canonicalOrder('project')).toContain('next_step');
    expect(canonicalOrder('project')).toContain('status_set');
    expect(canonicalOrder('project')).toContain('next_step_set');
    expect(canonicalOrder('concept')).toContain('sources');
    expect(canonicalOrder('dump')).toContain('origin');
    expect(canonicalOrder('gibtsnicht')).toEqual([]);
    expect(canonicalOrder(undefined)).toEqual([]);
  });
});
