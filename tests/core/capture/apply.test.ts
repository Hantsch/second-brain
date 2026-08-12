/* Einen Vorschlag ausführen. Hier wird geschrieben, also gelten die harten
   Zusagen: nichts still überschreiben (Konflikt statt Verlust), kein halber
   Zustand bei einem Teilfehler, und ein Rückweg, der *alle* Teilschritte
   zurückdreht — nicht nur den Dump.

   Der Bestand ist echt (Fixture-Vault im Speicher-Store), damit Hash, Merge und
   Abschnitts-Anhängen genau so wirken wie auf der Platte. */

import { beforeEach, describe, expect, it } from 'vitest';
import { applyProposal, heuristicProposal, mergeWaitingOn, undoFiling } from '@core/capture';
import { parse } from '@core/vault/frontmatter';
import type { DumpItem, FilingProposal, WaitingOn } from '@shared/types';
import { NOW_MS, TODAY } from '../../helpers/time';
import type { CaptureFixture } from './fixtures';
import { AREA_PATH, JOURNAL_PATH, WORK_PROJECT_PATH, captureFixture } from './fixtures';

let fixture: CaptureFixture;

async function proposalFor(text: string): Promise<{ dump: DumpItem; proposal: FilingProposal }> {
  const dump = await fixture.dump(text);
  const proposal = heuristicProposal({
    dumpPath: dump.path,
    text,
    context: fixture.context,
    now: NOW_MS,
  });
  return { dump, proposal };
}

async function read(path: string): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const content = await fixture.store.readText(path);
  expect(content).not.toBeNull();
  return parse(content ?? '');
}

beforeEach(async () => {
  fixture = await captureFixture();
});

describe('applyProposal — Projektnotiz', () => {
  const TEXT = 'Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen.';

  it('schreibt die Notiz mit Datum und das Todo unter „Todos"', async () => {
    const { proposal } = await proposalFor(TEXT);
    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const project = await read(WORK_PROJECT_PATH);
    expect(project.body).toContain(`### ${TODAY}`);
    expect(project.body).toContain('Ladezeiten der Angebotsliste bis morgen prüfen');
    expect(project.body).toContain(
      '- [ ] Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen @due:2026-08-11',
    );
    expect(result.written).toEqual([WORK_PROJECT_PATH]);
  });

  it('hängt die Notiz unter „Notizen" und das Todo unter „Todos" an, nicht ans Dateiende', async () => {
    const { proposal } = await proposalFor(TEXT);
    await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const { body } = await read(WORK_PROJECT_PATH);
    const todosAt = body.indexOf('## Todos');
    const notesAt = body.indexOf('## Notizen');
    expect(body.indexOf('- [ ] Kundenportal: Ladezeiten')).toBeGreaterThan(todosAt);
    expect(body.indexOf('- [ ] Kundenportal: Ladezeiten')).toBeLessThan(notesAt);
    expect(body.indexOf('Ladezeiten der Angebotsliste bis morgen prüfen.')).toBeGreaterThan(
      notesAt,
    );
  });

  it('verschiebt den Dump in den Papierkorb und gibt eine Marke zurück', async () => {
    const { dump, proposal } = await proposalFor(TEXT);
    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });

    expect(result.undoToken).not.toBeNull();
    expect(result.movedTo).toContain('.secondbrain/trash/');
    expect(await fixture.store.readText(dump.path)).toBeNull();
  });

  it('dreht mit der Marke alles zurück — Notiz, Todo und Dump', async () => {
    const { dump, proposal } = await proposalFor(TEXT);
    const before = await read(WORK_PROJECT_PATH);
    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const touched = await undoFiling(fixture.store, result.undoToken ?? '');

    const after = await read(WORK_PROJECT_PATH);
    expect(after.body).toBe(before.body);
    expect(after.body).not.toContain('Ladezeiten der Angebotsliste bis morgen');
    expect(touched).toContain(WORK_PROJECT_PATH);
    expect(touched).toContain(dump.path);
    const restored = await read(dump.path);
    expect(restored.frontmatter['status']).toBe('raw');
  });
});

describe('applyProposal — waiting_on', () => {
  const TEXT = 'Ich warte noch auf Miriam wegen der Textänderungen. Kundenportal.';

  it('mergt ins Frontmatter, ohne bestehende Einträge zu verlieren', async () => {
    const { proposal } = await proposalFor(TEXT);
    await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const { frontmatter } = await read(WORK_PROJECT_PATH);
    const waiting = frontmatter['waiting_on'] as WaitingOn[];
    expect(waiting).toHaveLength(2);
    expect(waiting[0]?.who).toBe('Jonas');
    expect(waiting[0]?.what).toBe('Fallback für abgelaufene Sitzungen');
    expect(waiting[1]?.who).toBe('Miriam');
    expect(waiting[1]?.since).toBe(TODAY);
  });

  it('nimmt den Merge beim Rückgängig wieder heraus', async () => {
    const { proposal } = await proposalFor(TEXT);
    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });
    await undoFiling(fixture.store, result.undoToken ?? '');

    const { frontmatter } = await read(WORK_PROJECT_PATH);
    const waiting = frontmatter['waiting_on'] as WaitingOn[];
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.who).toBe('Jonas');
  });

  it('legt denselben Eintrag nicht zweimal an', () => {
    const existing: WaitingOn[] = [
      { who: 'Jonas', what: 'Fallback', since: '2026-08-06', due: '2026-08-12' },
    ];
    const merged = mergeWaitingOn(existing, [
      { who: 'jonas', what: 'fallback', since: TODAY },
      { who: 'Miriam', what: 'Texte', since: TODAY },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(existing[0]);
    expect(merged[1]?.who).toBe('Miriam');
  });
});

describe('applyProposal — weitere Ziele', () => {
  it('legt bei „new-project" eine gültige Projektdatei an', async () => {
    const dump = await fixture.dump('Neues Vorhaben: Suche im Portal beschleunigen.');
    const base = heuristicProposal({
      dumpPath: dump.path,
      text: 'Neues Vorhaben: Suche im Portal beschleunigen. Index prüfen.',
      context: fixture.context,
      now: NOW_MS,
    });
    const proposal: FilingProposal = {
      ...base,
      title: 'Suche im Portal beschleunigen',
      scope: 'work',
      tags: ['performance'],
      primary: {
        target: 'new-project',
        path: 'projects/work/suche-im-portal-beschleunigen/project.md',
        section: 'Stand',
        content: 'Die Suche über Kundennummern braucht über drei Sekunden.',
      },
      extras: [],
      todos: [
        {
          text: 'Index prüfen',
          scope: 'work',
          due: null,
          waitingFor: null,
          priority: 0,
          project: null,
        },
      ],
      waitingOn: [{ who: 'Jonas', what: 'Messwerte', since: TODAY }],
    };

    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const created = await read('projects/work/suche-im-portal-beschleunigen/project.md');
    expect(created.frontmatter['type']).toBe('project');
    expect(created.frontmatter['title']).toBe('Suche im Portal beschleunigen');
    expect(created.frontmatter['slug']).toBe('suche-im-portal-beschleunigen');
    expect(created.frontmatter['scope']).toBe('work');
    expect(created.frontmatter['status']).toBe('active');
    expect(created.frontmatter['started']).toBe(TODAY);
    expect(created.frontmatter['next_step']).toBe('Index prüfen');
    expect(created.frontmatter['tags']).toEqual(['performance']);
    expect(created.frontmatter['waiting_on']).toHaveLength(1);
    expect(created.body).toContain('## Stand');
    expect(created.body).toContain('## Todos');
    expect(created.body).toContain('## Notizen');
    expect(created.body).toContain('Die Suche über Kundennummern');
    expect(result.written).toContain('projects/work/suche-im-portal-beschleunigen/project.md');
  });

  it('löscht die neue Projektdatei beim Rückgängig wieder', async () => {
    const dump = await fixture.dump('Neues Vorhaben: Portal-Suche.');
    const base = heuristicProposal({
      dumpPath: dump.path,
      text: 'Neues Vorhaben: Portal-Suche.',
      context: fixture.context,
      now: NOW_MS,
    });
    const path = 'projects/work/portal-suche/project.md';
    const result = await applyProposal(
      fixture.store,
      {
        ...base,
        title: 'Portal-Suche',
        scope: 'work',
        primary: { target: 'new-project', path, section: 'Stand', content: 'Erster Stand.' },
        extras: [],
        todos: [],
        waitingOn: [],
      },
      { now: NOW_MS },
    );
    await undoFiling(fixture.store, result.undoToken ?? '');

    expect(await fixture.store.readText(path)).toBeNull();
    expect(await fixture.store.readText(dump.path)).not.toBeNull();
  });

  it('hängt einen Tageseintrag unter „Tag" an, ohne Datumskopf', async () => {
    const { proposal } = await proposalFor('Ich bin müde, der Tag war zu voll.');
    await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const { body } = await read(JOURNAL_PATH);
    const dayAt = body.indexOf('## Tag');
    const talkAt = body.indexOf('## Gespräch');
    const noteAt = body.indexOf('Ich bin müde, der Tag war zu voll.');
    expect(noteAt).toBeGreaterThan(dayAt);
    expect(noteAt).toBeLessThan(talkAt);
    expect(body).not.toContain(`### ${TODAY}`);
  });

  it('markiert einen Dump bei „inbox" als bewusst behalten und löscht ihn nicht', async () => {
    const { dump, proposal } = await proposalFor('Einkaufsliste:\n- Kaffee\n- Hefe');
    expect(proposal.primary.target).toBe('inbox');

    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });

    expect(result.undoToken).toBeNull();
    expect(result.movedTo).toBeNull();
    const kept = await read(dump.path);
    expect(kept.frontmatter['status']).toBe('kept');
  });

  /* „Bleibt liegen" heißt: keine Datei wird angefasst. Ein Todo-Block in einer
     fremden Projektdatei wäre ein Schreibvorgang ohne Rückweg — der `undoToken`
     entsteht erst mit der Papierkorb-Kopie des Dumps, und die gibt es hier nicht. */
  it('schreibt bei „inbox" nichts, auch kein Todo in eine Projektdatei', async () => {
    const { proposal } = await proposalFor('Einkaufsliste:\n- Kaffee\n- Hefe');
    const before = await fixture.store.readText(WORK_PROJECT_PATH);

    const result = await applyProposal(
      fixture.store,
      {
        ...proposal,
        /* Wie es aus dem Hauptprozess käme: ein Todo, das ein Projekt nennt. */
        extras: [
          {
            target: 'project',
            path: WORK_PROJECT_PATH,
            section: 'Todos',
            content: '- [ ] Kaffee kaufen',
          },
        ],
        waitingOn: [{ who: 'Stefan', what: 'Einkaufszettel', since: TODAY }],
      },
      { now: NOW_MS },
    );

    expect(result.written).toEqual([]);
    expect(result.undoToken).toBeNull();
    expect(await fixture.store.readText(WORK_PROJECT_PATH)).toBe(before);
  });

  it('schreibt ein Bereichs-Todo in die Bereichsdatei', async () => {
    const { proposal } = await proposalFor('Gesundheit: Termin beim Physiotherapeuten machen.');
    await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const { body } = await read(AREA_PATH);
    expect(body).toContain('- [ ] Gesundheit: Termin beim Physiotherapeuten machen');
    expect(body).toContain(`### ${TODAY}`);
  });
});

describe('applyProposal — Schutz vor Verlust', () => {
  it('meldet einen Konflikt statt zu überschreiben, wenn der Hash veraltet ist', async () => {
    const { dump, proposal } = await proposalFor('Kundenportal: Ladezeiten prüfen.');
    const before = await fixture.store.readText(WORK_PROJECT_PATH);

    await expect(
      applyProposal(fixture.store, proposal, {
        now: NOW_MS,
        expectedHashes: { [WORK_PROJECT_PATH]: 'veralteter-hash' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await fixture.store.readText(WORK_PROJECT_PATH)).toBe(before);
    expect(await fixture.store.readText(dump.path)).not.toBeNull();
  });

  it('meldet einen Konflikt, wenn der Dump sich seit dem Vorschlag geändert hat', async () => {
    const { dump, proposal } = await proposalFor('Kundenportal: Ladezeiten prüfen.');
    const before = await fixture.store.readText(WORK_PROJECT_PATH);

    await expect(
      applyProposal(fixture.store, proposal, {
        now: NOW_MS,
        expectedHashes: { [dump.path]: 'veralteter-hash' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await fixture.store.readText(WORK_PROJECT_PATH)).toBe(before);
    expect(await fixture.store.readText(dump.path)).not.toBeNull();
  });

  it('rollt bereits Geschriebenes zurück, wenn ein Teilschritt scheitert', async () => {
    const { dump, proposal } = await proposalFor('Kundenportal: Ladezeiten prüfen.');
    const before = await fixture.store.readText(WORK_PROJECT_PATH);
    const broken: FilingProposal = {
      ...proposal,
      extras: [
        ...proposal.extras,
        {
          target: 'project',
          path: 'projects/work/weg/project.md',
          section: 'Todos',
          content: '- [ ] x',
        },
      ],
    };

    await expect(applyProposal(fixture.store, broken, { now: NOW_MS })).rejects.toMatchObject({
      code: 'not-found',
    });

    expect(await fixture.store.readText(WORK_PROJECT_PATH)).toBe(before);
    expect(await fixture.store.readText(dump.path)).not.toBeNull();
  });

  it('meldet einen fehlenden Dump, statt eine Zieldatei anzufassen', async () => {
    const { proposal } = await proposalFor('Kundenportal: Ladezeiten prüfen.');
    const before = await fixture.store.readText(WORK_PROJECT_PATH);

    await expect(
      applyProposal(fixture.store, { ...proposal, dumpPath: 'inbox/weg.md' }, { now: NOW_MS }),
    ).rejects.toMatchObject({ code: 'not-found' });

    expect(await fixture.store.readText(WORK_PROJECT_PATH)).toBe(before);
  });

  it('lässt einen vom Nutzer bearbeiteten Block beim Rückgängig stehen', async () => {
    const { proposal } = await proposalFor('Kundenportal: Ladezeiten prüfen.');
    const result = await applyProposal(fixture.store, proposal, { now: NOW_MS });

    const edited = (await fixture.store.readText(WORK_PROJECT_PATH))?.replace(
      'Ladezeiten prüfen.',
      'Ladezeiten prüfen — und zwar gründlich.',
    );
    await fixture.store.writeText(WORK_PROJECT_PATH, edited ?? '');
    await undoFiling(fixture.store, result.undoToken ?? '');

    const { body } = await read(WORK_PROJECT_PATH);
    expect(body).toContain('und zwar gründlich');
  });
});
