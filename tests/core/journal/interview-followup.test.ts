/* The interview's optional follow-up (012, D3). Checked here:

   - With a model routed and a well-formed reply, the follow-up comes back.
   - A reply that isn't a real single question — a statement, empty, or
     over-long — is discarded: `question: null`, `noModel: false`, never a
     throw. A broken model answer is not the same as no model configured.
   - Without a route for `journal-chat` (`emptyGateway()`), the mandatory
     "no model configured" case: `{ question: null, noModel: true }`.
   - The prompt itself carries the guardrail against asserting facts about
     the user — the same forbidden-phrase-style check `tests/core/llm/prompts.test.ts`
     runs on the other prompts. */

import { describe, expect, it } from 'vitest';
import { journalInterviewFollowupPrompt } from '@core/llm';
import type { ChatTurn } from '@shared/types';
import { interviewFollowup } from '@core/journal';
import type { InterviewStep } from '@core/journal';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';

const STEP: InterviewStep = { topic: 'work', question: 'Woran hast du heute gearbeitet?' };

function systemOf(turns: ChatTurn[]): string {
  return turns.find((turn) => turn.role === 'system')?.content ?? '';
}

describe('interviewFollowup', () => {
  it('gibt eine gültige Rückfrage zurück, wenn das Modell eine liefert', async () => {
    const { gateway } = gatewayWithReplies({
      'journal-chat': 'Was genau hat am Rollout am längsten gedauert?',
    });

    const result = await interviewFollowup({ gateway }, { step: STEP, answer: 'Am Rollout.' });

    expect(result).toEqual({
      question: 'Was genau hat am Rollout am längsten gedauert?',
      noModel: false,
    });
  });

  it('verwirft eine Antwort, die eine Aussage statt einer Frage ist', async () => {
    const { gateway } = gatewayWithReplies({
      'journal-chat': 'Das klingt nach einem anstrengenden Tag.',
    });

    const result = await interviewFollowup({ gateway }, { step: STEP, answer: 'Am Rollout.' });

    expect(result).toEqual({ question: null, noModel: false });
  });

  it('verwirft eine leere Antwort', async () => {
    const { gateway } = gatewayWithReplies({ 'journal-chat': '   ' });

    const result = await interviewFollowup({ gateway }, { step: STEP, answer: 'Am Rollout.' });

    expect(result).toEqual({ question: null, noModel: false });
  });

  it('verwirft eine überlange Antwort', async () => {
    const { gateway } = gatewayWithReplies({
      'journal-chat': `${'Was hat am Rollout so lange gedauert und was hättest du gerne anders gemacht '.repeat(5)}?`,
    });

    const result = await interviewFollowup({ gateway }, { step: STEP, answer: 'Am Rollout.' });

    expect(result).toEqual({ question: null, noModel: false });
  });

  it('meldet "kein Modell", wenn für journal-chat keine Route existiert', async () => {
    const result = await interviewFollowup(
      { gateway: emptyGateway() },
      { step: STEP, answer: 'Am Rollout.' },
    );

    expect(result).toEqual({ question: null, noModel: true });
  });
});

describe('journalInterviewFollowupPrompt', () => {
  it('verbietet, dem Nutzer etwas zu unterstellen, das nicht gesagt wurde', () => {
    const system = systemOf(
      journalInterviewFollowupPrompt({ question: STEP.question, answer: 'Am Rollout.' }, 'de'),
    );

    expect(system).toContain('Behaupte nichts über den Nutzer');
    expect(system).toContain('Erfinde keine Ereignisse, Personen, Gefühle oder Schlussfolgerungen');
  });

  it('verlangt genau einen Satz, keine Aufzählung, keine Aussage', () => {
    const system = systemOf(
      journalInterviewFollowupPrompt({ question: STEP.question, answer: 'Am Rollout.' }, 'de'),
    );

    expect(system).toContain('genau einem Satz');
    expect(system).toContain('keine zweite Frage');
  });

  it('gibt Frage und Antwort wörtlich in den Nutzer-Turn', () => {
    const turns = journalInterviewFollowupPrompt(
      { question: STEP.question, answer: 'Am Rollout.', projects: ['nyota-auth0-migration'] },
      'de',
    );
    const user = turns.find((turn) => turn.role === 'user')?.content ?? '';

    expect(user).toContain(STEP.question);
    expect(user).toContain('Am Rollout.');
    expect(user).toContain('nyota-auth0-migration');
  });
});
