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
import { MAX_PASSAGES_PER_DOC, askQuestion, retrieve } from '@core/wiki';
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
    search: (query) => inner.search(query),
    searchPassages: (query) => {
      queries.push(query);
      return inner.searchPassages(query);
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

/* ── Lange Dokumente: mehrere Passagen statt einer ganzen Datei (053) ────────
 *
 * `retrieve()` fragt seit D4 `searchPassages` statt `search`: eine lange
 * Aufzeichnung liefert die Zeilen, die die Frage wirklich beantworten, statt
 * (wie zuvor) immer nur ihren Textanfang. Die Fixture unten baut so eine Datei
 * selbst — ~40k Zeichen unter `raw/`, aus lauter Fuelltext-Absaetzen, mit ein
 * paar Absaetzen, die eine seltene Wortfolge tragen und so als Zielpassage
 * auffindbar sind.
 */

const LONG_PATH = 'raw/web/2026-08-01-lange-aufzeichnung.md';
/* Sechs Absaetze pro Passage (052-Zielgroesse ~3000 Zeichen, ein Absatz hier
   ~130 Zeichen inkl. Leerzeile) — 320 Absaetze ergeben ein gutes Dutzend
   Passagen und ~42k Zeichen Rumpf. */
const TOTAL_PARAGRAPHS = 320;
/** Kopfzeilen vor dem Rumpf — daraus folgt die erste Rumpfzeile in der Datei. */
const HEADER_LINES = [
  '---',
  'type: raw',
  'title: Lange Aufzeichnung',
  'created: 2026-08-01',
  'updated: 2026-08-01',
  'lang: de',
  '---',
  '',
];
const LONG_DOC_BODY_LINE = HEADER_LINES.length + 1;

function fillerParagraph(index: number): string {
  return `Absatz ${index}: Sitzungsprotokoll ohne besonderen Inhalt, nur Fuelltext, um die Aufzeichnung lang genug zu machen fuer den Test.`;
}

/**
 * Eine lange `raw/`-Datei aus Fuelltext-Absaetzen, mit `targets` an bestimmten
 * Absatz-Indizes ueberschrieben. Jeder Absatz belegt genau zwei Zeilen (Text,
 * Leerzeile) — die Zeile eines Absatzes folgt daher direkt aus seinem Index,
 * ohne den Text selbst nach ihr durchsuchen zu muessen.
 */
function longRawDoc(targets: ReadonlyMap<number, string>): {
  content: string;
  lineOf: (index: number) => number;
} {
  const bodyLines: string[] = [];
  for (let index = 0; index < TOTAL_PARAGRAPHS; index += 1) {
    bodyLines.push(targets.get(index) ?? fillerParagraph(index), '');
  }
  const content = [...HEADER_LINES, ...bodyLines].join('\n');
  return {
    content,
    lineOf: (index: number) => LONG_DOC_BODY_LINE + index * 2,
  };
}

function shortNote(path: string, title: string, body: string): Record<string, string> {
  return {
    [path]: [
      '---',
      'type: note',
      `title: ${title}`,
      'created: 2026-08-01',
      'updated: 2026-08-01',
      'lang: de',
      '---',
      '',
      body,
      '',
    ].join('\n'),
  };
}

/** Sechs kurze Notizen, die das generische Wort der Fuelltext-Absaetze teilen. */
function sixGenericNotes(): Record<string, string> {
  let files: Record<string, string> = {};
  for (let n = 0; n < 6; n += 1) {
    files = {
      ...files,
      ...shortNote(
        `notes/sitzungsnotiz-${n}.md`,
        `Sitzungsnotiz ${n}`,
        `Sitzungsprotokoll vom ${n}. Tag: nichts Aussergewoehnliches zu vermerken.`,
      ),
    };
  }
  return files;
}

describe('retrieve: lange Dokumente in mehreren Passagen (053)', () => {
  it('die Antwort in der Mitte einer langen Aufzeichnung wird als genau diese Passage gefunden', async () => {
    const targetIndex = 160;
    const targetText = `Absatz ${targetIndex}: Wanderzirkusprotokoll meldet: Radweg wird am Dienstag gesperrt, weil der Zirkus durchzieht.`;
    const { content, lineOf } = longRawDoc(new Map([[targetIndex, targetText]]));
    const fixture = await wikiFixture({ [LONG_PATH]: content, ...sixGenericNotes() });

    const excerpts = retrieve(fixture.index, 'Wanderzirkusprotokoll Radweg gesperrt', { limit: 5 });

    const hit = excerpts.find((entry) => entry.path === LONG_PATH);
    expect(hit).toBeDefined();
    expect(hit?.quote.toLowerCase()).toContain('wanderzirkusprotokoll');
    expect(hit?.quote).toContain('Radweg');
    // Der Ausschnitt beginnt woertlich an seiner gemeldeten Zeile ...
    const firstQuoteLine = (hit?.quote ?? '').split('\n')[0] ?? '';
    expect(await lineAt(fixture, LONG_PATH, hit?.line ?? 0)).toBe(firstQuoteLine);
    // ... und diese Zeile liegt in der Passage der Zielaussage, nicht am Dateianfang.
    expect(hit?.line ?? 0).toBeLessThanOrEqual(lineOf(targetIndex));
    expect(hit?.line ?? 0).toBeGreaterThan(lineOf(targetIndex) - 8);
  });

  it('zwei einschlaegige Passagen einer Datei werden beide zum Beleg', async () => {
    const phrase = 'Quirlmechanismus im Testprotokoll';
    const targets = new Map([
      [30, `Absatz 30: ${phrase} erstmals erwaehnt, noch ohne Messwerte.`],
      [220, `Absatz 220: ${phrase} zeigte beim zweiten Durchlauf ein anderes Verhalten.`],
    ]);
    const { content, lineOf } = longRawDoc(targets);
    const fixture = await wikiFixture({ [LONG_PATH]: content });

    const answer = await askQuestion(fixture.deps(emptyGateway()), { question: phrase, limit: 10 });

    const fromLongDoc = answer.excerpts.filter((entry) => entry.path === LONG_PATH);
    expect(fromLongDoc).toHaveLength(2);
    const lines = fromLongDoc.map((entry) => entry.line).sort((a, b) => a - b);
    expect(lines[0]).not.toBe(lines[1]);
    // Jede gemeldete Zeile liegt in der Passage ihrer Zielaussage (30 vor 220).
    expect(lines[0]).toBeLessThanOrEqual(lineOf(30));
    expect(lines[0]).toBeGreaterThan(lineOf(30) - 8);
    expect(lines[1]).toBeLessThanOrEqual(lineOf(220));
    expect(lines[1]).toBeGreaterThan(lineOf(220) - 8);
    for (const entry of fromLongDoc) {
      expect(answer.answer).toContain(`${LONG_PATH}:${entry.line}`);
    }
  });

  it('mehr als drei Passagen derselben Datei werden nicht alle zum Beleg', async () => {
    const phrase = 'Flauschomat Feldversuch';
    const targets = new Map([
      [20, `Absatz 20: ${phrase} Ergebnis eins dokumentiert.`],
      [100, `Absatz 100: ${phrase} Ergebnis zwei dokumentiert.`],
      [180, `Absatz 180: ${phrase} Ergebnis drei dokumentiert.`],
      [260, `Absatz 260: ${phrase} Ergebnis vier dokumentiert.`],
    ]);
    const { content } = longRawDoc(targets);
    const fixture = await wikiFixture({ [LONG_PATH]: content });

    const excerpts = retrieve(fixture.index, phrase, { limit: 10 });

    const fromLongDoc = excerpts.filter((entry) => entry.path === LONG_PATH);
    expect(fromLongDoc.length).toBe(MAX_PASSAGES_PER_DOC);
    expect(new Set(fromLongDoc.map((entry) => entry.line)).size).toBe(MAX_PASSAGES_PER_DOC);
  });

  it('ein Zitat aus der zweiten Passage wird gegen die ganze Datei geprueft', async () => {
    const quote =
      'Kompressionsleitfaden zweite Fassung mit ausfuehrlichem Kommentar versehen und geprueft.';
    const targets = new Map([
      [30, 'Absatz 30: Kompressionsleitfaden erste Fassung ohne Kommentare festgehalten.'],
      [220, `Absatz 220: ${quote}`],
    ]);
    const { content, lineOf } = longRawDoc(targets);
    const fixture = await wikiFixture({ [LONG_PATH]: content });
    const answerText = [
      `Der Kompressionsleitfaden wurde ueberarbeitet [[${LONG_PATH}]].`,
      '',
      `Wörtlich: „${quote}"`,
    ].join('\n');
    const { gateway } = gatewayWithReplies({ 'query-answer': answerText }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway), {
      question: 'Kompressionsleitfaden zweite Fassung Kommentar',
      limit: 10,
    });

    expect(answer.usedLlm).toBe(true);
    expect(answer.unsupported).toBe(false);
    const citation = answer.citations.find((entry) => entry.path === LONG_PATH);
    expect(citation).toBeDefined();
    expect(citation?.quote).toBe(quote);
    expect(citation?.line).toBe(lineOf(220));
  });

  it('ein erfundenes Zitat zu einer langen Datei wird trotzdem verworfen', async () => {
    const targets = new Map([
      [30, 'Absatz 30: Kompressionsleitfaden erste Fassung ohne Kommentare festgehalten.'],
      [
        220,
        'Absatz 220: Kompressionsleitfaden zweite Fassung mit ausfuehrlichem Kommentar versehen und geprueft.',
      ],
    ]);
    const { content } = longRawDoc(targets);
    const fixture = await wikiFixture({ [LONG_PATH]: content });
    const invented = [
      `Der Kompressionsleitfaden wurde ueberarbeitet [[${LONG_PATH}]].`,
      '',
      `Wörtlich: „Kompressionsleitfaden wurde komplett verworfen und neu geschrieben"`,
    ].join('\n');
    const { gateway } = gatewayWithReplies({ 'query-answer': invented }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway), {
      question: 'Kompressionsleitfaden zweite Fassung Kommentar',
      limit: 10,
    });

    expect(answer.unsupported).toBe(true);
    expect(answer.citations.some((entry) => entry.quote.includes('komplett verworfen'))).toBe(
      false,
    );
  });
});
