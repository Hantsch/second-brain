import { describe, expect, it } from 'vitest';
import { reminders, urgencyFor } from '@core/overview';
import { NOW, TODAY, day, indexFrom, journalDoc, projectDoc, stamp } from './fixtures';

const LIMITS = { staleAfterDays: 14, deadlineHorizonDays: 14, waitingNudgeDays: 5 };

function todoBody(...lines: string[]): string {
  return ['## Todos', '', ...lines, ''].join('\n');
}

describe('urgencyFor', () => {
  it('trennt die Stufen an den Grenzen', () => {
    expect(urgencyFor(-1, 14)).toBe('overdue');
    expect(urgencyFor(0, 14)).toBe('today');
    expect(urgencyFor(1, 14)).toBe('soon');
    expect(urgencyFor(3, 14)).toBe('soon');
    expect(urgencyFor(4, 14)).toBe('upcoming');
    expect(urgencyFor(14, 14)).toBe('upcoming');
    // Jenseits des Horizonts: keine Erinnerung, statt einer stillen 'upcoming'.
    expect(urgencyFor(15, 14)).toBeNull();
  });
});

describe('reminders — Todo-Fristen', () => {
  const index = indexFrom([
    projectDoc({
      slug: 'kundenportal',
      body: todoBody(
        `- [ ] Abnahmeprotokoll durchgehen @due:${day(-2)} !!!`,
        `- [ ] Ladezeiten messen @due:${TODAY}`,
        `- [ ] Testmandant aufsetzen @due:${day(3)}`,
        `- [ ] Doku schreiben @due:${day(10)}`,
        `- [ ] Irgendwann mal aufraeumen @due:${day(30)}`,
        `- [x] Bilder umgestellt @due:${day(-5)}`,
        '- [ ] Ohne Frist',
      ),
    }),
  ]);

  it('nennt jede offene Frist innerhalb des Horizonts, mit der richtigen Stufe', () => {
    const list = reminders(index, LIMITS, TODAY).filter((entry) => entry.source === 'todo-due');
    expect(list.map((entry) => [entry.title, entry.urgency, entry.daysOut])).toEqual([
      ['Abnahmeprotokoll durchgehen', 'overdue', -2],
      ['Ladezeiten messen', 'today', 0],
      ['Testmandant aufsetzen', 'soon', 3],
      ['Doku schreiben', 'upcoming', 10],
    ]);
  });

  it('traegt Bereich, Datei und Projekt mit', () => {
    const first = reminders(index, LIMITS, TODAY)[0];
    expect(first).toMatchObject({
      scope: 'work',
      path: 'projects/work/kundenportal/project.md',
      project: 'kundenportal',
    });
  });

  it('schweigt zu Todos in abgeschlossenen Projekten', () => {
    const done = indexFrom([
      projectDoc({
        slug: 'fertig',
        status: 'done',
        body: todoBody(`- [ ] Vergessene Checkbox @due:${day(-3)}`),
      }),
    ]);
    expect(reminders(done, LIMITS, TODAY)).toEqual([]);
  });

  it('nimmt `@needed:`, wenn kein `@due:` steht', () => {
    const withNeeded = indexFrom([
      projectDoc({
        slug: 'nyota',
        body: todoBody(`- [ ] Antwort von Auth0 abwarten @wait:Support @needed:${day(-1)}`),
      }),
    ]);
    const list = reminders(withNeeded, LIMITS, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: 'todo-due', urgency: 'overdue', who: 'Support' });
  });
});

describe('reminders — Projekt-Deadlines', () => {
  it('mahnt die Frist eines laufenden Projekts', () => {
    const index = indexFrom([
      projectDoc({ slug: 'kundenportal', title: 'Kundenportal', deadline: day(2) }),
    ]);
    const list = reminders(index, LIMITS, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      source: 'project-deadline',
      title: 'Kundenportal',
      urgency: 'soon',
      date: day(2),
    });
  });

  it('laesst abgeschlossene und aufgegebene Projekte in Ruhe', () => {
    const index = indexFrom([
      projectDoc({ slug: 'fertig', status: 'done', deadline: day(1) }),
      projectDoc({ slug: 'weg', status: 'dropped', deadline: day(1) }),
    ]);
    expect(reminders(index, LIMITS, TODAY)).toEqual([]);
  });
});

describe('reminders — überfällige Warte-auf', () => {
  it('mahnt eine Frist, die vorbei ist', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        waitingOn: [
          { who: 'Stefan', what: 'Freigabe des Rollenkonzepts', since: day(-8), due: day(-1) },
        ],
      }),
    ]);
    const list = reminders(index, LIMITS, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      source: 'waiting-overdue',
      urgency: 'overdue',
      title: 'Stefan: Freigabe des Rollenkonzepts',
      who: 'Stefan',
      date: day(-1),
    });
  });

  it('mahnt eine Frist in der Zukunft nicht — sie ist nicht überfällig', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        waitingOn: [{ who: 'Stefan', what: 'Freigabe', since: day(-1), due: day(2) }],
      }),
    ]);
    expect(reminders(index, LIMITS, TODAY)).toEqual([]);
  });

  it('mahnt ohne Frist erst nach `waitingNudgeDays`', () => {
    const kurz = indexFrom([
      projectDoc({ slug: 'a', waitingOn: [{ who: 'Anna', what: 'Rückruf', since: day(-4) }] }),
    ]);
    expect(reminders(kurz, LIMITS, TODAY)).toEqual([]);

    const lang = indexFrom([
      projectDoc({ slug: 'a', waitingOn: [{ who: 'Anna', what: 'Rückruf', since: day(-5) }] }),
    ]);
    expect(reminders(lang, LIMITS, TODAY)).toHaveLength(1);
  });

  it('ignoriert erledigte Warte-auf', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'a',
        waitingOn: [{ who: 'Anna', what: 'Rückruf', since: day(-30), resolved: true }],
      }),
    ]);
    expect(reminders(index, LIMITS, TODAY)).toEqual([]);
  });

  it('mahnt eine composer-angelegte Zeile ohne `was` nach `waitingNudgeDays` — der Titel faellt auf den Namen zurueck', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        waitingOn: [{ who: 'Neu', what: '', since: day(-6) }],
      }),
    ]);
    const list = reminders(index, LIMITS, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: 'waiting-overdue', title: 'Neu' });
  });

  it('mahnt eine composer-angelegte Zeile mit ueberfaelliger Frist', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        waitingOn: [{ who: 'Neu', what: '', since: day(-8), due: day(-1) }],
      }),
    ]);
    const list = reminders(index, LIMITS, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: 'waiting-overdue', title: 'Neu', date: day(-1) });
  });

  it('ignoriert eine erledigte composer-angelegte Zeile', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'a',
        waitingOn: [{ who: 'Neu', what: '', since: day(-30), resolved: true }],
      }),
    ]);
    expect(reminders(index, LIMITS, TODAY)).toEqual([]);
  });
});

describe('reminders — stagnierende Projekte', () => {
  it('mahnt ein laufendes Projekt ohne Spur', () => {
    const index = indexFrom(
      [projectDoc({ slug: 'liegt', title: 'Liegt still', updated: stamp(-20) })],
      { now: NOW },
    );
    const list = reminders(index, LIMITS, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      source: 'stale-project',
      urgency: 'overdue',
      title: 'Liegt still',
      daysOut: -20,
      date: day(-20),
    });
  });

  it('mahnt Ideen und pausierte Projekte nicht — mahnen soll, was laufen soll', () => {
    const index = indexFrom([
      projectDoc({ slug: 'idee', status: 'idea', updated: stamp(-40) }),
      projectDoc({ slug: 'pause', status: 'paused', updated: stamp(-40) }),
    ]);
    expect(reminders(index, LIMITS, TODAY)).toEqual([]);
  });

  it('beachtet die eingestellte Schwelle', () => {
    const docs = [projectDoc({ slug: 'liegt', updated: stamp(-10) })];
    expect(reminders(indexFrom(docs), LIMITS, TODAY)).toEqual([]);
    expect(reminders(indexFrom(docs), { ...LIMITS, staleAfterDays: 7 }, TODAY)).toHaveLength(1);
  });
});

describe('reminders — lose Enden (020, D7)', () => {
  /* Notar-Termin, angekündigt am day(-6) für day(-5) — beide vor TODAY, damit
     der Tag als vorbei gilt (dieselbe Konstellation wie
     `tests/core/gardener/checks-journal.test.ts`). */
  const notary = () =>
    journalDoc(-6, { body: ['## Tag', '', 'Morgen bin ich beim Notar.', ''].join('\n') });

  it('meldet ein unbeantwortetes loses Ende einmal, mit Quelle `loose-end`', () => {
    const index = indexFrom([notary()]);
    const list = reminders(index, LIMITS, TODAY).filter((entry) => entry.source === 'loose-end');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      source: 'loose-end',
      urgency: 'open',
      date: day(-5),
      scope: 'private',
    });
    // Der Titel nennt den Gegenstand — die Begründung, warum es mahnt.
    expect(list[0]!.title.length).toBeGreaterThan(0);
  });

  it('mahnt nicht mit `overdue` — eine Ankündigung ist keine verpasste Frist (022 D2)', () => {
    const index = indexFrom([notary()]);
    const list = reminders(index, LIMITS, TODAY).filter((entry) => entry.source === 'loose-end');
    expect(list[0]!.urgency).not.toBe('overdue');
  });

  it('mahnt nicht, wenn der Gegenstand schon ein Todo mit Frist ist — `findLooseEnds` zieht das selbst ab', () => {
    const withTodo = indexFrom([
      notary(),
      projectDoc({
        slug: 'privat',
        scope: 'private',
        body: todoBody(`- [ ] Notar Termin vorbereiten @due:${day(-1)}`),
      }),
    ]);
    const list = reminders(withTodo, LIMITS, TODAY).filter((entry) => entry.source === 'loose-end');
    expect(list).toEqual([]);
  });

  it('haelt dieselbe Kennung wie der Pflegelauf-Befund — `loose-end:` plus derselbe Hash', () => {
    const index = indexFrom([notary()]);
    const list = reminders(index, LIMITS, TODAY).filter((entry) => entry.source === 'loose-end');
    expect(list[0]!.id).toMatch(/^loose-end:[0-9a-f]{12}$/);
  });

  it('laesst sich wie jede andere Erinnerung ruhig stellen', () => {
    const index = indexFrom([notary()]);
    const before = reminders(index, LIMITS, TODAY).find((entry) => entry.source === 'loose-end')!;

    const ruht = reminders(index, LIMITS, TODAY, new Map([[before.id, day(2)]]));
    expect(ruht.some((entry) => entry.id === before.id)).toBe(false);

    const wiederDa = reminders(index, LIMITS, TODAY, new Map([[before.id, TODAY]]));
    expect(wiederDa.some((entry) => entry.id === before.id)).toBe(true);
  });
});

describe('reminders — Reihenfolge, IDs und Ruhen', () => {
  const index = indexFrom([
    projectDoc({
      slug: 'kundenportal',
      title: 'Kundenportal',
      deadline: day(1),
      body: todoBody(`- [ ] Lange fällig @due:${day(-3)}`, `- [ ] Heute fällig @due:${TODAY}`),
    }),
  ]);

  it('setzt overdue nach oben, danach nach Datum', () => {
    const list = reminders(index, LIMITS, TODAY);
    expect(list.map((entry) => entry.urgency)).toEqual(['overdue', 'today', 'soon']);
  });

  it('haelt IDs stabil, auch wenn sich das Datum verschiebt', () => {
    const before = reminders(index, LIMITS, TODAY).find(
      (entry) => entry.source === 'project-deadline',
    );
    const moved = indexFrom([
      projectDoc({ slug: 'kundenportal', title: 'Kundenportal', deadline: day(9) }),
    ]);
    const after = reminders(moved, LIMITS, TODAY).find(
      (entry) => entry.source === 'project-deadline',
    );
    expect(after?.id).toBe(before?.id);
    expect(after?.date).not.toBe(before?.date);
  });

  it('filtert, was noch ruht — und zeigt es wieder, wenn das Ruhen abgelaufen ist', () => {
    const list = reminders(index, LIMITS, TODAY);
    const target = list[0]!;

    const ruht = reminders(index, LIMITS, TODAY, new Map([[target.id, day(2)]]));
    expect(ruht.some((entry) => entry.id === target.id)).toBe(false);

    const wiederDa = reminders(index, LIMITS, TODAY, new Map([[target.id, TODAY]]));
    expect(wiederDa.some((entry) => entry.id === target.id)).toBe(true);
  });

  it('kommt ohne Einstellungen aus und nimmt dann die Vorgaben', () => {
    const list = reminders(index, undefined, TODAY);
    expect(list.length).toBeGreaterThan(0);
  });
});
