/* Der Coach. Vier Dinge, an denen dieser Screen scheitern könnte, und deshalb
   hier festgenagelt:

   1. **Die Nutzerrunde steht in der Datei, bevor das Modell gefragt wird.** Der
      Test lässt das Modell danach werfen — der Satz des Menschen muss dastehen.
   2. **Die Antwort wird unverändert protokolliert.** Kein Umbau, kein Zusatz.
   3. **`analyze` belegt mit Daten** und zieht höchstens fünf frühere Tage heran,
      nie den heutigen und nie einen späteren.
   4. **Ohne Modell** wird der Eintrag geschrieben, `noModel` gesetzt und **keine**
      Antwort erfunden — im Protokoll steht dann nichts vom Coach. */

import { describe, expect, it } from 'vitest';
import { JournalError, coach, earlierDays, parseDialog } from '@core/journal';
import type { CoachRequest } from '@shared/types';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { NOW_MS } from '../../helpers/time';
import { DAY, DAY_PATH, journalFile, journalFixture, journalPathOf } from './fixtures';

const REPLY = 'Das klingt nach einem Tag, an dem viel auf dir lag.';

function ask(patch: Partial<CoachRequest> = {}): CoachRequest {
  return {
    mode: 'listen',
    date: DAY,
    message: 'Der Sprint fühlt sich unmöglich an.',
    useHistory: false,
    ...patch,
  };
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
  it('protokolliert Frage und Antwort im Blockquote-Format', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': REPLY });

    const result = await coach(fixture.deps(gateway), ask());

    expect(result.noModel).toBe(false);
    expect(result.usedLlm).toBe(true);
    expect(result.reply).toBe(REPLY);
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain('> **Ich** — 14:32\n> Der Sprint fühlt sich unmöglich an.');
    expect(content).toContain(`> **Second Brain** — 14:32\n> ${REPLY}`);
    const turns = parseDialog(content.slice(content.indexOf('\n---\n', 4) + 5));
    expect(turns).toHaveLength(4);
    expect(turns[3]?.text).toBe(REPLY);
  });

  it('schickt die Verbote und den bisherigen Eintrag mit', async () => {
    const fixture = await journalFixture();
    const { gateway, provider } = gatewayWithReplies({ 'journal-chat': REPLY });

    await coach(fixture.deps(gateway), ask());

    const call = provider.lastCall('journal-chat');
    expect(call?.streamed).toBe(true);
    const system = call?.messages.find((turn) => turn.role === 'system')?.content ?? '';
    expect(system).toContain('nur zuhören');
    expect(system).toContain('Gib keine Ratschläge');
    expect(system).toContain('"hast du schon versucht"');
    const user = call?.messages.at(-1)?.content ?? '';
    expect(user).toContain('Vormittag im Testsystem');
    /* Die frühere Runde des Tages steht als eigener Turn davor, nicht im Eintrag. */
    expect(call?.messages.map((turn) => turn.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
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
    expect(content).toContain('> **Ich** — 14:32');
  });

  it('nimmt keine leere Runde an', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': REPLY });
    const before = await fixture.text(DAY_PATH);

    await expect(coach(fixture.deps(gateway), ask({ message: '   ' }))).rejects.toThrow(
      JournalError,
    );
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });
});

describe('coach: Absturz nach dem Schreiben', () => {
  it('lässt die Nutzerrunde stehen, wenn der Modellaufruf wirft', async () => {
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
    expect(content).toContain('> Der Sprint fühlt sich unmöglich an.');
    /* Genau eine Antwort steht in der Datei: die aus dem Bestand, keine neue. */
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
    expect(await fixture.text(DAY_PATH)).toContain('> Der Sprint fühlt sich unmöglich an.');
  });

  it('protokolliert eine leere Modellantwort nicht', async () => {
    const fixture = await journalFixture();
    const { gateway } = gatewayWithReplies({ 'journal-chat': '   ' });

    const result = await coach(fixture.deps(gateway), ask());

    expect(result.reply).toBe('');
    expect(result.usedLlm).toBe(true);
    expect(result.noModel).toBe(true);
    expect((await fixture.text(DAY_PATH)).split('> **Second Brain**')).toHaveLength(2);
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
    expect(content).toContain('> Der Sprint fühlt sich unmöglich an.');
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
