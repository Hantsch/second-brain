/* Status questions: "what is open at work?" is answered from the open todos — the
   full-text search finds nothing for it, because no checkbox holds the question's
   words. Each piece of evidence is the checkbox line verbatim, with path and line. */

import { describe, expect, it } from 'vitest';
import { askQuestion } from '@core/wiki';
import { statusExcerpts, statusQuestion } from '@core/wiki/status';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { WORK_PROJECT } from '../../fixtures';
import { wikiFixture } from './fixtures';

/* The question from the bug report: none of its words stand in any todo. */
const WORK_QUESTION = 'was ist in der arbeit offen um was muss ich mich kümmern?';
const WORK_PROJECT_PATH = `projects/work/${WORK_PROJECT}/project.md`;
const ABNAHME = 'Abnahmeprotokoll mit Miriam durchgehen';
const HOCHBEET = 'Erde und Kompost holen';

const DONE_PROJECT_PATH = 'projects/work/altes-portal/project.md';
const DONE_PROJECT_TODO = 'Altlasten im alten Portal aufraeumen';

function doneProject(): Record<string, string> {
  return {
    [DONE_PROJECT_PATH]: [
      '---',
      'type: project',
      'title: Altes Portal',
      'slug: altes-portal',
      'scope: work',
      'status: done',
      '---',
      '',
      '# Altes Portal',
      '',
      `- [ ] ${DONE_PROJECT_TODO}`,
      '',
    ].join('\n'),
  };
}

describe('statusQuestion', () => {
  it('recognises a status question and reads its scope', () => {
    expect(statusQuestion(WORK_QUESTION)).toEqual({ scope: 'work', narrowing: [] });
    expect(statusQuestion('Was steht privat an?')).toEqual({ scope: 'private', narrowing: [] });
    expect(statusQuestion('Welche Todos habe ich privat?')).toEqual({
      scope: 'private',
      narrowing: [],
    });
    expect(statusQuestion('what is due this week at work')).toEqual({
      scope: 'work',
      narrowing: [],
    });
  });

  it('keeps the words that narrow it down and ignores other questions', () => {
    expect(statusQuestion('Welche Todos habe ich für das Hochbeet?')).toEqual({
      scope: null,
      narrowing: ['hochbeet'],
    });
    expect(statusQuestion('Wie lange leben Access-Token?')).toBeNull();
    // 'open' is a status word, 'openai' is not.
    expect(statusQuestion('Was weiß ich über OpenAI?')).toBeNull();
  });
});

describe('statusExcerpts', () => {
  it('quotes the open work todos verbatim, with path and line', async () => {
    const fixture = await wikiFixture(doneProject());

    const excerpts = statusExcerpts(fixture.index, WORK_QUESTION);

    const abnahme = excerpts.find((entry) => entry.title === ABNAHME);
    expect(abnahme?.path).toBe(WORK_PROJECT_PATH);
    const fileLine = (await fixture.text(WORK_PROJECT_PATH)).split('\n')[(abnahme?.line ?? 0) - 1];
    expect(abnahme?.quote).toBe(fileLine?.trim());
    expect(abnahme?.quote).toContain(`- [ ] ${ABNAHME}`);
    // Done todos, private todos and todos of a finished project are not open work.
    expect(excerpts.some((entry) => entry.quote.includes('WebP'))).toBe(false);
    expect(excerpts.some((entry) => entry.title === HOCHBEET)).toBe(false);
    expect(excerpts.some((entry) => entry.title === DONE_PROJECT_TODO)).toBe(false);
  });

  it('takes both scopes without a scope word, and the chat scope over the question', async () => {
    const fixture = await wikiFixture();

    const both = statusExcerpts(fixture.index, 'Was ist noch offen?');
    expect(both.some((entry) => entry.title === ABNAHME)).toBe(true);
    expect(both.some((entry) => entry.title === HOCHBEET)).toBe(true);

    const privateOnly = statusExcerpts(fixture.index, WORK_QUESTION, { scope: 'private' });
    expect(privateOnly.some((entry) => entry.title === HOCHBEET)).toBe(true);
    expect(privateOnly.some((entry) => entry.title === ABNAHME)).toBe(false);
  });

  it('narrows to matching todos, and gives none when nothing matches', async () => {
    const fixture = await wikiFixture();

    const hochbeet = statusExcerpts(fixture.index, 'Welche Todos habe ich für das Hochbeet?');
    expect(hochbeet.length).toBeGreaterThan(0);
    expect(hochbeet.every((entry) => entry.path.includes('hochbeet-bauen'))).toBe(true);

    expect(statusExcerpts(fixture.index, 'Was kann ich gegen Rückenschmerzen tun?')).toEqual([]);
  });
});

describe('askQuestion with a status question', () => {
  it('answers from the todos with a model, citing the project file', async () => {
    const fixture = await wikiFixture();
    const reply = `Als Nächstes steht an: ${ABNAHME} [[${WORK_PROJECT_PATH}]].`;
    const { gateway } = gatewayWithReplies({ 'query-answer': reply }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway), { question: WORK_QUESTION });

    expect(answer.unsupported).toBe(false);
    expect(answer.usedLlm).toBe(true);
    expect(answer.citations.map((citation) => citation.path)).toContain(WORK_PROJECT_PATH);
    expect(answer.excerpts.some((entry) => entry.title === ABNAHME)).toBe(true);
  });

  it('lists the todos without a model instead of saying nothing was found', async () => {
    const fixture = await wikiFixture();

    const answer = await askQuestion(fixture.deps(emptyGateway()), { question: WORK_QUESTION });

    expect(answer.unsupported).toBe(false);
    expect(answer.usedLlm).toBe(false);
    expect(answer.answer).toContain(ABNAHME);
    expect(answer.answer).toContain(WORK_PROJECT_PATH);
  });

  it('still says honestly when nothing is open that matches', async () => {
    const fixture = await wikiFixture();

    const answer = await askQuestion(fixture.deps(emptyGateway()), {
      question: 'Was ist beim Segelboot offen?',
    });

    expect(answer.unsupported).toBe(true);
    expect(answer.excerpts).toEqual([]);
  });
});
