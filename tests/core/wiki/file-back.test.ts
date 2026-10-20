/* Zurueckschreiben: aus einer guten Antwort wird eine Seite.
 *
 * Das ist der Mechanismus, mit dem Fragen das Wissen fuettern — und die Stelle, an
 * der Pfad-Belege zu echten Wikilinks werden. Ein `[[projects/…]]` waere ein Link
 * ins Nichts, den der Pflegelauf ab dann jede Woche meldet.
 */

import { describe, expect, it } from 'vitest';
import { askQuestion, fileBack, linkifyAnswer, parseIndex, parseLog } from '@core/wiki';
import type { Citation } from '@shared/types';
import { gatewayWithReplies } from '../../helpers/llm';
import { NOW_MS, TODAY } from '../../helpers/time';
import {
  CONDENSED_PATH,
  INDEX_PATH,
  LOG_PATH,
  MODULE,
  TOKEN_PATH,
  condensedAreaFiles,
  wikiFixture,
} from './fixtures';

const SOURCE_PATH = `modules/${MODULE}/wiki/sources/s-2026-08-04-token-lifetimes-blog.md`;
const PROJECT_PATH = 'projects/work/kundenportal-relaunch/project.md';
const PAGE_PATH = `modules/${MODULE}/wiki/concepts/wie-lange-leben-tokens.md`;

const ANSWER = [
  `Access-Token leben 15 Minuten [[${TOKEN_PATH}]], belegt durch [[${SOURCE_PATH}]].`,
  '',
  `Das Kundenportal nutzt sie noch nicht [[${PROJECT_PATH}]].`,
].join('\n');

const CITATIONS: Citation[] = [
  { path: TOKEN_PATH, title: 'Token-Lebensdauer', quote: 'Access-Token 15 Minuten', line: 14 },
  {
    path: SOURCE_PATH,
    title: 'Blogartikel: Kurze Token, weniger Ärger',
    quote: 'Access-Token 15 Minuten, Refresh-Token 8 Stunden',
    line: 18,
  },
  { path: PROJECT_PATH, title: 'Kundenportal-Relaunch', quote: 'Angebotsliste', line: null },
];

describe('linkifyAnswer', () => {
  it('macht Wiki-Pfade zu Wikilinks und fremde Pfade zu Text', () => {
    const linked = linkifyAnswer(ANSWER, MODULE);
    expect(linked).toContain('[[token-lebensdauer]]');
    expect(linked).toContain('[[s-2026-08-04-token-lifetimes-blog]]');
    expect(linked).toContain('`projects/work/kundenportal-relaunch/project.md`');
    expect(linked).not.toContain('[[projects/');
  });

  it('nennt Seiten anderer Module mit ihrem Modul und laesst echte Wikilinks stehen', () => {
    expect(linkifyAnswer('siehe [[modules/methodik/wiki/concepts/rot.md]]', MODULE)).toContain(
      '[[methodik/rot]]',
    );
    expect(linkifyAnswer('siehe [[oauth2]]', MODULE)).toBe('siehe [[oauth2]]');
  });
});

describe('fileBack', () => {
  it('legt die Antwort als Concept-Seite mit Belegen und Quellen ab', async () => {
    const fixture = await wikiFixture();

    const result = await fileBack(fixture.deps(gatewayWithReplies({}).gateway), {
      module: MODULE,
      title: 'Wie lange leben Tokens',
      answer: ANSWER,
      citations: CITATIONS,
      question: 'Wie lange leben Access-Token?',
      tags: ['token'],
    });

    expect(result.page.path).toBe(PAGE_PATH);
    expect(result.write.created).toBe(true);
    const doc = await fixture.store.read(PAGE_PATH);
    expect(doc?.frontmatter).toMatchObject({
      type: 'concept',
      title: 'Wie lange leben Tokens',
      module: MODULE,
      created: TODAY,
      tags: ['token'],
      sources: ['s-2026-08-04-token-lifetimes-blog'],
    });
    expect(doc?.body).toContain('[[token-lebensdauer]]');
    expect(doc?.body).toContain('## Belege');
    expect(doc?.body).toContain(`[[token-lebensdauer]] — ${TOKEN_PATH}:14`);
    // Ohne Zeilennummer steht der Pfad allein da, statt eine Zahl zu erfinden.
    expect(doc?.body).toContain(`- ${PROJECT_PATH}`);
  });

  it('traegt die Seite in den Katalog ein und die Frage in die Chronik', async () => {
    const fixture = await wikiFixture();
    const logBefore = await fixture.text(LOG_PATH);

    await fileBack(fixture.deps(gatewayWithReplies({}).gateway), {
      module: MODULE,
      title: 'Wie lange leben Tokens',
      answer: ANSWER,
      citations: CITATIONS,
      question: 'Wie lange leben Access-Token?',
    });

    const entry = parseIndex(await fixture.text(INDEX_PATH)).find(
      (item) => item.slug === 'wie-lange-leben-tokens',
    );
    expect(entry?.type).toBe('concept');
    expect(entry?.summary.length).toBeGreaterThan(0);
    // Der Katalog behaelt, was schon drinstand.
    expect(await fixture.text(INDEX_PATH)).toContain('- [[oauth2]] — Das Protokoll');

    const log = await fixture.text(LOG_PATH);
    expect(log.startsWith(logBefore.replace(/\s+$/, ''))).toBe(true);
    const latest = parseLog(log)[0];
    expect(latest?.kind).toBe('query');
    expect(latest?.title).toBe('Wie lange leben Access-Token?');
    expect(latest?.fields['answered from']).toContain('[[token-lebensdauer]]');
    expect(latest?.fields['filed back']).toBe(PAGE_PATH);
  });

  it('schreibt eine Antwort ohne Modell genauso zurueck', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({}, []);

    const answer = await askQuestion(fixture.deps(gateway), {
      question: 'Wie lange leben Access-Token?',
      limit: 2,
    });
    const result = await fileBack(fixture.deps(gateway), {
      module: MODULE,
      title: 'Stellen zu Token-Laufzeiten',
      answer: answer.answer,
      citations: answer.citations,
    });

    expect(answer.usedLlm).toBe(false);
    expect(result.written).toHaveLength(3);
    const doc = await fixture.store.read(result.page.path);
    expect(doc?.body).toContain('## Belege');
  });

  it('haengt bei Kollision einen Zaehler an, statt eine Seite zu ueberschreiben', async () => {
    const fixture = await wikiFixture();
    const deps = fixture.deps(gatewayWithReplies({}).gateway);
    const input = {
      module: MODULE,
      title: 'Wie lange leben Tokens',
      answer: ANSWER,
      citations: CITATIONS,
    };

    await fileBack(deps, input);
    const second = await fileBack(deps, { ...input, answer: 'Zweite Fassung der Antwort.' });

    expect(second.page.slug).toBe('wie-lange-leben-tokens-2');
    expect(await fixture.text(PAGE_PATH)).toContain('Access-Token leben 15 Minuten');
  });

  it('laesst ein verdichtetes Zitat weg, behaelt aber die uebrigen Belege', async () => {
    const fixture = await wikiFixture(condensedAreaFiles());
    const withCondensed: Citation[] = [
      ...CITATIONS,
      { path: CONDENSED_PATH, title: 'Gesundheit — verdichtet', quote: 'Pausen helfen', line: 1 },
    ];

    const result = await fileBack(fixture.deps(gatewayWithReplies({}).gateway), {
      module: MODULE,
      title: 'Wie lange leben Tokens ohne Verdichtung',
      answer: ANSWER,
      citations: withCondensed,
      question: 'Wie lange leben Access-Token?',
    });

    const doc = await fixture.store.read(result.page.path);
    expect(doc?.body).toContain('## Belege');
    expect(doc?.body).not.toContain(CONDENSED_PATH);
    expect(doc?.body).toContain(TOKEN_PATH);
    expect((doc?.frontmatter as { sources?: string[] })?.sources).not.toContain(CONDENSED_PATH);

    const log = await fixture.text(LOG_PATH);
    const latest = parseLog(log)[0];
    expect(latest?.fields['answered from']).not.toContain(CONDENSED_PATH);
  });

  it('schreibt die Seite ohne Beleg-Abschnitt, wenn alle Zitate verdichtet sind', async () => {
    const fixture = await wikiFixture(condensedAreaFiles());
    const onlyCondensed: Citation[] = [
      { path: CONDENSED_PATH, title: 'Gesundheit — verdichtet', quote: 'Pausen helfen', line: 1 },
    ];

    const result = await fileBack(fixture.deps(gatewayWithReplies({}).gateway), {
      module: MODULE,
      title: 'Nur verdichtete Belege',
      answer: 'Eine Antwort ohne verwertbaren Beleg.',
      citations: onlyCondensed,
    });

    expect(result.write.created).toBe(true);
    const doc = await fixture.store.read(result.page.path);
    expect(doc?.body).not.toContain('## Belege');
    expect((doc?.frontmatter as { sources?: string[] })?.sources).toEqual([]);
  });

  it('verweigert leere Eingaben und ein unbekanntes Modul', async () => {
    const fixture = await wikiFixture();
    const deps = fixture.deps(gatewayWithReplies({}).gateway);
    const base = { module: MODULE, title: 'Titel', answer: 'Antwort.', citations: [] };

    await expect(fileBack(deps, { ...base, answer: '   ' })).rejects.toThrow(/Antwort/);
    await expect(fileBack(deps, { ...base, title: '  ' })).rejects.toThrow(/Modul und Titel/);
    await expect(fileBack(deps, { ...base, module: 'gibt-es-nicht' })).rejects.toThrow(
      /gibt-es-nicht/,
    );
  });
});

describe('fileBack: Uhr', () => {
  it('datiert Seite und Chronik auf die uebergebene Zeit', async () => {
    const fixture = await wikiFixture();

    await fileBack(
      { ...fixture.deps(gatewayWithReplies({}).gateway), now: NOW_MS },
      { module: MODULE, title: 'Datum', answer: 'Antwort.', citations: [] },
    );

    expect(parseLog(await fixture.text(LOG_PATH))[0]?.day).toBe(TODAY);
  });
});
