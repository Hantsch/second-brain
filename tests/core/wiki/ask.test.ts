/* Fragen beantworten. Hier haengt Guardrail 3: die Antwort kommt aus dem Vault
   oder sie sagt, dass sie nicht kommt.
 *
 * Vier Zustaende, alle geprueft:
 * - Treffer und Modell → Antwort mit gepruefeten Zitaten.
 * - erfundenes Zitat   → verworfen, Antwort als `unsupported` markiert.
 * - keine Treffer      → ehrliche Absage, **kein** Modellaufruf.
 * - kein Modell        → die Suchtreffer selbst, mit Pfad und Zeile.
 *
 * Dazu die Einschraenkungen: Modul, Scope und Projekt filtern die Kandidaten,
 * bevor irgendetwas zitiert wird — mit Modell wie ohne.
 */

import { describe, expect, it } from 'vitest';
import { askQuestion, retrieve } from '@core/wiki';
import type { RetrieveOptions, WikiIndexView } from '@core/wiki';
import type { SearchQuery } from '@shared/types';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import {
  PRIVATE_NOTE_PATH,
  PROJECT_QUESTION,
  WORK_NOTE_PATH,
  WORK_PROJECT,
  projectNoteFiles,
} from '../../fixtures';
import {
  AREA_PATH,
  CONDENSED_ONLY_QUESTION,
  CONDENSED_PATH,
  CONDENSED_QUESTION,
  MODULE,
  OAUTH_PATH,
  TOKEN_PATH,
  condensedAreaFiles,
  wikiFixture,
} from './fixtures';
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

/** Eine Antwort, die ueber die Projektgrenze hinweg belegt — der Filter muss greifen. */
const ACROSS_PROJECTS = [
  `Der Zeitplan bis zur Abnahme steht [[${WORK_NOTE_PATH}]].`,
  `Das Hochbeet kommt danach [[${PRIVATE_NOTE_PATH}]].`,
].join('\n');

/** Alles, was unter dem Arbeitsprojekt liegt. */
const WORK_PREFIX = `projects/work/${WORK_PROJECT}/`;

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

  it('schraenkt auf ein Projekt ein — ohne Angabe bleibt der Bestand derselbe', async () => {
    const fixture = await wikiFixture(projectNoteFiles());

    const all = retrieve(fixture.index, PROJECT_QUESTION, { limit: 10 });
    expect(all.map((entry) => entry.path)).toContain(WORK_NOTE_PATH);
    expect(all.map((entry) => entry.path)).toContain(PRIVATE_NOTE_PATH);
    /* Fehlend und `null` heissen beide „kein Filter" — sonst waere der Bestand
       davon abhaengig, ob der Renderer das Feld mitschickt. */
    expect(retrieve(fixture.index, PROJECT_QUESTION, { project: null, limit: 10 })).toEqual(all);

    const inProject = retrieve(fixture.index, PROJECT_QUESTION, {
      project: WORK_PROJECT,
      limit: 10,
    });
    expect(inProject.length).toBeGreaterThan(0);
    expect(inProject.map((entry) => entry.path)).toContain(WORK_NOTE_PATH);
    expect(inProject.every((entry) => entry.path.startsWith(WORK_PREFIX))).toBe(true);
    expect(retrieve(fixture.index, PROJECT_QUESTION, { project: 'gibt-es-nicht' })).toEqual([]);
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

  it('zitiert mit Projektfilter nur Seiten dieses Projekts', async () => {
    const fixture = await wikiFixture(projectNoteFiles());
    const { gateway } = gatewayWithReplies({ 'query-answer': ACROSS_PROJECTS }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway), {
      question: PROJECT_QUESTION,
      project: WORK_PROJECT,
    });

    expect(answer.usedLlm).toBe(true);
    expect(answer.citations.map((citation) => citation.path)).toContain(WORK_NOTE_PATH);
    /* Das zweite Beleg-Ziel liegt im anderen Projekt und stand deshalb nie in den
       Kandidaten — es wird verworfen, statt als Fundstelle behauptet zu werden. */
    expect(answer.citations.every((citation) => citation.path.startsWith(WORK_PREFIX))).toBe(true);
    expect(answer.excerpts.every((entry) => entry.path.startsWith(WORK_PREFIX))).toBe(true);
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

  it('filtert auch ohne Modell auf das Projekt — die Stellen sind die Antwort', async () => {
    const fixture = await wikiFixture(projectNoteFiles());
    const deps = fixture.deps(emptyGateway());

    const open = await askQuestion(deps, { question: PROJECT_QUESTION, limit: 10 });
    expect(open.excerpts.map((entry) => entry.path)).toContain(PRIVATE_NOTE_PATH);

    const answer = await askQuestion(deps, {
      question: PROJECT_QUESTION,
      project: WORK_PROJECT,
      limit: 10,
    });

    expect(answer.usedLlm).toBe(false);
    expect(answer.excerpts.length).toBeGreaterThan(0);
    expect(answer.excerpts.map((entry) => entry.path)).toContain(WORK_NOTE_PATH);
    expect(answer.excerpts.every((entry) => entry.path.startsWith(WORK_PREFIX))).toBe(true);
    expect(answer.citations.every((citation) => citation.path.startsWith(WORK_PREFIX))).toBe(true);
    /* Ohne Modell sind die Stellen die Antwort — dann darf auch dort nichts aus
       einem anderen Projekt stehen. */
    expect(answer.answer).toContain(WORK_NOTE_PATH);
    expect(answer.answer).not.toContain(PRIVATE_NOTE_PATH);
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

/* ── Verdichtungen sind kein Beleg (040) ─────────────────────────────────────
 *
 * Ein Verdichtungs-Artefakt ist vom Modell geschrieben. Wuerde es zitiert,
 * gaebe die App eine Maschinen-Zusammenfassung als eigene Notiz des Nutzers aus
 * — Guardrail 3. Der Ausschluss haengt in `retrieve`, damit jeder Weg dahinter
 * ihn erbt: mit Modell, ohne Modell, mit und ohne Einschraenkung.
 */

/** Eine Antwort, die das Artefakt als Fundstelle behauptet — sie darf nicht stehen. */
const CITES_CONDENSED = [
  `Pausen helfen dem Rücken [[${CONDENSED_PATH}]].`,
  `Kurze Pausen alle 45 Minuten [[${AREA_PATH}]].`,
].join('\n');

/** Ein Index, der mitschreibt, wonach gesucht wurde. */
function watchIndex(inner: WikiIndexView): { view: WikiIndexView; queries: SearchQuery[] } {
  const queries: SearchQuery[] = [];
  const view: WikiIndexView = {
    index: () => inner.index(),
    search: (query) => {
      queries.push(query);
      return inner.search(query);
    },
    pages: () => inner.pages(),
    modules: () => inner.modules(),
  };
  return { view, queries };
}

/* Jede Einschraenkung, die `retrieve` kennt. `scope: 'private'` ist der scharfe
   Fall: das Artefakt traegt genau diesen Scope, der Filter liesse es also durch.
   Modul- und Projektfilter treffen eine Bereichsdatei ohnehin nie — sie stehen
   hier, damit kein Weg ungeprueft bleibt. */
const VARIANTS: { label: string; options: RetrieveOptions }[] = [
  { label: 'ohne Einschraenkung', options: {} },
  { label: 'ohne Filter (null)', options: { module: null, scope: null, project: null } },
  { label: 'mit Scope', options: { scope: 'private' } },
  { label: 'mit Modul', options: { module: MODULE } },
  { label: 'mit Projekt', options: { project: WORK_PROJECT } },
];

describe('Beleg-Ausschluss: Verdichtungs-Artefakte', () => {
  it.each(VARIANTS)(
    '$label: kein Ausschnitt, kein Zitat, kein Eintrag ohne Modell',
    async ({ options }) => {
      const fixture = await wikiFixture(condensedAreaFiles());
      const { gateway } = gatewayWithReplies({ 'query-answer': CITES_CONDENSED }, ['query-answer']);

      expect(
        retrieve(fixture.index, CONDENSED_QUESTION, { ...options, limit: 10 }).map(
          (entry) => entry.path,
        ),
      ).not.toContain(CONDENSED_PATH);

      const withModel = await askQuestion(fixture.deps(gateway), {
        ...options,
        question: CONDENSED_QUESTION,
        limit: 10,
      });
      expect(withModel.excerpts.map((entry) => entry.path)).not.toContain(CONDENSED_PATH);
      expect(withModel.citations.map((citation) => citation.path)).not.toContain(CONDENSED_PATH);

      const withoutModel = await askQuestion(fixture.deps(emptyGateway()), {
        ...options,
        question: CONDENSED_QUESTION,
        limit: 10,
      });
      expect(withoutModel.excerpts.map((entry) => entry.path)).not.toContain(CONDENSED_PATH);
      expect(withoutModel.citations.map((citation) => citation.path)).not.toContain(CONDENSED_PATH);
      // Ohne Modell sind die Stellen die Antwort — dann auch dort nicht.
      expect(withoutModel.answer).not.toContain(CONDENSED_PATH);
    },
  );

  it('verliert dabei keinen echten Beleg', async () => {
    const fixture = await wikiFixture(condensedAreaFiles());
    const { gateway } = gatewayWithReplies({ 'query-answer': GOOD_ANSWER }, ['query-answer']);

    /* Die Bereichsdatei trifft dieselbe Frage schwaecher als das Artefakt — sie
       bleibt Beleg, statt mit ihm zu verschwinden. */
    expect(
      retrieve(fixture.index, CONDENSED_QUESTION, { limit: 10 }).map((entry) => entry.path),
    ).toContain(AREA_PATH);

    const answer = await askQuestion(fixture.deps(gateway), { question: QUESTION, module: MODULE });
    expect(answer.citations.map((citation) => citation.path)).toEqual([TOKEN_PATH]);
    expect(answer.unsupported).toBe(false);
  });

  it('sagt ab, wenn nur das Artefakt passt — ohne einen Modellaufruf', async () => {
    const fixture = await wikiFixture(condensedAreaFiles());
    const { gateway, provider } = gatewayWithReplies({ 'query-answer': CITES_CONDENSED }, [
      'query-answer',
    ]);

    const answer = await askQuestion(fixture.deps(gateway), {
      question: CONDENSED_ONLY_QUESTION,
      limit: 10,
    });

    expect(provider.callCount).toBe(0);
    expect(answer.answer).toBe('Dazu steht nichts im Vault.');
    expect(answer.unsupported).toBe(true);
    expect(answer.usedLlm).toBe(false);
    expect(answer.citations).toEqual([]);
    expect(answer.excerpts).toEqual([]);
  });

  it('sucht gar nicht, wenn nach dem Ausschluss kein Typ uebrig bleibt', async () => {
    const fixture = await wikiFixture(condensedAreaFiles());
    const { view, queries } = watchIndex(fixture.index);

    /* Nur `condensed` angefragt: die leere Restliste darf nicht in die Suche
       gehen — dort heisst ein leeres `types` „kein Filter", der Ausschluss waere
       damit in eine unbeschraenkte Suche verkehrt. */
    expect(retrieve(view, CONDENSED_QUESTION, { types: ['condensed'], limit: 10 })).toEqual([]);
    expect(queries).toEqual([]);

    // Gegenprobe: mit einem Belegtyp laeuft die Suche, und `condensed` ist raus.
    const areas = retrieve(view, CONDENSED_QUESTION, { types: ['area', 'condensed'], limit: 10 });
    expect(areas.map((entry) => entry.path)).toEqual([AREA_PATH]);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.types).toEqual(['area']);
  });

  it('bleibt in der allgemeinen Suche auffindbar — der Ausschluss gilt nur der Antwort', async () => {
    const fixture = await wikiFixture(condensedAreaFiles());

    // Bester Volltexttreffer der Frage: ohne den Ausschluss stuende es vorn.
    const hits = fixture.index.search({ text: CONDENSED_QUESTION, limit: 10 });
    expect(hits[0]?.path).toBe(CONDENSED_PATH);
    expect(hits[0]?.docType).toBe('condensed');
    expect(
      fixture.index.search({ text: CONDENSED_ONLY_QUESTION, limit: 10 }).map((hit) => hit.path),
    ).toEqual([CONDENSED_PATH]);
  });
});
