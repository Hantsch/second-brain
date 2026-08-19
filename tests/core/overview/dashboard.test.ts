import { describe, expect, it } from 'vitest';
import { dashboardData, journalStreak, moodTrend, staleProjects } from '@core/overview';
import { deriveJournalDays } from '@core/index/journal';
import { makeDoc } from '../index/fixtures';
import {
  NOW,
  TODAY,
  day,
  dumpDoc,
  indexFrom,
  journalDoc,
  projectDoc,
  rawSource,
  session,
  stamp,
} from './fixtures';

const LIMITS = { staleAfterDays: 14, deadlineHorizonDays: 14, waitingNudgeDays: 5 };

function todoBody(...lines: string[]): string {
  return ['## Todos', '', ...lines, ''].join('\n');
}

describe('dashboardData — Todos', () => {
  it('trennt Arbeit und Privat', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'kundenportal',
        scope: 'work',
        body: todoBody(`- [ ] Abnahme vorbereiten @due:${day(1)}`, '- [x] Bilder umgestellt'),
      }),
      projectDoc({
        slug: 'hochbeet',
        scope: 'private',
        body: todoBody('- [ ] Erde bestellen', '- [ ] Bretter zuschneiden !!'),
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);

    expect(data.todos.work.map((todo) => todo.text)).toEqual(['Abnahme vorbereiten']);
    expect(data.todos.private.map((todo) => todo.text)).toEqual([
      'Bretter zuschneiden',
      'Erde bestellen',
    ]);
  });

  it('sortiert nach naechster Frist, dann nach Prioritaet', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'a',
        body: todoBody(
          '- [ ] Ohne Frist, wichtig !!!',
          `- [ ] Mit Frist morgen @due:${day(1)}`,
          `- [ ] Mit Frist heute @due:${TODAY}`,
        ),
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.todos.work.map((todo) => todo.text)).toEqual([
      'Mit Frist heute',
      'Mit Frist morgen',
      'Ohne Frist, wichtig',
    ]);
  });

  it('laesst offene Checkboxen abgeschlossener Projekte weg', () => {
    const index = indexFrom([
      projectDoc({ slug: 'laeuft', body: todoBody('- [ ] Abnahme vorbereiten') }),
      projectDoc({
        slug: 'fertig',
        status: 'done',
        body: todoBody('- [ ] Vergessene Checkbox'),
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.todos.work.map((todo) => todo.text)).toEqual(['Abnahme vorbereiten']);
  });

  it('beachtet die Obergrenze je Bereich', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'a',
        body: todoBody(...[1, 2, 3, 4, 5].map((n) => `- [ ] Aufgabe ${n}`)),
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY, undefined, { todoLimit: 2 });
    expect(data.todos.work).toHaveLength(2);
  });

  it('zaehlt auch die Todos eines Bereichs mit — kein Projekt, aber ein Slug', () => {
    const areaDoc = makeDoc({
      path: 'areas/gesundheit.md',
      docType: 'area',
      title: 'Gesundheit',
      frontmatter: { type: 'area', title: 'Gesundheit', scope: 'work' },
      body: todoBody('- [ ] Zahnarzttermin holen'),
    });
    const index = indexFrom([areaDoc]);
    const data = dashboardData(index, [], LIMITS, TODAY);

    expect(data.todos.work.map((todo) => todo.text)).toEqual(['Zahnarzttermin holen']);
    expect(data.todos.work[0]).toMatchObject({ area: 'gesundheit', project: null });
  });
});

describe('dashboardData — Warte-auf und stagnierende Projekte', () => {
  it('traegt bei jedem Warte-auf den Projektbezug mit, aeltestes zuerst', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        title: 'Nyota Auth0 Migration',
        waitingOn: [
          { who: 'Stefan', what: 'Freigabe', since: day(-2) },
          { who: 'Anna', what: 'Rückruf', since: day(-9) },
          { who: 'Weg', what: 'schon da', since: day(-20), resolved: true },
        ],
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.waitingOn.map((entry) => entry.who)).toEqual(['Anna', 'Stefan']);
    expect(data.waitingOn[0]).toMatchObject({
      project: 'nyota',
      projectTitle: 'Nyota Auth0 Migration',
      path: 'projects/work/nyota/project.md',
    });
  });

  it('nimmt eine composer-angelegte Zeile (nur wer und seit, ohne was) genauso auf wie eine ausgefuellte, richtig einsortiert', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        title: 'Nyota Auth0 Migration',
        waitingOn: [
          { who: 'Stefan', what: 'Freigabe', since: day(-2) },
          { who: 'Neu', what: '', since: day(-3) },
        ],
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.waitingOn.map((entry) => entry.who)).toEqual(['Neu', 'Stefan']);
    expect(data.waitingOn[0]).toMatchObject({
      who: 'Neu',
      what: '',
      project: 'nyota',
      projectTitle: 'Nyota Auth0 Migration',
      path: 'projects/work/nyota/project.md',
    });
  });

  it('laesst eine erledigte composer-angelegte Zeile weg', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        waitingOn: [{ who: 'Neu', what: '', since: day(-3), resolved: true }],
      }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.waitingOn).toEqual([]);
  });

  it('nennt stagnierende Projekte als Slugs, laengste Pause zuerst', () => {
    const index = indexFrom([
      projectDoc({ slug: 'lang', updated: stamp(-40) }),
      projectDoc({ slug: 'mittel', updated: stamp(-20) }),
      projectDoc({ slug: 'frisch', updated: stamp(-1) }),
      projectDoc({ slug: 'fertig', status: 'done', updated: stamp(-99) }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.staleProjects).toEqual(['lang', 'mittel']);
  });

  it('zaehlt auch pausierte Projekte zur Liste — anders als die Erinnerung', () => {
    const projects = indexFrom([
      projectDoc({ slug: 'pause', status: 'paused', updated: stamp(-30) }),
    ]).projects();
    expect(staleProjects(projects, TODAY, 14).map((project) => project.slug)).toEqual(['pause']);
  });
});

describe('dashboardData — Inbox, Journal und Sitzungen', () => {
  it('zaehlt nur unsortierte Dumps', () => {
    const index = indexFrom([
      dumpDoc('a'),
      dumpDoc('b', { status: 'proposed' }),
      dumpDoc('c', { status: 'filed' }),
      dumpDoc('d', { status: 'kept' }),
    ]);
    expect(dashboardData(index, [], LIMITS, TODAY).inboxCount).toBe(2);
  });

  it('liefert Serie, letzten Eintrag und Stimmungsreihe', () => {
    const index = indexFrom([
      journalDoc(0, { mood: 4 }),
      journalDoc(-1, { mood: 3 }),
      journalDoc(-2),
      journalDoc(-20, { mood: 1 }),
    ]);
    const data = dashboardData(index, [], LIMITS, TODAY);
    expect(data.journal.streak).toBe(3);
    expect(data.journal.lastEntry).toBe(TODAY);
    // Aeltester zuerst, nur Tage mit Angabe, nur die letzten 14 Tage.
    expect(data.journal.moodTrend).toEqual([3, 4]);
  });

  it('gibt die Sitzungen unveraendert weiter', () => {
    const sessions = [session({ vaultProject: 'x' })];
    const data = dashboardData(indexFrom([]), sessions, LIMITS, TODAY);
    expect(data.sessions).toEqual(sessions);
    expect(data.sessions).not.toBe(sessions);
  });

  it('mischt Sitzungen und Quellen in „zuletzt gearbeitet"', () => {
    const index = indexFrom([projectDoc({ slug: 'a', updated: stamp(-1) })], {
      sources: [rawSource()],
    });
    const data = dashboardData(index, [session()], LIMITS, TODAY);
    expect(new Set(data.recentWork.map((item) => item.kind))).toEqual(
      new Set(['file', 'claude-session', 'ingest']),
    );
  });
});

describe('journalStreak', () => {
  const days = (offsets: number[]) =>
    deriveJournalDays(offsets.map((offset) => journalDoc(offset)));

  it('zaehlt bis heute durch', () => {
    expect(journalStreak(days([0, -1, -2]), TODAY)).toBe(3);
  });

  it('bricht an der ersten Luecke ab', () => {
    expect(journalStreak(days([0, -1, -3, -4]), TODAY)).toBe(2);
  });

  it('zaehlt auch, wenn heute noch kein Eintrag da ist', () => {
    expect(journalStreak(days([-1, -2]), TODAY)).toBe(2);
  });

  it('ist null, wenn der letzte Eintrag aelter als gestern ist', () => {
    expect(journalStreak(days([-2, -3]), TODAY)).toBe(0);
    expect(journalStreak([], TODAY)).toBe(0);
  });
});

describe('moodTrend', () => {
  it('nimmt nur Tage mit Angabe und nur das Fenster', () => {
    const journal = deriveJournalDays([
      journalDoc(0, { mood: 5 }),
      journalDoc(-3, { mood: 2 }),
      journalDoc(-5),
      journalDoc(-14, { mood: 1 }),
    ]);
    expect(moodTrend(journal, TODAY, 14)).toEqual([2, 5]);
  });
});

describe('dashboardData — Pflegewert', () => {
  it('behauptet keinen Wert, solange kein Pflegelauf vorliegt', () => {
    const data = dashboardData(indexFrom([]), [], LIMITS, TODAY);
    expect(data.healthKnown).toBe(false);
    expect(data.health).toBe(0);
    expect(data.findingCount).toBe(0);
  });

  it('nimmt einen eingespeisten Pflegelauf und sagt, dass er vorliegt', () => {
    const data = dashboardData(indexFrom([]), [], LIMITS, TODAY, undefined, {
      gardener: { health: 82, findingCount: 4 },
    });
    expect(data).toMatchObject({ healthKnown: true, health: 82, findingCount: 4 });
  });
});

describe('dashboardData — Erinnerungen', () => {
  it('reicht das Ruhen an die Erinnerungen weiter', () => {
    const index = indexFrom([projectDoc({ slug: 'a', deadline: day(1) })]);
    const first = dashboardData(index, [], LIMITS, TODAY).reminders;
    expect(first).toHaveLength(1);

    const snoozed = dashboardData(
      index,
      [],
      LIMITS,
      TODAY,
      new Map([[first[0]!.id, day(3)]]),
    ).reminders;
    expect(snoozed).toEqual([]);
  });

  it('rechnet alles auf das uebergebene heute, nicht auf die echte Uhr', () => {
    const index = indexFrom([projectDoc({ slug: 'a', deadline: day(1) })], { now: NOW });
    const data = dashboardData(index, [], LIMITS, day(1));
    expect(data.reminders[0]?.urgency).toBe('today');
  });
});
