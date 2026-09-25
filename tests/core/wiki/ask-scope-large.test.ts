/* Story 052, D2: Scope und Projekt filtern jetzt schon in der Suchanfrage, nicht
 * mehr hinterher in `retrieve`. Ohne diese Verlagerung koennte der alte
 * Kandidaten-Schnitt (`MAX_CANDIDATES = 24`) einen passenden, aber schwach
 * bewerteten Treffer schon verwerfen, bevor der Scope-/Projektfilter ihn je zu
 * sehen bekommt — der Beleg waere dann unauffindbar, obwohl er im Vault steht.
 *
 * Der Nachweis braucht einen Vault, in dem der echte Beleg jenseits von
 * `MAX_CANDIDATES` liegt: 30 Fuellnotizen, deren Titel alle Suchbegriffe woertlich
 * tragen und dadurch den strengen UND-Treffer der Suche gewinnen (`search.ts#matched`),
 * plus die eine Antwortnotiz, deren Fliesstext einen Suchbegriff bewusst ausspart —
 * ein schwacher Treffer, der erst ueber den OR-Fallback gefunden wird, sobald der
 * Scope-/Projektfilter die 30 Fuellnotizen (alle `scope: private`) ausschliesst.
 */

import { describe, expect, it } from 'vitest';
import { askQuestion, retrieve } from '@core/wiki';
import type { WikiIndexView } from '@core/wiki';
import type { SearchQuery } from '@shared/types';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { wikiFixture } from './fixtures';

/** Projekt-Slug fuer die Antwortnotiz „in scope". */
const SLUG = 'greenhouse-rollout';
const PROJECT_PATH = `projects/work/${SLUG}/notes/2026-08-09-deadline.md`;
/** Dieselbe Notiz ausserhalb des Projekts — fuer den „nichts gefunden"-Fall. */
const OUTSIDE_PATH = 'areas/greenhouse-outside.md';

const QUESTION = 'Gewaechshausrollout Abgabefrist Lieferantentermin?';
/*
 * Die Antwortnotiz traegt bewusst nur zwei der drei Suchbegriffe im Fliesstext
 * ("Lieferantentermin" fehlt) — das laesst sie in der Volltextsuche den strengen
 * UND-Treffer verfehlen (`search.ts#matched`, AND zuerst, dann OR). Die 30
 * Fuellnotizen tragen alle drei Begriffe im Titel und gewinnen dadurch den
 * strengen UND-Treffer klar — mit `MAX_CANDIDATES = 24` Plaetzen fuer 30
 * gleichwertige Fuellnotizen faellt die Antwortnotiz aus der unbeschraenkten Liste.
 * Erst der Scope-/Projektfilter, der laut D2 direkt in die Suchanfrage geht,
 * schliesst die Fuellnotizen (allesamt `scope: private`) aus und laesst die
 * OR-Suche die Antwortnotiz finden.
 */
const ANSWER_SENTENCE =
  'Fuer den Gewaechshausrollout gilt als Abgabefrist der 30. Oktober, so der aktuelle Stand.';
const SURROUNDING_CONTEXT = [
  ANSWER_SENTENCE,
  'Weitere Absprachen folgen nach der Lieferantenbestätigung.',
].join('\n');

const FRONTMATTER_NOTE = (title: string, scope: 'private' | 'work', body: string): string =>
  [
    '---',
    'type: note',
    `title: ${title}`,
    'created: 2026-08-09',
    'updated: 2026-08-09',
    `scope: ${scope}`,
    'tags: [gewaechshaus]',
    'lang: de',
    '---',
    '',
    body,
    '',
  ].join('\n');

const FRONTMATTER_AREA = (title: string): string =>
  [
    '---',
    'type: area',
    `title: ${title}`,
    'scope: private',
    'created: 2026-02-11',
    'updated: 2026-08-04',
    'tags: [gewaechshaus]',
    'lang: de',
    '---',
    '',
    'Fuellnotiz — traegt die Suchbegriffe nur im Titel, damit sie den echten',
    'Beleg im Titeltreffer-Ranking uebertrifft.',
    '',
  ].join('\n');

/** 30 Fuellnotizen, deren Titel die Suchbegriffe woertlich tragen. */
function fillerNotes(): Record<string, string> {
  const files: Record<string, string> = {};
  for (let index = 1; index <= 30; index += 1) {
    const num = String(index).padStart(2, '0');
    files[`areas/filler-${num}.md`] = FRONTMATTER_AREA(
      `Gewaechshausrollout Abgabefrist Lieferantentermin — Notiz ${num}`,
    );
  }
  return files;
}

/** Die Antwortnotiz unter dem Arbeitsprojekt — Suchbegriffe nur im Fliesstext. */
function inScopeVault(): Record<string, string> {
  return {
    ...fillerNotes(),
    [PROJECT_PATH]: FRONTMATTER_NOTE('Deadline-Notiz', 'work', SURROUNDING_CONTEXT),
  };
}

/** Dieselbe Antwortnotiz, aber ausserhalb des Arbeitsprojekts — private Area. */
function outsideOnlyVault(): Record<string, string> {
  return {
    ...fillerNotes(),
    [OUTSIDE_PATH]: FRONTMATTER_NOTE('Deadline-Notiz (privat)', 'private', SURROUNDING_CONTEXT),
  };
}

const CITED_ANSWER = [
  `Die Abgabefrist steht fest [[${PROJECT_PATH}]].`,
  '',
  `Wörtlich: „${ANSWER_SENTENCE}"`,
].join('\n');

const WORK_PREFIX = `projects/work/${SLUG}/`;

/** Ein Index, der jede Suchanfrage mitschreibt — fuer den Nachweis in Test 5. */
function recordingIndex(inner: WikiIndexView): {
  view: WikiIndexView;
  recordedQueries: SearchQuery[];
} {
  const recordedQueries: SearchQuery[] = [];
  const view: WikiIndexView = {
    index: () => inner.index(),
    search: (query) => {
      recordedQueries.push(query);
      return inner.search(query);
    },
    pages: () => inner.pages(),
    modules: () => inner.modules(),
  };
  return { view, recordedQueries };
}

describe('retrieve/askQuestion: Scope und Projekt filtern schon in der Suche', () => {
  it('a project-scoped question finds the answer below the old candidate cut', async () => {
    const fixture = await wikiFixture(inScopeVault());

    // Sanity check: unscoped, at the old candidate cut, the answer note is not there.
    const unscoped = retrieve(fixture.index, QUESTION, { limit: 24 });
    expect(unscoped.map((entry) => entry.path)).not.toContain(PROJECT_PATH);

    const { gateway } = gatewayWithReplies({ 'query-answer': CITED_ANSWER }, ['query-answer']);
    const answer = await askQuestion(fixture.deps(gateway), {
      question: QUESTION,
      project: SLUG,
    });

    expect(answer.citations.map((citation) => citation.path)).toEqual([PROJECT_PATH]);
    expect(answer.excerpts.every((entry) => entry.path.startsWith(WORK_PREFIX))).toBe(true);
  });

  it('a scope-filtered question finds the answer below the old candidate cut', async () => {
    const fixture = await wikiFixture(inScopeVault());

    const unscoped = retrieve(fixture.index, QUESTION, { limit: 24 });
    expect(unscoped.map((entry) => entry.path)).not.toContain(PROJECT_PATH);

    const { gateway } = gatewayWithReplies({ 'query-answer': CITED_ANSWER }, ['query-answer']);
    const answer = await askQuestion(fixture.deps(gateway), {
      question: QUESTION,
      scope: 'work',
    });

    expect(answer.citations.map((citation) => citation.path)).toEqual([PROJECT_PATH]);
    const byPath = fixture.index.index().byPath;
    expect(answer.excerpts.every((entry) => byPath.get(entry.path)?.scope === 'work')).toBe(true);
  });

  it('nothing found under a scope means the scope has nothing', async () => {
    const fixture = await wikiFixture(outsideOnlyVault());
    const { gateway, provider } = gatewayWithReplies({ 'query-answer': CITED_ANSWER }, [
      'query-answer',
    ]);
    const expected = 'Dazu steht nichts im Vault.';

    const byScope = await askQuestion(fixture.deps(gateway), { question: QUESTION, scope: 'work' });
    expect(byScope.unsupported).toBe(true);
    expect(byScope.excerpts).toEqual([]);
    expect(byScope.answer).toBe(expected);

    const byProject = await askQuestion(fixture.deps(gateway), {
      question: QUESTION,
      project: SLUG,
    });
    expect(byProject.unsupported).toBe(true);
    expect(byProject.excerpts).toEqual([]);
    expect(byProject.answer).toBe(expected);

    expect(provider.callCount).toBe(0);
  });

  it('without a model the excerpts honour the same scope', async () => {
    const fixture = await wikiFixture(inScopeVault());

    const answer = await askQuestion(fixture.deps(emptyGateway()), {
      question: QUESTION,
      scope: 'work',
      project: SLUG,
    });

    expect(answer.usedLlm).toBe(false);
    expect(answer.excerpts.map((entry) => entry.path)).toContain(PROJECT_PATH);
    expect(answer.excerpts.every((entry) => entry.path.startsWith(WORK_PREFIX))).toBe(true);
  });

  it('the search query itself carries scope and project', async () => {
    const fixture = await wikiFixture(inScopeVault());
    const { view, recordedQueries } = recordingIndex(fixture.index);

    retrieve(view, QUESTION, { scope: 'work', project: SLUG });

    expect(recordedQueries.length).toBeGreaterThan(0);
    for (const query of recordedQueries) {
      expect(query.scope).toBe('work');
      expect(query.project).toBe(SLUG);
    }
  });
});
