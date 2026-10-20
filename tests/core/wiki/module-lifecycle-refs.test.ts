/* Pure rewriters for a module rename/delete. Each one takes content and returns the
 * rewritten form (or `null`/unchanged when there is nothing to do) — no store, no
 * index, nothing to fake. `retargetModuleLinks` is measured against the same three
 * cases discard's `repointLine` is: it must retarget a qualified link, and it must
 * leave a same-module link, a foreign-module link, and any surrounding text alone. */

import { describe, expect, it } from 'vitest';
import { serialize } from '@core/vault/frontmatter';
import { VaultFrontmatterError } from '@core/vault/types';
import {
  findModuleLinks,
  retargetDumpFiledInto,
  retargetHeadlineTitle,
  retargetIngestModules,
  retargetModuleFile,
  retargetModuleLinks,
  retargetModulePaths,
  retargetOverviewTitle,
  retargetPageModule,
  retargetProjectModules,
  retargetSlugList,
  withFrontmatterPatch,
} from '@core/wiki';

describe('retargetModuleLinks', () => {
  it('biegt einen qualifizierten Link auf das neue Modul um', () => {
    const body = 'Siehe [[alt/seite]] fuer Details.';
    expect(retargetModuleLinks(body, 'alt', 'neu')).toBe('Siehe [[neu/seite]] fuer Details.');
  });

  it('behaelt das Label eines qualifizierten Links', () => {
    const body = 'Siehe [[alt/seite|die alte Fassung]] fuer Details.';
    expect(retargetModuleLinks(body, 'alt', 'neu')).toBe(
      'Siehe [[neu/seite|die alte Fassung]] fuer Details.',
    );
  });

  it('laesst einen Link auf ein fremdes Modul unangetastet', () => {
    const body = 'Siehe [[andere/seite]].';
    expect(retargetModuleLinks(body, 'alt', 'neu')).toBe(body);
  });

  it('laesst einen nackten Link unangetastet — er zeigt innerhalb seines eigenen Moduls', () => {
    const body = 'Siehe [[seite]].';
    expect(retargetModuleLinks(body, 'alt', 'neu')).toBe(body);
  });

  it('ruehrt den Text rund um den Link nicht an', () => {
    const body = 'Vorher [[alt/seite]] nachher, und noch [[alt/zweite|Text]] mehr.';
    expect(retargetModuleLinks(body, 'alt', 'neu')).toBe(
      'Vorher [[neu/seite]] nachher, und noch [[neu/zweite|Text]] mehr.',
    );
  });

  it('biegt mehrere Links in derselben Zeile um, andere Module bleiben stehen', () => {
    const body = '[[alt/a]] und [[andere/a]] und [[alt/b|B]] und [[a]].';
    expect(retargetModuleLinks(body, 'alt', 'neu')).toBe(
      '[[neu/a]] und [[andere/a]] und [[neu/b|B]] und [[a]].',
    );
  });
});

describe('findModuleLinks', () => {
  it('findet nur qualifizierte Treffer auf das gesuchte Modul', () => {
    const body = [
      '[[alt/a]] hier.',
      'Ein nackter [[a]] und ein fremder [[andere/a]].',
      '[[alt/b|B]]',
    ].join('\n');
    const hits = findModuleLinks(body, 'alt');
    expect(hits.map((hit) => hit.target)).toEqual(['alt/a', 'alt/b']);
    expect(hits[0]?.line).toBe('[[alt/a]] hier.');
  });

  it('liefert eine leere Liste ohne Treffer', () => {
    expect(findModuleLinks('Nur Text, kein Link.', 'alt')).toEqual([]);
  });
});

describe('withFrontmatterPatch', () => {
  it('mergt Felder, ohne unbekannte zu verlieren', () => {
    const content = serialize({ type: 'note', custom: 'bleibt' }, 'Text.\n');
    const patched = withFrontmatterPatch('modules/alt/page.md', content, { title: 'Neu' });
    expect(patched).toContain('title: Neu');
    expect(patched).toContain('custom: bleibt');
    expect(patched).toContain('Text.');
  });

  it('wirft VaultFrontmatterError statt Frontmatter still zu verwerfen, wenn das YAML kaputt ist', () => {
    // Kein abschliessendes "---": `parse` liefert `rawFrontmatter` statt eines Baums.
    const content = ['---', 'type: note', 'title: [kaputt', '', 'Text.', ''].join('\n');
    expect(() => withFrontmatterPatch('modules/alt/page.md', content, { title: 'Neu' })).toThrow(
      VaultFrontmatterError,
    );
  });

  it('behaelt Kommentare, Flow-Listen und Anfuehrungszeichen, wenn nur ein Feld gepatcht wird', () => {
    const content = [
      '---',
      'type: page',
      '# Kommentar bleibt stehen',
      "tags: ['a', 'b']",
      'module: alt',
      '---',
      '',
      'Text.',
      '',
    ].join('\n');
    const patched = withFrontmatterPatch('modules/alt/page.md', content, { module: 'neu' });
    expect(patched).toContain('# Kommentar bleibt stehen');
    expect(patched).toContain("tags: ['a', 'b']");
    expect(patched).toContain('module: neu');
  });
});

describe('retargetModuleFile', () => {
  it('setzt Titel, Slug und Modul auf die neuen Werte', () => {
    const content = serialize(
      { type: 'note', title: 'Alt', slug: 'alt', module: 'alt', description: 'Testmodul' },
      'Beschreibung.\n',
    );
    const next = retargetModuleFile('modules/alt/module.md', content, 'neu', 'Neu');
    expect(next).toContain('title: Neu');
    expect(next).toContain('slug: neu');
    expect(next).toContain('module: neu');
    expect(next).toContain('description: Testmodul');
  });
});

describe('retargetPageModule', () => {
  it('setzt nur das module-Feld, der Rest bleibt stehen', () => {
    const content = serialize(
      { type: 'concept', title: 'A', module: 'alt', tags: ['x'] },
      'Inhalt.\n',
    );
    const next = retargetPageModule('modules/alt/wiki/a.md', content, 'neu');
    expect(next).toContain('module: neu');
    expect(next).toContain('title: A');
    expect(next).toContain('tags:');
  });
});

describe('retargetOverviewTitle', () => {
  it('ersetzt den alten Titel als Praefix und behaelt den Rest', () => {
    const content = serialize(
      { type: 'overview', title: 'Alt — Synthese', module: 'alt' },
      'Text.\n',
    );
    const next = retargetOverviewTitle('modules/alt/wiki/overview.md', content, 'Alt', 'Neu');
    expect(next).not.toBeNull();
    expect(next).toContain('title: Neu — Synthese');
  });

  it('laesst einen von Hand geaenderten Titel unberuehrt', () => {
    const content = serialize(
      { type: 'overview', title: 'Ganz anderer Titel', module: 'alt' },
      'Text.\n',
    );
    expect(retargetOverviewTitle('modules/alt/wiki/overview.md', content, 'Alt', 'Neu')).toBeNull();
  });

  it('laesst eine Wort-Praefix-Kollision unberuehrt (Produkt vs. Produktwissen)', () => {
    const content = serialize(
      { type: 'overview', title: 'Produktwissen — Sonstiges', module: 'produkt' },
      'Text.\n',
    );
    expect(
      retargetOverviewTitle('modules/produkt/wiki/overview.md', content, 'Produkt', 'Angebot'),
    ).toBeNull();
  });

  it('erkennt das echte "<oldTitle> — <label>"-Muster weiterhin', () => {
    const content = serialize(
      { type: 'overview', title: 'Produkt — Synthese', module: 'produkt' },
      'Text.\n',
    );
    const next = retargetOverviewTitle(
      'modules/produkt/wiki/overview.md',
      content,
      'Produkt',
      'Angebot',
    );
    expect(next).not.toBeNull();
    expect(next).toContain('title: Angebot — Synthese');
  });
});

describe('retargetHeadlineTitle', () => {
  it('ersetzt die AGENTS.md-Kopfzeile mit Doppelpunkt-Trenner', () => {
    const content = '# Wissens-Modul: Alt\n\nRest.\n';
    expect(retargetHeadlineTitle(content, 'Alt', 'Neu', ':')).toBe(
      '# Wissens-Modul: Neu\n\nRest.\n',
    );
  });

  it('ersetzt die Katalog-Kopfzeile mit Gedankenstrich-Trenner', () => {
    const content = '# Katalog — Alt\n\n- [[a]] — Seite\n';
    expect(retargetHeadlineTitle(content, 'Alt', 'Neu', '—')).toBe(
      '# Katalog — Neu\n\n- [[a]] — Seite\n',
    );
  });

  it('laesst eine von Hand geaenderte Kopfzeile stehen', () => {
    const content = '# Katalog — Ganz anders\n';
    expect(retargetHeadlineTitle(content, 'Alt', 'Neu', '—')).toBe(content);
  });

  it('behandelt $& im neuen Titel als literalen Text, nicht als Ersetzungsmuster', () => {
    const content = '# Wissens-Modul: Alt\n\nRest.\n';
    expect(retargetHeadlineTitle(content, 'Alt', 'Neu $& Co', ':')).toBe(
      '# Wissens-Modul: Neu $& Co\n\nRest.\n',
    );
  });

  it('behandelt $$ im neuen Titel als literalen Text, nicht als Ersetzungsmuster', () => {
    const content = '# Katalog — Alt\n';
    expect(retargetHeadlineTitle(content, 'Alt', 'Neu $$', '—')).toBe('# Katalog — Neu $$\n');
  });
});

describe('retargetModulePaths', () => {
  it('ersetzt modules/<alt> ueberall, aber nicht als Praefix eines anderen Slugs', () => {
    const content = 'modules/alt/wiki/ und modules/alt/AGENTS.md, aber nicht modules/alt-zwei/x.md';
    expect(retargetModulePaths(content, 'alt', 'neu')).toBe(
      'modules/neu/wiki/ und modules/neu/AGENTS.md, aber nicht modules/alt-zwei/x.md',
    );
  });

  it('ist ein no-op, wenn sich der Slug nicht aendert', () => {
    const content = 'modules/alt/wiki/';
    expect(retargetModulePaths(content, 'alt', 'alt')).toBe(content);
  });
});

describe('retargetSlugList', () => {
  it('ersetzt einen Eintrag beim Umbenennen', () => {
    expect(retargetSlugList(['alt', 'anderes'], { from: 'alt', to: 'neu' })).toEqual([
      'neu',
      'anderes',
    ]);
  });

  it('entfernt einen Eintrag beim Loeschen (to: null)', () => {
    expect(retargetSlugList(['alt', 'anderes'], { from: 'alt', to: null })).toEqual(['anderes']);
  });

  it('liefert null, wenn die Liste den Slug gar nicht enthaelt', () => {
    expect(retargetSlugList(['anderes'], { from: 'alt', to: 'neu' })).toBeNull();
  });

  it('liefert null bei einer Umbenennung auf sich selbst (Titel-only)', () => {
    expect(retargetSlugList(['alt'], { from: 'alt', to: 'alt' })).toBeNull();
  });

  it('dedupliziert, wenn das Ziel schon in der Liste steht', () => {
    expect(retargetSlugList(['alt', 'neu'], { from: 'alt', to: 'neu' })).toEqual(['neu']);
  });
});

describe('retargetProjectModules', () => {
  it('ersetzt den Slug in modules: beim Umbenennen', () => {
    const content = serialize({ type: 'project', title: 'P', modules: ['alt', 'x'] }, 'Text.\n');
    const next = retargetProjectModules('projects/p.md', content, { from: 'alt', to: 'neu' });
    expect(next).toContain('modules:');
    expect(next).toContain('- neu');
    expect(next).not.toContain('alt');
  });

  it('entfernt den Slug beim Loeschen', () => {
    const content = serialize({ type: 'project', title: 'P', modules: ['alt', 'x'] }, 'Text.\n');
    const next = retargetProjectModules('projects/p.md', content, { from: 'alt', to: null });
    expect(next).toContain('- x');
    expect(next).not.toContain('alt');
  });

  it('liefert null, wenn das Projekt das Modul gar nicht kennt', () => {
    const content = serialize({ type: 'project', title: 'P', modules: ['anderes'] }, 'Text.\n');
    expect(retargetProjectModules('projects/p.md', content, { from: 'alt', to: 'neu' })).toBeNull();
  });
});

describe('retargetDumpFiledInto', () => {
  it('verschiebt den Modul-Teil des Pfads', () => {
    const content = serialize(
      { type: 'dump', title: 'D', filed_into: 'modules/alt/wiki/concepts/a.md' },
      'Text.\n',
    );
    const next = retargetDumpFiledInto('dumps/d.md', content, 'alt', 'neu');
    expect(next).toContain('filed_into: modules/neu/wiki/concepts/a.md');
  });

  it('liefert null, wenn die Quittung in ein anderes Modul zeigt', () => {
    const content = serialize(
      { type: 'dump', title: 'D', filed_into: 'modules/anderes/wiki/concepts/a.md' },
      'Text.\n',
    );
    expect(retargetDumpFiledInto('dumps/d.md', content, 'alt', 'neu')).toBeNull();
  });

  it('liefert null bei einem Titel-only-Umbenennen (from === to)', () => {
    const content = serialize(
      { type: 'dump', title: 'D', filed_into: 'modules/alt/wiki/concepts/a.md' },
      'Text.\n',
    );
    expect(retargetDumpFiledInto('dumps/d.md', content, 'alt', 'alt')).toBeNull();
  });
});

describe('retargetIngestModules', () => {
  const protocol = (modules: string[]): string =>
    JSON.stringify({ kind: 'url', modules, sourcePage: 's-2026-01-01-x' }, null, 2);

  it('ersetzt den Slug beim Umbenennen, sourcePage bleibt stehen', () => {
    const result = retargetIngestModules(protocol(['alt', 'zwei']), { from: 'alt', to: 'neu' });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result?.content ?? '{}') as { modules: string[]; sourcePage: string };
    expect(parsed.modules).toEqual(['neu', 'zwei']);
    expect(parsed.sourcePage).toBe('s-2026-01-01-x');
    expect(result?.emptied).toBe(false);
  });

  it('entfernt den Slug und setzt sourcePage auf null, wenn die Liste leer wird', () => {
    const result = retargetIngestModules(protocol(['alt']), { from: 'alt', to: null });
    expect(result?.emptied).toBe(true);
    const parsed = JSON.parse(result?.content ?? '{}') as {
      modules: string[];
      sourcePage: unknown;
    };
    expect(parsed.modules).toEqual([]);
    expect(parsed.sourcePage).toBeNull();
  });

  it('behaelt sourcePage, wenn ein anderes Modul die Quelle weiter digested', () => {
    const result = retargetIngestModules(protocol(['alt', 'zwei']), { from: 'alt', to: null });
    expect(result?.emptied).toBe(false);
    const parsed = JSON.parse(result?.content ?? '{}') as { modules: string[]; sourcePage: string };
    expect(parsed.modules).toEqual(['zwei']);
    expect(parsed.sourcePage).toBe('s-2026-01-01-x');
  });

  it('liefert null bei kaputtem JSON', () => {
    expect(retargetIngestModules('{ nicht json', { from: 'alt', to: 'neu' })).toBeNull();
  });

  it('liefert null, wenn das Protokoll das Modul gar nicht nennt', () => {
    expect(retargetIngestModules(protocol(['anderes']), { from: 'alt', to: 'neu' })).toBeNull();
  });
});
