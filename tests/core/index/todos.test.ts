import { describe, expect, it } from 'vitest';
import { areaOfPath, parseTodos, scopeFor, todoId } from '@core/index/todos';
import { toIndexedDoc } from '@core/index/build';
import type { VaultStat } from '@core/vault/types';
import { NYOTA_PROJECT, TODAY } from './fixtures';

const STAT: VaultStat = {
  path: 'projects/work/nyota-auth0-migration/project.md',
  size: NYOTA_PROJECT.length,
  modified: '2026-08-10T09:00:00.000Z',
  dir: false,
};

function nyotaTodos() {
  const doc = toIndexedDoc(STAT.path, NYOTA_PROJECT, STAT);
  return parseTodos(doc.body, {
    path: doc.path,
    frontmatter: doc.frontmatter,
    lineOffset: doc.bodyLine,
    today: TODAY,
  });
}

describe('parseTodos: Marker aus VAULT-FORMAT.md', () => {
  it('liest alle Marker und laesst den Anzeigetext sauber zurueck', () => {
    const todos = nyotaTodos();
    expect(todos.map((todo) => todo.text)).toEqual([
      'Rollen-Mapping dokumentieren',
      'Übersicht der Gruppen prüfen',
      'Terraform-State migriert',
      'Antwort von Auth0 abwarten',
    ]);

    const [mapping, gruppen, terraform, antwort] = todos;
    expect(mapping).toMatchObject({
      state: 'open',
      due: '2026-08-15',
      priority: 2,
      dueInDays: 5,
      scope: 'work',
      project: 'nyota-auth0-migration',
      waitingFor: null,
      neededBy: null,
      doneAt: null,
    });
    // Verschachtelte Checkbox: eingerueckt, eigener Marker, eigener Tag.
    expect(gruppen).toMatchObject({
      state: 'open',
      waitingFor: 'Anna',
      tags: ['rbac'],
      priority: 0,
      due: null,
      dueInDays: null,
    });
    expect(terraform).toMatchObject({ state: 'done', doneAt: '2026-08-09' });
    expect(antwort).toMatchObject({
      neededBy: '2026-08-20',
      priority: 3,
      waitingFor: 'Auth0 Support',
    });
  });

  it('uebergeht Checkboxen in Code-Zaeunen', () => {
    const texts = nyotaTodos().map((todo) => todo.text);
    expect(texts.some((text) => text.includes('Beispiel aus der Doku'))).toBe(false);
  });

  it('fuehrt die Zeilennummer der Datei mit', () => {
    const lines = NYOTA_PROJECT.split('\n');
    for (const todo of nyotaTodos()) {
      expect(lines[todo.line - 1] ?? '').toContain(todo.text.slice(0, 12));
    }
  });

  it('rechnet Fristen gegen das uebergebene heute, nicht gegen die Systemzeit', () => {
    const doc = toIndexedDoc(STAT.path, NYOTA_PROJECT, STAT);
    const spaeter = parseTodos(doc.body, { path: doc.path, today: '2026-08-20' });
    expect(spaeter[0]?.dueInDays).toBe(-5);
  });

  it('nimmt das Datum der Datei als Anlagedatum, wenn kein Marker steht', () => {
    const body = ['- [ ] Etwas tun', '- [ ] Anderes tun @created:2026-08-02'].join('\n');
    const todos = parseTodos(body, {
      path: 'journal/2026/08/2026-08-10.md',
      frontmatter: { date: '2026-08-10', scope: 'work' },
      today: TODAY,
    });
    expect(todos[0]?.createdAt).toBe('2026-08-10');
    expect(todos[1]?.createdAt).toBe('2026-08-02');
  });
});

describe('areaOfPath: nur direkte Kinder von areas/ zaehlen', () => {
  it('liest den Slug aus einer Bereichsdatei', () => {
    expect(areaOfPath('areas/gesundheit.md')).toBe('gesundheit');
  });

  it('bleibt bei verschachtelten Pfaden ehrlich leer — Areas sind flach', () => {
    expect(areaOfPath('areas/nested/x.md')).toBeNull();
  });

  it('ist null fuer alles, was kein Bereich ist', () => {
    expect(areaOfPath('projects/work/x/project.md')).toBeNull();
  });
});

describe('todoId: stabil gegen Zeile, Abhaken und Prioritaet', () => {
  it('bleibt gleich, wenn die Zeile umzieht', () => {
    const before = parseTodos(['- [ ] Rollen-Mapping dokumentieren'].join('\n'), {
      path: 'a.md',
      today: TODAY,
    });
    const after = parseTodos(
      ['', '## Todos', '', '- [ ] Rollen-Mapping dokumentieren'].join('\n'),
      {
        path: 'a.md',
        today: TODAY,
      },
    );
    expect(before[0]?.line).not.toBe(after[0]?.line);
    expect(before[0]?.id).toBe(after[0]?.id);
  });

  it('bleibt gleich, wenn der Nutzer abhakt', () => {
    const open = parseTodos('- [ ] Testmandant aufsetzen @due:2026-08-15 !!', {
      path: 'p.md',
      today: TODAY,
    });
    const done = parseTodos('- [x] Testmandant aufsetzen @due:2026-08-15 !! @done:2026-08-11', {
      path: 'p.md',
      today: TODAY,
    });
    expect(done[0]?.state).toBe('done');
    expect(open[0]?.id).toBe(done[0]?.id);
  });

  it('haengt am Pfad — dasselbe Todo in zwei Dateien ist nicht dasselbe', () => {
    expect(todoId('a.md', 'Etwas tun')).not.toBe(todoId('b.md', 'Etwas tun'));
  });

  it('unterscheidet gleichlautende Zeilen derselben Datei', () => {
    const todos = parseTodos(['- [ ] Nachfassen', '- [ ] Nachfassen'].join('\n'), {
      path: 'a.md',
      today: TODAY,
    });
    expect(todos[0]?.id).not.toBe(todos[1]?.id);
    expect(todos[1]?.id.endsWith('-2')).toBe(true);
  });
});

describe('scopeFor: Pfad → Frontmatter → Tag → privat', () => {
  it('entscheidet der Pfad, wenn das Projekt es sagt', () => {
    expect(scopeFor('projects/work/x/project.md', { scope: 'private' })).toBe('work');
    expect(scopeFor('projects/private/x/project.md', {})).toBe('private');
  });

  it('sonst das Frontmatter', () => {
    expect(scopeFor('journal/2026/08/2026-08-10.md', { scope: 'work' })).toBe('work');
    expect(scopeFor('areas/gesundheit.md', { scope: 'privat' })).toBe('private');
  });

  it('sonst ein Tag am Todo, dann an der Datei', () => {
    expect(scopeFor('areas/gesundheit.md', {}, ['work'])).toBe('work');
    expect(scopeFor('areas/gesundheit.md', { tags: ['work'] }, ['privat'])).toBe('private');
    expect(scopeFor('areas/gesundheit.md', { tags: ['arbeit'] })).toBe('work');
  });

  it('sonst privat', () => {
    expect(scopeFor('notes/irgendwas.md', {})).toBe('private');
    expect(scopeFor('journal/2026/08/2026-08-10.md', { scope: 'both' })).toBe('private');
  });

  it('wirkt bis in die geparsten Todos', () => {
    const todos = parseTodos(
      ['- [ ] Zahnarzttermin holen #privat', '- [ ] Arbeitsplatz höher stellen #work'].join('\n'),
      { path: 'areas/gesundheit.md', today: TODAY },
    );
    expect(todos.map((todo) => todo.scope)).toEqual(['private', 'work']);
    expect(todos[1]?.text).toBe('Arbeitsplatz höher stellen');
  });

  it('traegt den Bereichs-Slug mit, statt eines Projekts', () => {
    const todos = parseTodos('- [ ] Zahnarzttermin holen #privat', {
      path: 'areas/gesundheit.md',
      today: TODAY,
    });
    expect(todos[0]).toMatchObject({ area: 'gesundheit', project: null, scope: 'private' });
  });
});
