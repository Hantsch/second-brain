/* Todos, Fristen und Warte-auf aus Text. Die API ist neutral (Text rein, Listen
   raus), weil auch der Tagesabschluss diesen Weg nimmt.

   Beide Wege werden geprüft: mit Modell (FakeProvider) und ohne. */

import { describe, expect, it } from 'vitest';
import { extractTasks, heuristicTasks } from '@core/capture';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { day, TODAY } from '../../helpers/time';

const TEXT = [
  'Der Testlauf lief durch.',
  'Ich muss noch das Abnahmeprotokoll mit Miriam durchgehen, bis 15.08.',
  'Warte auf Jonas wegen des Fallbacks.',
  '- Ladezeiten messen',
].join('\n');

describe('heuristicTasks', () => {
  it('nimmt Absichten, Listenpunkte und Fristen — und lässt Berichte liegen', () => {
    const { todos, waitingOn, heuristic } = heuristicTasks(TEXT, { now: TODAY, scope: 'work' });

    expect(heuristic).toBe(true);
    expect(todos.map((todo) => todo.text)).toEqual([
      'Das Abnahmeprotokoll mit Miriam durchgehen, bis 15.08',
      'Ladezeiten messen',
    ]);
    expect(todos[0]?.due).toBe('2026-08-15');
    expect(todos[0]?.scope).toBe('work');
    expect(waitingOn[0]?.who).toBe('Jonas');
  });

  it('nimmt abgehakte Zeilen nicht als offene Aufgabe', () => {
    const { todos } = heuristicTasks('- [x] Bilder auf WebP umgestellt\n- [ ] Rest prüfen', {
      now: TODAY,
    });

    expect(todos.map((todo) => todo.text)).toEqual(['Rest prüfen']);
  });

  it('macht aus einem Gefühlssatz keine Aufgabe', () => {
    const { todos } = heuristicTasks('Ich fühle mich überfordert und müde.', { now: TODAY });
    expect(todos).toEqual([]);
  });

  it('hängt jede Aufgabe an das mitgegebene Projekt', () => {
    const { todos } = heuristicTasks('Bretter auf Länge sägen.', {
      now: TODAY,
      scope: 'private',
      project: 'hochbeet-bauen',
    });

    expect(todos[0]?.project).toBe('hochbeet-bauen');
    expect(todos[0]?.scope).toBe('private');
  });

  it('führt dieselbe Aufgabe nur einmal', () => {
    const { todos } = heuristicTasks('- Kaffee kaufen\n- Kaffee kaufen', { now: TODAY });
    expect(todos).toHaveLength(1);
  });

  it('ist bei leerem Text leer, statt etwas zu erfinden', () => {
    expect(heuristicTasks('   ', { now: TODAY })).toEqual({
      todos: [],
      waitingOn: [],
      heuristic: true,
    });
  });

  it('heuristicTasks extracts an English todo with its deadline', () => {
    const { todos } = heuristicTasks('Call the dentist tomorrow.', {
      now: TODAY,
      languages: ['en', 'de'],
    });

    expect(todos.map((todo) => todo.text)).toEqual(['Call the dentist tomorrow']);
    expect(todos[0]?.due).toBe(day(1));
  });
});

describe('extractTasks', () => {
  it('übernimmt eine geprüfte Modellantwort', async () => {
    const { gateway, provider } = gatewayWithReplies({
      'extract-tasks': JSON.stringify({
        todos: [
          {
            text: 'Abnahmeprotokoll mit Miriam durchgehen',
            due: '2026-08-15',
            priority: 2,
            project: 'kundenportal-relaunch',
          },
        ],
        waitingOn: [{ who: 'Jonas', what: 'Fallback für Sitzungen', due: '2026-08-12' }],
      }),
    });

    const result = await extractTasks(
      {
        gateway,
        now: TODAY,
        scope: 'work',
        projects: [{ slug: 'kundenportal-relaunch', title: 'Kundenportal Relaunch' }],
      },
      TEXT,
    );

    expect(result.heuristic).toBe(false);
    expect(result.todos).toEqual([
      {
        text: 'Abnahmeprotokoll mit Miriam durchgehen',
        scope: 'work',
        due: '2026-08-15',
        waitingFor: null,
        priority: 2,
        project: 'kundenportal-relaunch',
      },
    ]);
    expect(result.waitingOn[0]?.since).toBe(TODAY);
    const system = provider.lastCall('extract-tasks')?.messages[0]?.content ?? '';
    expect(system).toContain(TODAY);
    expect(system).toContain('kundenportal-relaunch');
  });

  it('wirft ein erfundenes Projekt weg', async () => {
    const { gateway } = gatewayWithReplies({
      'extract-tasks': JSON.stringify({
        todos: [{ text: 'Irgendwas', project: 'gibt-es-nicht' }],
        waitingOn: [],
      }),
    });

    const result = await extractTasks(
      { gateway, now: TODAY, project: 'kundenportal-relaunch' },
      TEXT,
    );

    expect(result.todos[0]?.project).toBe('kundenportal-relaunch');
  });

  it('lässt Einträge ohne Text und ohne Person weg', async () => {
    const { gateway } = gatewayWithReplies({
      'extract-tasks': JSON.stringify({
        todos: [{ text: '  ' }, { due: '2026-08-15' }],
        waitingOn: [{ who: 'Jonas' }, { what: 'nur eine Sache' }],
      }),
    });

    const result = await extractTasks({ gateway, now: TODAY }, TEXT);

    expect(result.todos).toEqual([]);
    expect(result.waitingOn).toEqual([]);
  });

  it('greift bei kaputtem JSON auf die Heuristik zurück', async () => {
    const { gateway } = gatewayWithReplies({ 'extract-tasks': 'kein JSON, sorry' });

    const result = await extractTasks({ gateway, now: TODAY, scope: 'work' }, TEXT);

    expect(result.heuristic).toBe(true);
    expect(result.todos.length).toBeGreaterThan(0);
  });

  it('arbeitet ohne Route weiter und sagt es', async () => {
    const result = await extractTasks({ gateway: emptyGateway(), now: TODAY, scope: 'work' }, TEXT);

    expect(result.heuristic).toBe(true);
    expect(result.todos.map((todo) => todo.text)).toContain('Ladezeiten messen');
  });

  it('fragt bei leerem Text kein Modell', async () => {
    const { gateway, provider } = gatewayWithReplies({ 'extract-tasks': '{}' });
    const result = await extractTasks({ gateway, now: TODAY }, '   ');

    expect(provider.callCount).toBe(0);
    expect(result.todos).toEqual([]);
  });
});
