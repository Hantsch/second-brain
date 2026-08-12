import { describe, expect, it } from 'vitest';
import { heuristicStatus, suggestProjectStatus } from '@core/overview';
import { createEmptyGateway, createFakeGateway } from '../../fakes/llm';
import { NOW, TODAY, day, indexFrom, journalDoc, projectDoc, session, stamp } from './fixtures';

const LIMITS = { staleAfterDays: 14, deadlineHorizonDays: 14, waitingNudgeDays: 5 };

function todoBody(...lines: string[]): string {
  return ['## Stand', '', 'Der Testmandant wartet.', '', '## Todos', '', ...lines, ''].join('\n');
}

const WAITING = indexFrom([
  projectDoc({
    slug: 'nyota',
    title: 'Nyota Auth0 Migration',
    waitingOn: [{ who: 'Stefan', what: 'Freigabe des Rollenkonzepts', since: day(-8) }],
    body: todoBody('- [ ] Rollen-Mapping dokumentieren'),
  }),
]);

const STALE = indexFrom(
  [
    projectDoc({
      slug: 'kundenportal',
      updated: stamp(-30),
      body: todoBody(`- [ ] Ladezeiten messen @due:${day(-2)}`, '- [ ] Doku schreiben'),
    }),
  ],
  { now: NOW },
);

describe('suggestProjectStatus ohne Modell', () => {
  it('schlaegt waiting vor, wenn eine Antwort offen ist — mit Beleg', async () => {
    const result = await suggestProjectStatus(
      { index: WAITING, gateway: createEmptyGateway(), today: TODAY, settings: LIMITS },
      'nyota',
    );
    expect(result).toMatchObject({
      status: 'waiting',
      nextStep: 'Rollen-Mapping dokumentieren',
      heuristic: true,
    });
    expect(result?.reason).toContain('Stefan');
    /* Dass kein Modell beteiligt war, sagt `heuristic` — nicht ein Satz im
       `reason`. Der Kern kennt die Sprache der Oberflaeche nicht; die Aussage
       gehoert in die i18n-Dateien (`project.suggest.heuristic`). */
    expect(result?.reason).not.toContain('Modell');
  });

  it('schlaegt paused vor, wenn lange nichts passiert ist und Todos offen sind', async () => {
    const result = await suggestProjectStatus(
      { index: STALE, gateway: createEmptyGateway(), today: TODAY, settings: LIMITS },
      'kundenportal',
    );
    expect(result).toMatchObject({
      status: 'paused',
      // Das erste offene Todo ist das mit der naechsten Frist.
      nextStep: 'Ladezeiten messen',
      heuristic: true,
    });
    expect(result?.reason).toContain('30 Tagen');
  });

  it('laesst den Status stehen, wenn nichts liegt und nichts offen ist', async () => {
    const index = indexFrom([projectDoc({ slug: 'leer', status: 'idea', updated: stamp(-40) })], {
      now: NOW,
    });
    const result = await suggestProjectStatus(
      { index, gateway: createEmptyGateway(), today: TODAY, settings: LIMITS },
      'leer',
    );
    expect(result).toMatchObject({ status: 'idea', nextStep: '', heuristic: true });
    expect(result?.reason).toContain('kein offenes Todo');
  });

  it('schlaegt active vor, wenn es eine frische Spur gibt', async () => {
    const index = indexFrom([
      projectDoc({
        slug: 'frisch',
        status: 'paused',
        updated: stamp(-1),
        body: todoBody('- [ ] Weiterbauen'),
      }),
    ]);
    const result = await suggestProjectStatus(
      { index, gateway: createEmptyGateway(), today: TODAY, settings: LIMITS },
      'frisch',
    );
    expect(result?.status).toBe('active');
  });

  it('macht aus einem fertigen Projekt kein laufendes', async () => {
    const index = indexFrom([projectDoc({ slug: 'fertig', status: 'done', updated: stamp(0) })]);
    const result = await suggestProjectStatus(
      { index, gateway: createEmptyGateway(), today: TODAY },
      'fertig',
    );
    expect(result?.status).toBe('done');
  });

  it('gibt null zurueck, wenn es das Projekt nicht gibt', async () => {
    const result = await suggestProjectStatus(
      { index: WAITING, gateway: createEmptyGateway(), today: TODAY },
      'gibt-es-nicht',
    );
    expect(result).toBeNull();
  });

  it('rechnet dieselbe Heuristik auch ohne Gateway-Aufruf', () => {
    const project = STALE.projects()[0]!;
    const direct = heuristicStatus(project, STALE.todos(), TODAY, 14);
    expect(direct.status).toBe('paused');
  });
});

describe('suggestProjectStatus mit Modell', () => {
  it('nimmt den Vorschlag des Modells und schickt den Kontext mit', async () => {
    const { gateway, provider } = createFakeGateway({
      replies: {
        'project-status': JSON.stringify({
          status: 'waiting',
          nextStep: 'Bei Stefan nachfassen',
          reason: 'Stefan antwortet seit dem 2. August nicht.',
        }),
      },
    });
    const index = indexFrom([
      projectDoc({
        slug: 'nyota',
        title: 'Nyota Auth0 Migration',
        waitingOn: [{ who: 'Stefan', what: 'Freigabe', since: day(-8) }],
        body: todoBody('- [ ] Rollen-Mapping dokumentieren'),
      }),
      journalDoc(-1, { projects: ['nyota'], body: '## Tag\n\nStefan war krank.\n' }),
    ]);

    const result = await suggestProjectStatus(
      {
        index,
        gateway,
        sessions: [session({ vaultProject: 'nyota', summary: 'Rollen-Mapping begonnen' })],
        today: TODAY,
        settings: LIMITS,
      },
      'nyota',
    );

    expect(result).toEqual({
      status: 'waiting',
      nextStep: 'Bei Stefan nachfassen',
      reason: 'Stefan antwortet seit dem 2. August nicht.',
      heuristic: false,
    });

    const call = provider.lastCall('project-status');
    const sent = call?.messages.map((message) => message.content).join('\n') ?? '';
    expect(sent).toContain('Nyota Auth0 Migration');
    expect(sent).toContain('Rollen-Mapping dokumentieren');
    expect(sent).toContain('Stefan war krank');
    expect(sent).toContain('Rollen-Mapping begonnen');
    expect(call?.schema).not.toBeNull();
  });

  it('verwirft einen Status, den es nicht gibt, und behaelt die Heuristik', async () => {
    const { gateway } = createFakeGateway({
      replies: {
        'project-status': JSON.stringify({
          status: 'ganz-neu',
          nextStep: 'Irgendwas',
          reason: 'Weil.',
        }),
      },
    });
    const result = await suggestProjectStatus(
      { index: WAITING, gateway, today: TODAY, settings: LIMITS },
      'nyota',
    );
    expect(result?.status).toBe('waiting');
    expect(result?.heuristic).toBe(true);
    /* Der Beleg bleibt stehen; die Aussage ueber das Verfahren traegt `heuristic`. */
    expect(result?.reason).toContain('Stefan');
  });

  it('verwirft eine Antwort ohne Begruendung — ein Vorschlag ohne Grund ist keiner', async () => {
    const { gateway } = createFakeGateway({
      replies: { 'project-status': JSON.stringify({ status: 'done', nextStep: 'Nichts' }) },
    });
    const result = await suggestProjectStatus(
      { index: WAITING, gateway, today: TODAY, settings: LIMITS },
      'nyota',
    );
    expect(result?.heuristic).toBe(true);
    expect(result?.status).toBe('waiting');
  });

  it('faellt bei kaputtem JSON auf die Heuristik zurueck', async () => {
    const { gateway } = createFakeGateway({ replies: { 'project-status': 'kein json' } });
    const result = await suggestProjectStatus(
      { index: WAITING, gateway, today: TODAY, settings: LIMITS },
      'nyota',
    );
    expect(result?.heuristic).toBe(true);
  });

  it('faellt bei einem Provider-Fehler auf die Heuristik zurueck', async () => {
    const { gateway } = createFakeGateway({
      errors: { 'project-status': 'Modell überlastet' },
    });
    const result = await suggestProjectStatus(
      { index: WAITING, gateway, today: TODAY, settings: LIMITS },
      'nyota',
    );
    expect(result?.heuristic).toBe(true);
    expect(result?.status).toBe('waiting');
  });

  it('nimmt das erste offene Todo, wenn das Modell keinen naechsten Schritt nennt', async () => {
    const { gateway } = createFakeGateway({
      replies: {
        'project-status': JSON.stringify({
          status: 'active',
          nextStep: '   ',
          reason: 'Es geht voran.',
        }),
      },
    });
    const result = await suggestProjectStatus(
      { index: WAITING, gateway, today: TODAY, settings: LIMITS },
      'nyota',
    );
    expect(result).toMatchObject({
      status: 'active',
      nextStep: 'Rollen-Mapping dokumentieren',
      heuristic: false,
    });
  });
});
