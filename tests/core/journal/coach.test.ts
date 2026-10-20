/* Der Coach. Fünf Dinge, an denen dieser Screen scheitern könnte, und deshalb
   hier festgenagelt:

   1. **„Zuhören" fragt kein Modell.** Der Satz wird als Prosa abgelegt, das
      Gateway bleibt unberührt (nachgewiesen, nicht behauptet: `watchGateway`),
      und das ist ein Erfolg — kein „kein Modell konfiguriert".
   2. **Die eigenen Worte stehen in der Datei, bevor das Modell gefragt wird.**
      Geprüft von innen: der Fake-Provider liest die Datei im Moment des Aufrufs.
   3. **Die Antwort wird unverändert protokolliert** — als Antwortblock im
      Tagesstrom, nie in die eigene Prosa gemischt.
   4. **`analyze` belegt mit Daten** und zieht höchstens fünf frühere Tage heran,
      nie den heutigen und nie einen späteren; `tips` zieht keine.
   5. **Ohne Modell** wird der Eintrag geschrieben, `noModel` gesetzt und **keine**
      Antwort erfunden — im Strom steht dann kein Antwortblock. */

import { describe, expect, it } from 'vitest';
import { JournalError, coach, earlierDays, parseStream } from '@core/journal';
import type { JournalBlock } from '@core/journal';
import type { CoachRequest } from '@shared/types';
import {
  createFakeGateway,
  emptyGateway,
  gatewayWithReplies,
  watchGateway,
} from '../../helpers/llm';
import { NOW_MS } from '../../helpers/time';
import { DAY, DAY_PATH, journalFile, journalFixture, journalPathOf } from './fixtures';

const REPLY = 'Das klingt nach einem Tag, an dem viel auf dir lag.';
const MESSAGE = 'Der Sprint fühlt sich unmöglich an.';

function ask(patch: Partial<CoachRequest> = {}): CoachRequest {
  return {
    mode: 'tips',
    date: DAY,
    message: MESSAGE,
    useHistory: false,
    ...patch,
  };
}

/** Der Rumpf einer Tagesdatei, so wie `parseStream` ihn liest. */
function bodyOf(content: string): string {
  return content.slice(content.indexOf('\n---\n', 4) + 5);
}

/** Die Blöcke des Abschnitts „Tag" — Prosa und Antwortblöcke in Schreibreihenfolge. */
function streamOf(content: string): JournalBlock[] {
  return parseStream(bodyOf(content));
}

function answersIn(content: string): JournalBlock[] {
  return streamOf(content).filter((block) => block.kind === 'answer');
}

/** Sieben frühere Tage mit demselben Thema, dazu ein späterer — zum Ausschließen. */
function stressfulWeek(): Record<string, string> {
  const files: Record<string, string> = {};
  for (let day = 1; day <= 7; day += 1) {
    const date = `2026-08-0${day}`;
    files[journalPathOf(date)] = journalFile(
      date,
      `Wieder Stress mit der Abnahme im Kundenportal, Tag ${day}.`,
      { mood: 2 },
    );
  }
  files[journalPathOf('2026-08-10')] = journalFile(
    '2026-08-10',
    'Später Stress mit der Abnahme im Kundenportal.',
  );
  return files;
}

describe('coach: zuhören', () => {
  it('legt den Satz als Prosa ab und fasst das Gateway nicht an', async () => {
    const fixture = await journalFixture();
    /* Ein Gateway, das antworten *könnte* — es darf trotzdem nicht gefragt werden. */
    const watched = watchGateway(gatewayWithReplies({ 'journal-chat': REPLY }).gateway);

    const result = await coach(fixture.deps(watched.gateway), ask({ mode: 'listen' }));

    expect(watched.calls).toEqual([]);
    /* Kein Modell gewollt heißt nicht „kein Modell da": das ist ein Erfolg. */
    expect(result).toMatchObject({
      mode: 'listen',
      reply: '',
      noModel: false,
      failure: null,
      usedLlm: false,
      model: null,
      earlier: [],
      path: DAY_PATH,
    });
    expect(result.hash.length).toBeGreaterThan(10);

    const content = await fixture.text(DAY_PATH);
    /* Im Strom unter „Tag", als Prosa — nicht als Zitatblock. */
    const blocks = streamOf(content);
    expect(blocks.every((block) => block.kind === 'entry')).toBe(true);
    expect(blocks.at(-1)?.text).toContain(MESSAGE);
    /* Eine eigene Zeile ohne '>' — der Fixture-Tag zitiert denselben Satz im
       Alt-Abschnitt, deshalb wird hier auf die unzitierte Zeile geprüft. */
    expect(content).toContain(`\n${MESSAGE}\n`);
    /* Die eine Antwort aus dem Bestand bleibt die einzige in der Datei. */
    expect(content.split('> **Second Brain**')).toHaveLength(2);
  });

  it('legt auch ohne konfiguriertes Modell ab: kein Fehler, kein toter Zustand', async () => {
    const fixture = await journalFixture();
    const watched = watchGateway(emptyGateway());

    const result = await coach(fixture.deps(watched.gateway), ask({ mode: 'listen' }));

    expect(watched.calls).toEqual([]);
    expect(result.noModel).toBe(false);
    expect(result.failure).toBeNull();
    expect(await fixture.text(DAY_PATH)).toContain(MESSAGE);
  });

  it('nimmt keine leere Runde an', async () => {
    const fixture = await journalFixture();
    const watched = watchGateway(gatewayWithReplies({ 'journal-chat': REPLY }).gateway);
    const before = await fixture.text(DAY_PATH);

    await expect(
      coach(fixture.deps(watched.gateway), ask({ mode: 'listen', message: '   ' })),
    ).rejects.toThrow(JournalError);
    await expect(
      coach(fixture.deps(watched.gateway), ask({ mode: 'tips', message: '   ' })),
    ).rejects.toThrow(JournalError);

    expect(await fixture.text(DAY_PATH)).toBe(before);
    expect(watched.calls).toEqual([]);
  });
});

describe('coach: Tipps und Analyse', () => {
  it('hat meinen Satz in der Datei, bevor das Modell gefragt wird', async () => {
    const fixture = await journalFixture();
    /* Von innen geprüft: der Provider liest die Datei im Moment des Aufrufs. */
    const atCall: Promise<string>[] = [];
    const { gateway, provider } = createFakeGateway({
      replies: {
        'journal-chat': () => {
          atCall.push(fixture.text(DAY_PATH));
          return REPLY;
        },
      },
    });

    await coach(fixture.deps(gateway), ask());

    expect(provider.countFor('journal-chat')).toBe(1);
    expect(atCall).toHaveLength(1);
    const seen = (await Promise.all(atCall)).join('\n');
    expect(seen).toContain(MESSAGE);
    /* Und die Antwort steht zu diesem Zeitpunkt noch nirgends. */
    expect(seen).not.toContain(REPLY);
  });

  it('hängt die Antwort wortwörtlich als Antwortblock in den Tagesstrom', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': REPLY });

    const result = await coach(fixture.deps(gateway), ask());

    expect(result).toMatchObject({ reply: REPLY, noModel: false, failure: null, usedLlm: true });
    expect(result.model).not.toBeNull();

    const content = await fixture.text(DAY_PATH);
    expect(content).toContain(`> **Gaston** — 14:32\n> ${REPLY}`);
    /* Meine Prosa zuerst, die Antwort darunter — und nichts vermischt. */
    const blocks = streamOf(content);
    expect(blocks.map((block) => block.kind)).toEqual(['entry', 'answer']);
    expect(blocks[0]?.text).toContain(MESSAGE);
    expect(blocks[1]?.text).toBe(REPLY);
  });

  it('schickt Haltung, bisherigen Eintrag und die Runden des Tages mit', async () => {
    const fixture = await journalFixture();
    const { gateway, provider } = gatewayWithReplies({ 'journal-chat': REPLY });

    await coach(fixture.deps(gateway), ask());

    const call = provider.lastCall('journal-chat');
    expect(call?.streamed).toBe(true);
    const system = call?.messages.find((turn) => turn.role === 'system')?.content ?? '';
    expect(system).toContain('konkret helfen');
    expect(system).toContain('höchstens drei Vorschläge');
    const user = call?.messages.at(-1)?.content ?? '';
    expect(user).toContain('Vormittag im Testsystem');
    expect(user.endsWith(MESSAGE)).toBe(true);
    /* Der Fixture-Tag ist ein Alt-Tag: seine „Gespräch"-Runden stehen als eigene
       Turns davor, danach der Strom unter „Tag". */
    expect(call?.messages.map((turn) => turn.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'user',
    ]);
  });

  it('sieht in der zweiten Runde die Antwort der ersten', async () => {
    /* Ohne Bestand: ein Tag im neuen Format, ganz ohne „Gespräch"-Abschnitt. */
    const fixture = await journalFixture({ sample: false });
    const first = 'Zwei Punkte offen, beide warten auf andere.';
    const { gateway, provider } = gatewayWithReplies({ 'journal-chat': first });

    await coach(fixture.deps(gateway), ask({ message: 'Der Tag war zäh.' }));
    provider.setReply('journal-chat', REPLY);
    await coach(fixture.deps(gateway), ask({ message: 'Und jetzt noch eine Absage.' }));

    const call = provider.lastCall('journal-chat');
    expect(call?.messages.map((turn) => turn.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    /* Der Kern des Tests: die erste Antwort ist als Vorgeschichte dabei. Ohne sie
       würde die zweite Runde dieselben Vorschläge wieder aufschreiben. */
    expect(call?.messages.find((turn) => turn.role === 'assistant')?.content).toBe(first);
    expect(call?.messages[1]?.content).toContain('Der Tag war zäh.');

    const content = await fixture.text(DAY_PATH);
    expect(answersIn(content).map((block) => block.text)).toEqual([first, REPLY]);
  });

  it('streamt die Antwort in Stücken', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': REPLY });
    const deltas: string[] = [];

    await coach(fixture.deps(gateway, { onDelta: (delta) => deltas.push(delta) }), ask());

    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join('')).toBe(REPLY);
  });

  it('legt den Tageseintrag an, wenn es ihn noch nicht gibt', async () => {
    const fixture = await journalFixture({ sample: false });
    const { gateway } = gatewayWithReplies({ 'journal-chat': REPLY });

    const result = await coach(fixture.deps(gateway), ask({ date: '2026-08-12' }));

    expect(result.path).toBe('journal/2026/08/2026-08-12.md');
    const content = await fixture.text(result.path);
    expect(content).toContain('title: Mittwoch, 12. August 2026');
    expect(streamOf(content).map((block) => block.kind)).toEqual(['entry', 'answer']);
  });
});

describe('coach: Absturz nach dem Schreiben', () => {
  it('lässt die eigenen Worte stehen, wenn der Modellaufruf wirft', async () => {
    const fixture = await journalFixture();
    const { gateway, provider } = gatewayWithReplies({ 'journal-chat': REPLY });
    provider.fail('journal-chat', 'Modell überlastet');

    const result = await coach(fixture.deps(gateway), ask());

    /* Der Ausfall ist ein Zustand mit Grund, keine erfundene Antwort. */
    expect(result.noModel).toBe(true);
    expect(result.reply).toBe('');
    expect(result.failure?.reason).toBe('error');
    expect(result.failure?.task).toBe('journal-chat');
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain(MESSAGE);
    /* Kein Antwortblock im Strom, und keine neue Runde im Alt-Abschnitt. */
    expect(answersIn(content)).toEqual([]);
    expect(content.split('> **Second Brain**')).toHaveLength(2);
  });

  it('gibt einen Abbruch des Nutzers weiter, ohne die Runde zu verlieren', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': REPLY });
    const controller = new AbortController();
    controller.abort();

    await expect(
      coach(fixture.deps(gateway, { signal: controller.signal }), ask()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain(MESSAGE);
    expect(answersIn(content)).toEqual([]);
  });

  it('protokolliert eine leere Modellantwort nicht', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': '   ' });

    const result = await coach(fixture.deps(gateway), ask());

    expect(result.reply).toBe('');
    expect(result.usedLlm).toBe(true);
    expect(result.noModel).toBe(true);
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain(MESSAGE);
    expect(answersIn(content)).toEqual([]);
    expect(content.split('> **Second Brain**')).toHaveLength(2);
  });
});

describe('coach: ohne Modell', () => {
  it('schreibt den Eintrag, meldet noModel und erfindet keine Antwort', async () => {
    const fixture = await journalFixture();

    const result = await coach(fixture.deps(emptyGateway()), ask());

    expect(result.noModel).toBe(true);
    expect(result.usedLlm).toBe(false);
    expect(result.reply).toBe('');
    expect(result.model).toBeNull();
    expect(result.failure?.reason).toBe('no-route');
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain(MESSAGE);
    expect(answersIn(content)).toEqual([]);
    expect(content.split('> **Second Brain**')).toHaveLength(2);
  });

  it('legt im Modus analyze die gefundenen früheren Tage als Belege bei', async () => {
    const fixture = await journalFixture({ sample: false, files: stressfulWeek() });

    const result = await coach(
      fixture.deps(emptyGateway()),
      ask({
        date: '2026-08-09',
        mode: 'analyze',
        useHistory: true,
        message: 'Stress mit der Abnahme',
      }),
    );

    expect(result.noModel).toBe(true);
    expect(result.earlier).toHaveLength(5);
    for (const evidence of result.earlier) {
      expect(evidence.date < '2026-08-09').toBe(true);
      expect(evidence.excerpt.length).toBeGreaterThan(0);
    }
  });
});

describe('coach: analysieren', () => {
  it('zieht höchstens fünf frühere Tage mit Datum in den Kontext', async () => {
    const fixture = await journalFixture({ sample: false, files: stressfulWeek() });
    const { gateway, provider } = gatewayWithReplies({ 'journal-chat': 'Drei Wochen, drei Male.' });

    const result = await coach(
      fixture.deps(gateway),
      ask({
        date: '2026-08-09',
        mode: 'analyze',
        useHistory: true,
        message: 'Stress mit der Abnahme',
      }),
    );

    expect(result.earlier).toHaveLength(5);
    const user = provider.lastCall('journal-chat')?.messages.at(-1)?.content ?? '';
    expect(user).toContain('Frühere Tage:');
    for (const evidence of result.earlier) {
      expect(user).toContain(`- ${evidence.date}:`);
    }
    expect(user).not.toContain('2026-08-10');
  });

  it('holt ohne useHistory keine früheren Tage', async () => {
    const fixture = await journalFixture({ sample: false, files: stressfulWeek() });
    const { gateway } = gatewayWithReplies({ 'journal-chat': 'Kurz.' });

    const result = await coach(
      fixture.deps(gateway),
      ask({ date: '2026-08-09', mode: 'analyze', useHistory: false, message: 'Stress' }),
    );

    expect(result.earlier).toEqual([]);
  });

  it('zieht für tips keine früheren Tage, auch mit useHistory', async () => {
    const fixture = await journalFixture({ sample: false, files: stressfulWeek() });
    const { gateway, provider } = gatewayWithReplies({ 'journal-chat': 'Kurz.' });

    const result = await coach(
      fixture.deps(gateway),
      ask({
        date: '2026-08-09',
        mode: 'tips',
        useHistory: true,
        message: 'Stress mit der Abnahme',
      }),
    );

    expect(result.earlier).toEqual([]);
    const user = provider.lastCall('journal-chat')?.messages.at(-1)?.content ?? '';
    expect(user).not.toContain('Frühere Tage:');
  });
});

describe('earlierDays', () => {
  it('sortiert älteste zuerst und lässt den Tag selbst weg', async () => {
    const fixture = await journalFixture({ sample: false, files: stressfulWeek() });

    const found = earlierDays(fixture.index, {
      date: '2026-08-05',
      text: 'Stress mit der Abnahme',
    });

    expect(found.map((entry) => entry.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ]);
  });

  it('ist leer ohne Suchtext und bei Grenze null', async () => {
    const fixture = await journalFixture({ sample: false, files: stressfulWeek() });

    expect(earlierDays(fixture.index, { date: DAY, text: '  ' })).toEqual([]);
    expect(earlierDays(fixture.index, { date: DAY, text: 'Stress', limit: 0 })).toEqual([]);
  });

  it('findet nichts, wenn es keine früheren Tageseinträge gibt', async () => {
    const fixture = await journalFixture({ sample: false });
    expect(earlierDays(fixture.index, { date: DAY, text: 'Stress' })).toEqual([]);
    expect(NOW_MS).toBeGreaterThan(0);
  });
});
