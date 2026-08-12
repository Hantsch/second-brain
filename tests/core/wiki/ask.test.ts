/* Fragen beantworten. Hier haengt Guardrail 3: die Antwort kommt aus dem Vault
   oder sie sagt, dass sie nicht kommt.
 *
 * Vier Zustaende, alle geprueft:
 * - Treffer und Modell → Antwort mit gepruefeten Zitaten.
 * - erfundenes Zitat   → verworfen, Antwort als `unsupported` markiert.
 * - keine Treffer      → ehrliche Absage, **kein** Modellaufruf.
 * - kein Modell        → die Suchtreffer selbst, mit Pfad und Zeile.
 */

import { describe, expect, it } from 'vitest';
import { askQuestion, retrieve } from '@core/wiki';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { MODULE, OAUTH_PATH, TOKEN_PATH, wikiFixture } from './fixtures';
import type { WikiFixture } from './fixtures';

const QUESTION = 'Wie lange leben Access-Token?';
const VERBATIM =
  'Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei jeder Nutzung';

const GOOD_ANSWER = [
  `Access-Token leben 15 Minuten, Refresh-Token 8 Stunden [[${TOKEN_PATH}]].`,
  '',
  `Wörtlich: „${VERBATIM}"`,
].join('\n');

const INVENTED_QUOTE = [
  `Access-Token leben zwölf Stunden [[${TOKEN_PATH}]].`,
  '',
  'Wörtlich: „Access-Token leben zwölf Stunden, das ist so entschieden"',
].join('\n');

const INVENTED_PATH = `Steht in [[modules/${MODULE}/wiki/concepts/gibt-es-nicht.md]].`;

/** Die Zeile, in der ein Zitat wirklich beginnt — der Beleg muss auffindbar sein. */
async function lineAt(fixture: WikiFixture, path: string, line: number): Promise<string> {
  return (await fixture.text(path)).split('\n')[line - 1] ?? '';
}

describe('retrieve', () => {
  it('holt wortwoertliche Ausschnitte mit Pfad und Zeilennummer', async () => {
    const fixture = await wikiFixture();

    const excerpts = retrieve(fixture.index, QUESTION, { limit: 5 });

    expect(excerpts.length).toBeGreaterThan(0);
    const hit = excerpts.find((entry) => entry.path === TOKEN_PATH);
    expect(hit).toBeDefined();
    expect(hit?.quote).toContain('Access-Token 15 Minuten');
    // Das Zitat steht genau dort, wo die Fundstelle es behauptet.
    const first = (hit?.quote ?? '').split('\n')[0] ?? '';
    expect(await lineAt(fixture, TOKEN_PATH, hit?.line ?? 0)).toBe(first);
    const content = await fixture.text(TOKEN_PATH);
    expect(content).toContain(hit?.quote ?? 'FEHLT');
  });

  it('schraenkt auf ein Modul und einen Scope ein', async () => {
    const fixture = await wikiFixture();

    const inModule = retrieve(fixture.index, 'Token', { module: MODULE, limit: 10 });
    expect(inModule.every((entry) => entry.module === MODULE)).toBe(true);

    const work = retrieve(fixture.index, 'Kundenportal', { scope: 'work', limit: 10 });
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((entry) => entry.path.startsWith('projects/work/'))).toBe(true);
    expect(retrieve(fixture.index, 'Kundenportal', { scope: 'private', limit: 10 })).toEqual([]);
  });

  it('haelt die Obergrenze ein und meldet eine leere Frage leer', async () => {
    const fixture = await wikiFixture();
    expect(retrieve(fixture.index, 'Token', { limit: 2 })).toHaveLength(2);
    expect(retrieve(fixture.index, '   ')).toEqual([]);
  });
});

describe('askQuestion mit Modell', () => {
  it('liefert die Antwort mit gepruefeten Zitaten', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({ 'query-answer': GOOD_ANSWER }, ['query-answer']);
    const deltas: string[] = [];

    const answer = await askQuestion(fixture.deps(gateway), {
      question: QUESTION,
      module: MODULE,
      onDelta: (delta) => deltas.push(delta),
    });

    expect(answer.usedLlm).toBe(true);
    expect(answer.unsupported).toBe(false);
    expect(deltas.join('')).toBe(GOOD_ANSWER);
    expect(answer.citations.map((citation) => citation.path)).toEqual([TOKEN_PATH]);
    const citation = answer.citations[0];
    expect(citation?.quote).toBe(VERBATIM);
    expect(await lineAt(fixture, TOKEN_PATH, citation?.line ?? 0)).toContain(
      'Aktueller Stand: Access-Token 15 Minuten',
    );
  });

  it('verwirft ein erfundenes Zitat und markiert die Antwort als unbelegt', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({ 'query-answer': INVENTED_QUOTE }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway), { question: QUESTION });

    expect(answer.unsupported).toBe(true);
    expect(answer.citations.some((citation) => citation.quote.includes('zwölf Stunden'))).toBe(
      false,
    );
    // Der Pfad ist echt, deshalb bleibt er als Fundstelle stehen — nur ohne das Zitat.
    expect(answer.citations.map((citation) => citation.path)).toEqual([TOKEN_PATH]);
  });

  it('verwirft einen erfundenen Pfad', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({ 'query-answer': INVENTED_PATH }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway), { question: QUESTION });

    expect(answer.citations).toEqual([]);
    expect(answer.unsupported).toBe(true);
  });

  it('laesst die Reihenfolge vom Modell sortieren, ohne einen Treffer zu verlieren', async () => {
    const fixture = await wikiFixture();
    const { gateway, provider } = gatewayWithReplies(
      { 'query-answer': GOOD_ANSWER, 'query-rerank': JSON.stringify({ order: [3, 1, 99] }) },
      ['query-answer', 'query-rerank'],
    );

    const answer = await askQuestion(fixture.deps(gateway), { question: QUESTION, limit: 4 });

    expect(provider.countFor('query-rerank')).toBe(1);
    expect(answer.excerpts).toHaveLength(4);
    expect(new Set(answer.excerpts.map((entry) => entry.path)).size).toBe(4);
  });

  it('faellt auf die Suchtreffer zurueck, wenn das Modell den Dienst verweigert', async () => {
    const fixture = await wikiFixture();
    const { gateway, provider } = gatewayWithReplies({}, ['query-answer']);
    provider.fail('query-answer', 'Modell überlastet');

    const answer = await askQuestion(fixture.deps(gateway), { question: QUESTION });

    expect(answer.usedLlm).toBe(false);
    expect(answer.answer).toContain('kein Modell zugeordnet');
    expect(answer.citations.length).toBeGreaterThan(0);
  });
});

describe('askQuestion ohne Beleg', () => {
  it('sagt ab, ohne das Modell zu rufen', async () => {
    const fixture = await wikiFixture();
    const { gateway, provider } = gatewayWithReplies({ 'query-answer': GOOD_ANSWER }, [
      'query-answer',
    ]);

    const answer = await askQuestion(fixture.deps(gateway), {
      question: 'Quantenverschraenkungsbananenbrot',
    });

    expect(provider.callCount).toBe(0);
    expect(answer.answer).toBe('Dazu steht nichts im Vault.');
    expect(answer.unsupported).toBe(true);
    expect(answer.usedLlm).toBe(false);
    expect(answer.citations).toEqual([]);
  });

  it('sagt auf Englisch ab, wenn der Vault englisch ist', async () => {
    const fixture = await wikiFixture();
    const answer = await askQuestion(fixture.deps(emptyGateway(), 'en'), {
      question: 'Quantenverschraenkungsbananenbrot',
    });
    expect(answer.answer).toBe('Nothing in the vault covers that.');
  });

  it('verweigert eine leere Frage', async () => {
    const fixture = await wikiFixture();
    await expect(askQuestion(fixture.deps(emptyGateway()), { question: '  ' })).rejects.toThrow(
      /Frage/,
    );
  });
});

describe('askQuestion ohne Modell', () => {
  it('gibt die Stellen zurueck, statt einen toten Zustand zu zeigen', async () => {
    const fixture = await wikiFixture();

    const answer = await askQuestion(fixture.deps(emptyGateway()), {
      question: QUESTION,
      limit: 3,
    });

    expect(answer.usedLlm).toBe(false);
    expect(answer.unsupported).toBe(false);
    expect(answer.answer).toContain('Ich kann die Antwort nicht formulieren');
    expect(answer.citations).toHaveLength(answer.excerpts.length);
    expect(answer.excerpts.length).toBeGreaterThan(0);
    for (const citation of answer.citations) {
      expect(answer.answer).toContain(`${citation.path}:${citation.line}`);
      expect(await fixture.text(citation.path)).toContain(citation.quote);
    }
  });

  it('nennt auch Seiten ausserhalb der Module, wenn sie passen', async () => {
    const fixture = await wikiFixture();

    const answer = await askQuestion(fixture.deps(emptyGateway()), {
      question: 'OAuth Festlegungen PKCE',
      limit: 3,
    });

    expect(answer.excerpts.map((entry) => entry.path)).toContain(OAUTH_PATH);
  });
});
