/**
 * The interview's optional follow-up (012, D3): once a backbone question is
 * answered (`interview.ts#recordAnswer`), ask a model whether one small
 * follow-up deepens it. `INTERVIEW_TOPICS` stays fixed either way — this is
 * one extra question about an answer already given, never a sixth topic.
 *
 * Same shape as `facts.ts#dayFacts`: check `isAvailable` first, call the
 * gateway inside try/catch, never throw except on the caller's own abort.
 * The one addition this task needs is a second failure mode `dayFacts`
 * doesn't have to distinguish: a model that *answered* but produced nothing
 * usable is not the same as no model being configured at all. Reporting the
 * first as the second would send the user to routing settings to fix a
 * problem that isn't there.
 */

import { LlmUnavailableError, isAbortError } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import { journalInterviewFollowupPrompt } from '@core/llm/prompts';
import type { DocLanguage } from '@shared/types';
import type { InterviewStep } from './types';

/**
 * A follow-up is a quick, single-sentence question, not an essay — this is
 * generous for that (a screen or two of German prose easily fits), but still
 * short enough to reject a model that ignored the instruction and wrote a
 * paragraph.
 */
const MAX_QUESTION_CHARS = 200;

/** Everything `interviewFollowup` needs — mirrors `FactsDeps`/`CoachDeps`. */
export interface InterviewFollowupDeps {
  gateway: LlmGateway;
  docLanguage?: DocLanguage;
  signal?: AbortSignal;
}

export interface InterviewFollowupInput {
  /** The backbone step just answered — its `question` is what the follow-up refers to. */
  step: InterviewStep;
  /** The user's own answer to that step, verbatim. */
  answer: string;
  /** Project names touched today, if known — context only, never a claim. */
  projects?: readonly string[];
  /** Todo texts due around today, if known — context only, never a claim. */
  todosDue?: readonly string[];
}

export interface InterviewFollowupResult {
  /** The follow-up question, or `null` if none came back or none passed validation. */
  question: string | null;
  /**
   * No model is routed/reachable for this task at all. `false` with
   * `question: null` means the opposite: a model answered, but nothing it
   * said held up — that is not a configuration problem.
   */
  noModel: boolean;
}

/**
 * Is `raw` a single, short, real question? Applied to the model's answer
 * regardless of what it returned — the prompt asks for exactly this shape,
 * but nothing from a model is trusted without a check of its own.
 */
function sanitizeFollowup(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_QUESTION_CHARS) return null;
  if (text.includes('\n')) return null;
  if (!text.endsWith('?')) return null;
  /* More than one '?' reads as two questions stacked into one reply — the
     prompt asked for exactly one. */
  if ((text.match(/\?/g) ?? []).length > 1) return null;
  return text;
}

/**
 * At most one follow-up per call — there is no retry loop here, so this is
 * naturally the only candidate that can ever come back.
 */
export async function interviewFollowup(
  deps: InterviewFollowupDeps,
  input: InterviewFollowupInput,
): Promise<InterviewFollowupResult> {
  if (!deps.gateway.isAvailable('journal-chat')) {
    return { question: null, noModel: true };
  }

  try {
    const result = await deps.gateway.complete({
      task: 'journal-chat',
      messages: journalInterviewFollowupPrompt(
        {
          question: input.step.question,
          answer: input.answer,
          ...(input.projects === undefined ? {} : { projects: input.projects }),
          ...(input.todosDue === undefined ? {} : { todosDue: input.todosDue }),
        },
        deps.docLanguage ?? 'de',
      ),
      temperature: 0.3,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    return { question: sanitizeFollowup(result.text), noModel: false };
  } catch (error) {
    /* No route, a disabled provider, an unreachable model: an honest "no
       model" state, exactly like `coach.ts`. */
    if (error instanceof LlmUnavailableError) {
      return { question: null, noModel: true };
    }
    /* Only the caller's own abort propagates — same convention as
       `facts.ts#dayFacts`. */
    if (isAbortError(error)) throw error;
    /* Network hiccup, malformed provider response, broken JSON: a model was
       reachable but the answer didn't hold up. That is a "no good
       follow-up", not "no model configured". */
    return { question: null, noModel: false };
  }
}
