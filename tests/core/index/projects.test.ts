import { describe, expect, it } from 'vitest';
import { deriveProjects, projectExcerpt, projectTitles } from '@core/index/projects';
import { parseTodos } from '@core/index/todos';
import type { ExternalTouch } from '@core/index/types';
import { makeDoc, TODAY } from './fixtures';

const BODY = [
  '## Stand',
  '',
  'Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren @due:2026-08-15',
  '- [x] Terraform-State migriert',
  '',
].join('\n');

function projectDoc(overrides: Record<string, unknown> = {}) {
  return makeDoc({
    path: 'projects/work/nyota-auth0-migration/project.md',
    docType: 'project',
    title: 'Nyota Auth0 Migration',
    tags: ['auth0'],
    updated: '2026-08-01T10:00:00.000Z',
    project: 'nyota-auth0-migration',
    body: BODY,
    frontmatter: {
      type: 'project',
      title: 'Nyota Auth0 Migration',
      slug: 'nyota-auth0-migration',
      scope: 'work',
      status: 'active',
      priority: 2,
      deadline: '2026-09-01',
      next_step: 'Rückmeldung von Stefan einarbeiten',
      modules: ['identity-management'],
      repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure'],
      waiting_on: [
        {
          who: 'Stefan',
          what: 'Freigabe des Rollenkonzepts',
          since: '2026-08-04',
          due: '2026-08-12',
        },
        { what: 'ohne wer — wird verworfen' },
      ],
      ...overrides,
    },
  });
}

const NOTE = makeDoc({
  path: 'projects/work/nyota-auth0-migration/notes/rollen.md',
  updated: '2026-08-05T10:00:00.000Z',
  project: 'nyota-auth0-migration',
  body: '- [ ] Vererbung nachlesen\n',
});

function derive(docs = [projectDoc(), NOTE], options = {}) {
  const todos = docs.flatMap((doc) =>
    parseTodos(doc.body, { path: doc.path, frontmatter: doc.frontmatter, today: TODAY }),
  );
  return deriveProjects(docs, todos, { now: TODAY, ...options });
}

describe('deriveProjects: Frontmatter lesen', () => {
  it('uebernimmt die Felder und prueft `waiting_on` Eintrag fuer Eintrag', () => {
    const [project] = derive();
    expect(project).toMatchObject({
      path: 'projects/work/nyota-auth0-migration/project.md',
      slug: 'nyota-auth0-migration',
      title: 'Nyota Auth0 Migration',
      scope: 'work',
      status: 'active',
      priority: 2,
      deadline: '2026-09-01',
      nextStep: 'Rückmeldung von Stefan einarbeiten',
      modules: ['identity-management'],
      repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure'],
    });
    expect(project?.waitingOn).toEqual([
      {
        who: 'Stefan',
        what: 'Freigabe des Rollenkonzepts',
        since: '2026-08-04',
        due: '2026-08-12',
        resolved: false,
      },
    ]);
  });

  it('faellt auf verlaessliche Werte zurueck, wenn das Frontmatter Unsinn enthaelt', () => {
    const [project] = derive([
      projectDoc({ status: 'irgendwas', priority: 'zwei', deadline: 42, favorite: 'ja' }),
    ]);
    expect(project?.status).toBe('active');
    expect(project?.priority).toBe(3);
    expect(project?.deadline).toBeNull();
    expect(project?.favorite).toBe(false);
  });

  it('liest `favorite: true`, eine fehlende Angabe wird zu `false`', () => {
    const [favorite] = derive([projectDoc({ favorite: true })]);
    expect(favorite?.favorite).toBe(true);

    const [ohneAngabe] = derive([projectDoc()]);
    expect(ohneAngabe?.favorite).toBe(false);
  });
});

describe('deriveProjects: Ableitungen', () => {
  it('nimmt als lastTouch die juengste Datei im Projektordner', () => {
    const [project] = derive();
    expect(project?.lastTouch).toBe('2026-08-05T10:00:00.000Z');
    expect(project?.lastTouchSource).toBe('file');
    expect(project?.ageDays).toBe(5);
  });

  it('zaehlt Todos des ganzen Projektordners, offene getrennt', () => {
    const [project] = derive();
    expect(project?.todoCount).toBe(3);
    expect(project?.openTodoCount).toBe(2);
  });

  it('meldet stagnierend erst ab der Schwelle und nie bei fertigen Projekten', () => {
    expect(derive(undefined, { staleAfterDays: 14 })[0]?.stale).toBe(false);
    expect(derive(undefined, { staleAfterDays: 5 })[0]?.stale).toBe(true);
    const done = derive([projectDoc({ status: 'done' }), NOTE], { staleAfterDays: 5 });
    expect(done[0]?.stale).toBe(false);
  });

  it('nimmt den ersten Absatz unter „## Stand" als Wiedereinstiegspunkt', () => {
    expect(derive()[0]?.excerpt).toBe(
      'Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten.',
    );
  });
});

describe('deriveProjects: externalTouches', () => {
  const touch = (at: string): Map<string, ExternalTouch> =>
    new Map([['nyota-auth0-migration', { at, source: 'claude-session' as const }]]);

  it('eine juengere Claude-Session ueberschreibt lastTouch und die Quelle', () => {
    const [project] = derive(undefined, { externalTouches: touch('2026-08-09T12:00:00.000Z') });
    expect(project?.lastTouch).toBe('2026-08-09T12:00:00.000Z');
    expect(project?.lastTouchSource).toBe('claude-session');
    expect(project?.ageDays).toBe(1);
  });

  it('eine aeltere Spur laesst die Dateiaenderung stehen', () => {
    const [project] = derive(undefined, { externalTouches: touch('2026-07-01T12:00:00.000Z') });
    expect(project?.lastTouch).toBe('2026-08-05T10:00:00.000Z');
    expect(project?.lastTouchSource).toBe('file');
  });
});

describe('deriveProjects: status_set/next_step_set', () => {
  it('ohne Frontmatter-Eintraege bleiben statusSet/nextStepSet undefined und nextStepStale false', () => {
    const [project] = derive();
    expect(project?.statusSet).toBeUndefined();
    expect(project?.nextStepSet).toBeUndefined();
    expect(project?.nextStepStale).toBe(false);
  });

  it('next_step_set am oder nach lastTouch ist frisch', () => {
    // lastTouch ist die juengste Datei im Ordner: 2026-08-05T10:00:00.000Z (NOTE).
    const [project] = derive([
      projectDoc({ next_step_set: { at: '2026-08-05', by: 'user' } }),
      NOTE,
    ]);
    expect(project?.nextStepSet).toEqual({ at: '2026-08-05', by: 'user' });
    expect(project?.nextStepStale).toBe(false);
  });

  it('next_step_set vor lastTouch (Dateiaenderung) ist veraltet', () => {
    const [project] = derive([
      projectDoc({ next_step_set: { at: '2026-08-01', by: 'suggestion' } }),
      NOTE,
    ]);
    // lastTouch bleibt die Dateiaenderung der NOTE (2026-08-05), next_step_set liegt davor.
    expect(project?.lastTouchSource).toBe('file');
    expect(project?.nextStepStale).toBe(true);
  });

  it('next_step_set vor einer externen Spur (Claude-Session) ist veraltet', () => {
    const touch: Map<string, ExternalTouch> = new Map([
      ['nyota-auth0-migration', { at: '2026-08-09T12:00:00.000Z', source: 'claude-session' }],
    ]);
    const [project] = derive(
      [projectDoc({ next_step_set: { at: '2026-08-01', by: 'filing' } }), NOTE],
      { externalTouches: touch },
    );
    expect(project?.lastTouchSource).toBe('claude-session');
    expect(project?.nextStepStale).toBe(true);
  });

  it('ein unbekannter `by`-Wert verwirft die ganze Map, statt sie halb zu vertrauen', () => {
    const [project] = derive([
      projectDoc({ status_set: { at: '2026-08-01', by: 'robot' } }),
      NOTE,
    ]);
    expect(project?.statusSet).toBeUndefined();
  });

  /* `deriveProjects` liest nur `docs`/`todos`/`options` — kein verstecktes Gedaechtnis.
     Das Loeschen und Neuaufbauen von `.secondbrain/index/` ruft also nur denselben
     Code mit denselben Dateien noch einmal auf; ein zweiter Aufruf mit identischen
     Eingaben muss deshalb Zeichen fuer Zeichen dasselbe liefern. */
  it('liefert bei erneutem Aufruf mit denselben Eingaben dieselbe Herkunft (Index-Neuaufbau)', () => {
    const docs = [
      projectDoc({
        status_set: { at: '2026-08-01', by: 'suggestion' },
        next_step_set: { at: '2026-08-01', by: 'filing' },
      }),
      NOTE,
    ];
    const first = derive(docs);
    const second = derive(docs);

    expect(second).toEqual(first);
    expect(first[0]?.statusSet).toEqual({ at: '2026-08-01', by: 'suggestion' });
    expect(first[0]?.nextStepSet).toEqual({ at: '2026-08-01', by: 'filing' });
  });
});

describe('projectExcerpt', () => {
  it('nimmt den ersten Absatz, wenn es keinen Abschnitt „Stand" gibt', () => {
    const body = ['Der Keller ist ausgeräumt.', '', '## Todos', '', '- [ ] messen'].join('\n');
    expect(projectExcerpt(body)).toBe('Der Keller ist ausgeräumt.');
  });

  it('gibt eine leere Zeichenkette zurueck, wenn nichts da ist', () => {
    expect(projectExcerpt('')).toBe('');
  });
});

describe('projectTitles', () => {
  it('bildet Slug auf Titel ab, damit Todos ihren Projektnamen kennen', () => {
    expect(projectTitles(derive())).toEqual(
      new Map([['nyota-auth0-migration', 'Nyota Auth0 Migration']]),
    );
  });
});
