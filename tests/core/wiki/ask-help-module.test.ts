/* The help module is ordinary vault content: a question about how Gaston works is answered
 * from its pages, with the page path as citation, and without a model the hits are the
 * answer. */

import { describe, expect, it } from 'vitest';
import { HELP_AGENT_PAGE } from '@shared/help-module';
import { renderHelpModule } from '@core/agent/help/render';
import { askQuestion } from '@core/wiki';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { wikiFixture } from './fixtures';

const QUESTION = 'How do proposals work?';
const VERBATIM = 'Everything outside the wiki layer is a proposal.';

async function helpFixture() {
  const extra: Record<string, string> = {};
  for (const file of renderHelpModule()) extra[file.path] = file.content;
  return wikiFixture(extra);
}

describe('asking about Gaston', () => {
  it('a question about proposals cites the help module agent page', async () => {
    const fixture = await helpFixture();
    const reply = [
      `Proposals are written to a folder [[${HELP_AGENT_PAGE}]].`,
      '',
      `Quote: „${VERBATIM}"`,
    ].join('\n');
    const { gateway } = gatewayWithReplies({ 'query-answer': reply }, ['query-answer']);

    const answer = await askQuestion(fixture.deps(gateway, 'en'), { question: QUESTION });

    expect(answer.usedLlm).toBe(true);
    expect(answer.unsupported).toBe(false);
    expect(answer.citations.map((citation) => citation.path)).toContain(HELP_AGENT_PAGE);
  });

  it('without a model the search hits include the agent page', async () => {
    const fixture = await helpFixture();

    const answer = await askQuestion(fixture.deps(emptyGateway(), 'en'), {
      question: QUESTION,
      limit: 10,
    });

    expect(answer.usedLlm).toBe(false);
    expect(answer.excerpts.map((excerpt) => excerpt.path)).toContain(HELP_AGENT_PAGE);
  });
});
