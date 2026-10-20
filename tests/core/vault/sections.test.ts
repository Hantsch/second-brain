import { describe, expect, it } from 'vitest';
import { appendToSection, findSection, findSections, sectionMap } from '@core/vault/sections';

const DOC = [
  '---',
  'type: project',
  'title: Nyota',
  '---',
  '',
  '## Stand',
  '',
  'Rollenkonzept liegt bei Stefan.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren',
  '',
  '## Notizen',
  '',
  '### 2026-08-01',
  '',
  'Erster Testmandant steht.',
  '',
].join('\n');

describe('findSections', () => {
  it('findet Ueberschriften und ihre Grenzen', () => {
    const sections = findSections(DOC, 2).map((range) => range.heading);
    expect(sections).toEqual(['Stand', 'Todos', 'Notizen']);
    expect(findSection(DOC, 'todos')?.level).toBe(2);
    expect(findSection(DOC, 'Gibt es nicht')).toBeNull();
  });

  it('haelt Unterabschnitte im Elternabschnitt', () => {
    expect(sectionMap(DOC).get('Notizen')).toBe('### 2026-08-01\n\nErster Testmandant steht.');
    expect(sectionMap(DOC).get('Stand')).toBe('Rollenkonzept liegt bei Stefan.');
  });

  it('ignoriert Ueberschriften in Code-Zaeunen', () => {
    const withCode = ['## Stand', '', '```md', '## Kein Abschnitt', '```', '', 'Text.'].join('\n');
    expect(findSections(withCode, 2).map((range) => range.heading)).toEqual(['Stand']);
  });

  it('fasst gleichnamige Abschnitte zusammen', () => {
    const twice = ['## Log', '', 'eins', '', '## Log', '', 'zwei'].join('\n');
    expect(sectionMap(twice).get('Log')).toBe('eins\n\nzwei');
  });
});

describe('appendToSection', () => {
  it('haengt in einen bestehenden Abschnitt an, ohne die folgenden zu verschieben', () => {
    const result = appendToSection(DOC, 'Todos', '- [ ] Testmandant aufsetzen');
    expect(result.sectionCreated).toBe(false);
    expect(result.content).toBe(
      [
        '---',
        'type: project',
        'title: Nyota',
        '---',
        '',
        '## Stand',
        '',
        'Rollenkonzept liegt bei Stefan.',
        '',
        '## Todos',
        '',
        '- [ ] Rollen-Mapping dokumentieren',
        '- [ ] Testmandant aufsetzen',
        '',
        '## Notizen',
        '',
        '### 2026-08-01',
        '',
        'Erster Testmandant steht.',
        '',
      ].join('\n'),
    );
  });

  it('setzt vor Prosa eine Leerzeile', () => {
    const result = appendToSection(DOC, 'Stand', 'Freigabe kam am 10.08.');
    expect(result.content).toContain(
      'Rollenkonzept liegt bei Stefan.\n\nFreigabe kam am 10.08.\n\n## Todos',
    );
  });

  it('legt einen fehlenden Abschnitt am Dateiende an', () => {
    const result = appendToSection(DOC, 'Warte auf', '- Stefan: Rollenkonzept');
    expect(result.sectionCreated).toBe(true);
    expect(result.content.endsWith('## Warte auf\n\n- Stefan: Rollenkonzept\n')).toBe(true);
    expect(result.content).toContain('## Notizen');
  });

  it('haengt in den letzten Abschnitt an, ohne Leerzeilen zu haeufen', () => {
    const result = appendToSection(DOC, 'Notizen', '### 2026-08-10\n\nText des Dumps.');
    expect(
      result.content.endsWith('Erster Testmandant steht.\n\n### 2026-08-10\n\nText des Dumps.\n'),
    ).toBe(true);
  });

  it('nimmt den Abschnitt ohne Ruecksicht auf Gross-/Kleinschreibung', () => {
    expect(appendToSection(DOC, 'TODOS', '- [ ] x').sectionCreated).toBe(false);
  });

  it('laesst leeren Text die Datei nicht anfassen', () => {
    expect(appendToSection(DOC, 'Todos', '   \n\n').content).toBe(DOC);
  });

  it('arbeitet auch in Dateien ohne Frontmatter', () => {
    const log = ['## [2026-08-09] ingest', '', '- summary: eins', ''].join('\n');
    const result = appendToSection(log, '[2026-08-09] ingest', '- touched: index.md');
    expect(result.content).toBe(
      ['## [2026-08-09] ingest', '', '- summary: eins', '- touched: index.md', ''].join('\n'),
    );
  });
});
