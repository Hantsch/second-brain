/* Die serverseitige Nachpruefung der bestaetigten Todos (075, D5). Die Karte ist
   editierbar, also ist alles, was am Schreibweg ankommt, Nutzereingabe — kein
   eigener Vorschlag mehr. Hier steht, was davon geschrieben werden darf.

   Reine Funktion: kein Vault, kein Index, keine Uhr. Was von aussen kommt
   (welche Projekte es gibt, was die Tagesdatei zum Bereich sagt), gibt der
   Aufrufer mit. */

import { describe, expect, it } from 'vitest';
import { todoBlock } from '@core/capture';
import { parseTodos } from '@core/index';
import { normalizeCloseTodos } from '@core/journal';
import type { ProposedTodo } from '@shared/types';

const DAY_PATH = 'journal/2026/08/2026-08-10.md';

/** Ein Todo, wie es der Renderer schickt — pro Test zaehlt nur ein Feld. */
function todo(patch: Partial<ProposedTodo> = {}): ProposedTodo {
  return {
    text: 'Abnahmeprotokoll durchgehen',
    scope: 'private',
    due: null,
    waitingFor: null,
    priority: 0,
    project: null,
    ...patch,
  };
}

const KNOWN = new Set(['kundenportal-relaunch']);

function normalize(
  todos: ProposedTodo[],
  dayScope: 'work' | 'private' = 'private',
): ProposedTodo[] {
  return normalizeCloseTodos(todos, { projectSlugs: KNOWN, dayScope });
}

describe('normalizeCloseTodos', () => {
  it('schickt ein Todo mit unbekanntem Projekt zum Tag, statt den Abschluss zu verlieren', () => {
    const [known, unknown] = normalize([
      todo({ project: 'kundenportal-relaunch' }),
      todo({ text: 'Gehört zu einem Projekt, das es nicht gibt', project: 'gibt-es-nicht' }),
    ]);

    expect(known?.project).toBe('kundenportal-relaunch');
    expect(unknown?.project).toBeNull();
    /* Der Text bleibt: der Weg zum Tag ist ein Rückfall, kein Verlust. */
    expect(unknown?.text).toBe('Gehört zu einem Projekt, das es nicht gibt');
  });

  it('schreibt den Bereich nur auf die Zeile, wenn er vom Tag abweicht', () => {
    const [deviating, matching] = normalize([
      todo({ text: 'Abnahmeprotokoll durchgehen', scope: 'work' }),
      todo({ text: 'Rezept aufschreiben', scope: 'private' }),
    ]);

    expect(deviating?.text).toBe('Abnahmeprotokoll durchgehen #work');
    /* Was der Tag ohnehin sagt, muss nicht danebenstehen. */
    expect(matching?.text).toBe('Rezept aufschreiben');
  });

  it('schreibt einen Tag, den die Leseseite als denselben Bereich zurückliest', () => {
    /* Genau die Runde, um die es geht: der Tag, der hier drangehängt wird, muss
       aus der geschriebenen Zeile wieder als derselbe Bereich herauskommen —
       sonst wäre er eine stumme Zeichenkette im Text des Nutzers. */
    const work = normalize([todo({ scope: 'work' })], 'private');
    const asWork = parseTodos(todoBlock(work), {
      path: DAY_PATH,
      frontmatter: { tags: ['stress'] },
    });
    expect(asWork[0]?.scope).toBe('work');
    /* Und der Anzeigetext bleibt der des Nutzers: der Marker wird gelesen, nicht gezeigt. */
    expect(asWork[0]?.text).toBe('Abnahmeprotokoll durchgehen');

    const privat = normalizeCloseTodos([todo({ scope: 'private' })], {
      projectSlugs: KNOWN,
      dayScope: 'work',
    });
    const asPrivate = parseTodos(todoBlock(privat), {
      path: DAY_PATH,
      frontmatter: { tags: ['work'] },
    });
    expect(asPrivate[0]?.scope).toBe('private');
  });

  it('hängt einem Todo mit Projekt keinen Bereichs-Tag an', () => {
    const [entry] = normalize([todo({ scope: 'work', project: 'kundenportal-relaunch' })]);

    /* Der Pfad des Projekts legt den Bereich fest; ein Tag daneben wäre
       wirkungsloses Rauschen in einer fremden Datei. */
    expect(entry?.text).toBe('Abnahmeprotokoll durchgehen');
    expect(entry?.scope).toBe('work');
  });

  it('hängt auch dem zurückgefallenen Todo den abweichenden Bereich an', () => {
    const [entry] = normalize([todo({ scope: 'work', project: 'gibt-es-nicht' })]);

    /* Es ist jetzt ein Todo des Tages — und damit gilt für es dieselbe Regel. */
    expect(entry?.project).toBeNull();
    expect(entry?.text).toBe('Abnahmeprotokoll durchgehen #work');
  });

  it('lässt eine nach dem Trimmen leere Zeile weg, statt den Abschluss abzulehnen', () => {
    const result = normalize([
      todo({ text: '   \t ' }),
      todo({ text: '  Abnahmeprotokoll durchgehen  ' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('Abnahmeprotokoll durchgehen');
  });

  it('begrenzt die Priorität auf null bis drei und macht eine ganze Zahl daraus', () => {
    const result = normalize([
      todo({ priority: 9 }),
      todo({ priority: -2 }),
      todo({ priority: 2.7 }),
      todo({ priority: Number.NaN }),
    ]);

    expect(result.map((entry) => entry.priority)).toEqual([3, 0, 2, 0]);
  });

  it('nimmt nur ein Datum in Tagesform an und verwirft alles andere', () => {
    const result = normalize([
      todo({ due: '2026-08-12' }),
      todo({ due: 'morgen' }),
      todo({ due: '12.08.2026' }),
      todo({ due: null }),
    ]);

    expect(result.map((entry) => entry.due)).toEqual(['2026-08-12', null, null, null]);
  });

  it('fällt bei einem fremden Bereichswert auf den des Tages zurück, statt zu werfen', () => {
    /* Ein alter Renderer-Stand schickt etwas anderes als `work`/`private`. Das
       darf einen ganzen Tagesabschluss nicht zu Fall bringen. */
    const stale = { ...todo(), scope: 'arbeit' } as unknown as ProposedTodo;

    const [entry] = normalize([stale], 'work');

    expect(entry?.scope).toBe('work');
    /* Der Tag sagt dasselbe, also steht auch kein Tag auf der Zeile. */
    expect(entry?.text).toBe('Abnahmeprotokoll durchgehen');
  });

  it('macht aus einem leeren „Warte auf“ nichts, statt einen leeren Marker zu schreiben', () => {
    const [blank, named] = normalize([
      todo({ waitingFor: '   ' }),
      todo({ waitingFor: ' Miriam ' }),
    ]);

    expect(blank?.waitingFor).toBeNull();
    expect(named?.waitingFor).toBe('Miriam');
  });

  it('lässt eine leere Liste leer', () => {
    expect(normalize([])).toEqual([]);
  });
});
