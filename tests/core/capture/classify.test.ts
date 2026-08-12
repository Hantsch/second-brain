/* Der Ablage-Vorschlag mit Modell. Drei Dinge müssen stimmen:

   1. Eine brauchbare Antwort schlägt die Heuristik.
   2. Eine erfundene Antwort wird verworfen — ein Projekt-Slug, den es nicht gibt,
      ist keine Einordnung.
   3. Ohne Modell (oder mit kaputter Antwort) arbeitet die App weiter und sagt es
      über `heuristic: true`. Kein Fehler nach oben.

   Kein Test geht ins Netz: alles läuft über den `FakeProvider`. */

import { beforeEach, describe, expect, it } from 'vitest';
import { classifyDump } from '@core/capture';
import type { DumpItem } from '@shared/types';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import type { FakeGatewaySetup } from '../../helpers/llm';
import { NOW_MS, TODAY } from '../../helpers/time';
import type { CaptureFixture } from './fixtures';
import {
  HOME_PROJECT_PATH,
  MODULE_SLUG,
  WORK_PROJECT,
  WORK_PROJECT_PATH,
  captureFixture,
} from './fixtures';

const DUMP_TEXT =
  'Suche über Kundennummern hängt im Kundenportal. Mit Miriam bis 15.08. durchgehen.';

let fixture: CaptureFixture;
let dump: DumpItem;

function reply(body: Record<string, unknown>): string {
  return JSON.stringify(body);
}

function setup(answer: string): FakeGatewaySetup {
  return gatewayWithReplies({ 'classify-dump': answer });
}

beforeEach(async () => {
  fixture = await captureFixture();
  dump = await fixture.dump(DUMP_TEXT);
});

describe('classifyDump mit Modell', () => {
  it('übernimmt eine geprüfte Antwort samt Begründung und Zuversicht', async () => {
    const { gateway, provider } = setup(
      reply({
        title: 'Kundennummern-Suche hängt',
        scope: 'work',
        tags: ['kundenportal', 'performance'],
        target: 'project',
        targetKey: WORK_PROJECT,
        section: 'Notizen',
        reason: 'Der Text beschreibt den Stand der Angebotsliste im Kundenportal.',
        confidence: 0.82,
        todos: [{ text: 'Abnahmeprotokoll mit Miriam durchgehen', due: '2026-08-15', priority: 2 }],
        waitingOn: [{ who: 'Jonas', what: 'Fallback für Sitzungen', due: '2026-08-12' }],
        entities: ['Miriam', 'Kundenportal'],
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(false);
    expect(proposal.title).toBe('Kundennummern-Suche hängt');
    expect(proposal.confidence).toBe(0.82);
    expect(proposal.reason).toContain('Angebotsliste');
    expect(proposal.primary.target).toBe('project');
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.primary.content.startsWith(`### ${TODAY}`)).toBe(true);
    expect(proposal.tags).toEqual(['kundenportal', 'performance']);
    expect(proposal.todos[0]?.due).toBe('2026-08-15');
    expect(proposal.todos[0]?.priority).toBe(2);
    expect(proposal.todos[0]?.project).toBe(WORK_PROJECT);
    expect(proposal.waitingOn[0]).toEqual({
      who: 'Jonas',
      what: 'Fallback für Sitzungen',
      since: TODAY,
      due: '2026-08-12',
    });
    expect(provider.countFor('classify-dump')).toBe(1);
  });

  it('schickt Schema, heutiges Datum und nur die nächsten Kandidaten mit', async () => {
    const { gateway, provider } = setup(
      reply({ title: 'x', scope: 'work', tags: [], target: 'inbox', reason: 'y', confidence: 0.4 }),
    );

    await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    const call = provider.lastCall('classify-dump');
    expect(call?.schema).toMatchObject({ required: expect.arrayContaining(['target']) });
    const system = call?.messages.find((turn) => turn.role === 'system')?.content ?? '';
    const user = call?.messages.find((turn) => turn.role === 'user')?.content ?? '';
    expect(system).toContain(TODAY);
    expect(system).toContain('wortwörtlich abgeschrieben');
    expect(user).toContain(WORK_PROJECT);
    expect(user).toContain(MODULE_SLUG);
    expect(user).toContain('Kundennummern');
  });

  it('legt ein neues Projekt an, wenn das Modell eines vorschlägt', async () => {
    const { gateway } = setup(
      reply({
        title: 'egal',
        scope: 'work',
        tags: [],
        target: 'new-project',
        newProjectTitle: 'Suche im Kundenportal beschleunigen',
        reason: 'Ein abgegrenztes Vorhaben mit klarem Ziel.',
        confidence: 0.7,
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.primary.target).toBe('new-project');
    expect(proposal.primary.path).toBe(
      'projects/work/suche-im-kundenportal-beschleunigen/project.md',
    );
    expect(proposal.primary.section).toBe('Stand');
    expect(proposal.title).toBe('Suche im Kundenportal beschleunigen');
  });
});

describe('classifyDump verwirft Erfindungen', () => {
  it('nimmt einen halluzinierten Projekt-Slug nicht an', async () => {
    const { gateway } = setup(
      reply({
        title: 'Erfundenes',
        scope: 'work',
        tags: ['erfunden'],
        target: 'project',
        targetKey: 'nyota-auth0-migration',
        reason: 'Gehört zur Auth0-Migration.',
        confidence: 0.95,
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.confidence).toBeLessThanOrEqual(0.6);
    // Begründung und Zuversicht gehören zum verworfenen Ziel und fallen mit ihm.
    expect(proposal.reason).toBe('Erwähnt "Kundenportal" und einen Termin am 15.08.');
    // Titel und Tags sind kein Ziel: sie stammen aus dem Text und bleiben.
    expect(proposal.title).toBe('Erfundenes');
  });

  it('nimmt ein halluziniertes Modul nicht an', async () => {
    const { gateway } = setup(
      reply({
        title: 'x',
        scope: 'work',
        tags: [],
        target: 'module',
        targetKey: 'gibt-es-nicht',
        reason: 'Wissen über Suche.',
        confidence: 0.9,
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.target).toBe('project');
  });

  it('hängt ein Todo nicht an ein Projekt, das es nicht gibt', async () => {
    const { gateway } = setup(
      reply({
        title: 'x',
        scope: 'work',
        tags: [],
        target: 'project',
        targetKey: WORK_PROJECT,
        reason: 'Passt zum Kundenportal.',
        confidence: 0.8,
        todos: [{ text: 'Interceptor zusammenlegen', project: 'gibt-es-nicht' }],
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.todos[0]?.project).toBe(WORK_PROJECT);
    expect(proposal.extras.every((extra) => extra.path !== 'gibt-es-nicht')).toBe(true);
  });

  it('lässt eine erfundene Frist nicht durch', async () => {
    const { gateway } = setup(
      reply({
        title: 'x',
        scope: 'work',
        tags: [],
        target: 'project',
        targetKey: WORK_PROJECT,
        reason: 'Passt zum Kundenportal.',
        confidence: 0.8,
        todos: [{ text: 'Irgendwann prüfen', due: 'bald' }],
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.todos[0]?.due).toBeNull();
  });

  it('lässt einen Dump liegen, wenn das Modell inbox wählt', async () => {
    const { gateway } = setup(
      reply({
        title: 'Unklar',
        scope: 'work',
        tags: [],
        target: 'inbox',
        reason: 'Nicht klar genug für ein Ziel.',
        confidence: 0.3,
      }),
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(false);
    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.primary.path).toBe(dump.path);
  });
});

describe('classifyDump ohne brauchbares Modell', () => {
  it('greift bei kaputtem JSON auf die Heuristik zurück', async () => {
    const { gateway } = setup('Hier ist das Ergebnis: {"title": "x", "target": ');

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.reason).toContain('Kundenportal');
  });

  it('verzeiht eine Antwort in Code-Zäunen', async () => {
    const { gateway } = setup(
      '```json\n' +
        reply({
          title: 'Aus dem Zaun',
          scope: 'work',
          tags: [],
          target: 'project',
          targetKey: WORK_PROJECT,
          reason: 'Passt zum Kundenportal.',
          confidence: 0.6,
        }) +
        '\n```',
    );

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(false);
    expect(proposal.title).toBe('Aus dem Zaun');
  });

  it('arbeitet ohne Route weiter und sagt es', async () => {
    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway: emptyGateway(), now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.todos).toHaveLength(1);
  });

  it('fragt ohne Route gar kein Modell', async () => {
    const { provider } = setup('{}');
    await classifyDump(
      { store: fixture.store, index: fixture.index, gateway: emptyGateway(), now: NOW_MS },
      dump.path,
    );

    expect(provider.callCount).toBe(0);
  });

  it('greift bei einem Provider-Fehler auf die Heuristik zurück', async () => {
    const { gateway, provider } = setup('{}');
    provider.fail('classify-dump', 'Modell überlastet');

    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
      dump.path,
    );

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
  });

  it('meldet einen fehlenden Dump als Fehler, statt etwas zu erfinden', async () => {
    const { gateway } = setup('{}');
    await expect(
      classifyDump(
        { store: fixture.store, index: fixture.index, gateway, now: NOW_MS },
        'inbox/gibt-es-nicht.md',
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('ordnet einen privaten Dump ohne Modell dem privaten Projekt zu', async () => {
    const home = await fixture.dump(
      'Bretter fürs Hochbeet auf Länge sägen, Noppenfolie fehlt noch.',
    );
    const proposal = await classifyDump(
      { store: fixture.store, index: fixture.index, gateway: emptyGateway(), now: NOW_MS },
      home.path,
    );

    expect(proposal.primary.path).toBe(HOME_PROJECT_PATH);
    expect(proposal.scope).toBe('private');
  });
});
