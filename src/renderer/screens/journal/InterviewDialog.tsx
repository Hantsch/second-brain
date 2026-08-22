/* The interview overlay (012, D5): one question, one field, on screen at a
 * time — a focused `Dialog` (size `lg`), not a shell overlay, because it
 * belongs to the open day, not to the shell (Decisions). Gaston allows one
 * teal accent per surface; here that's "answer and continue", exactly the
 * way `CloseDialog` reserves it for "apply".
 *
 * Self-fetching: the dialog owns `journal:interviewPlan` itself
 * (`useInterviewPlan`, enabled only while `open`) — the caller only ever
 * passes `open` / `date` / `onClose`, nothing derived. D6 wires this in with
 * exactly that pair, the same shape `CloseDialog` would have if
 * `JournalScreen.tsx` didn't already trigger its suggestion mutation itself.
 *
 * The plan is read exactly once per opening. From there, progress is local
 * state (`session`): a backbone answer may grow one follow-up question right
 * after itself, but the five topics and their order never change — re-fetching
 * the whole plan after every answer would risk exactly that (Decisions: "the
 * five topics are never extended by the model"). There is no session file —
 * the day file is the only persistence, as the story's Decisions state.
 *
 * The caller is expected to give this component a fresh instance per opening
 * — unmounted while closed, or mounted with a `key` that changes per run
 * (the same contract `CloseDialog` already asks of `JournalScreen.tsx` via
 * `key={suggestion.proposal.createdAt}`) — so `session` below is safe to
 * derive once from the query result instead of resetting it in an effect.
 *
 * "Answer and continue" awaits the write before advancing, so a question is
 * never a step ahead of the file. "Skip" writes nothing at all (Decisions:
 * "a skipped or unanswered question writes nothing"). "Leave and write
 * myself" and Esc (already free via the `Dialog` atom) both just close —
 * whatever was answered already reached the file, one IPC call at a time.
 */

import { useState } from 'react';
import type { JournalInterviewLooseEnd, JournalInterviewStep } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Icon } from '../../atoms/Icon';
import { todayIso } from '../../components/DayList';
import { DialogTurn } from '../../components/DialogTurn';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import {
  useCoachRoute,
  useInterviewMutations,
  useInterviewPlan,
  useJournalDay,
} from '../../lib/queries/journal';

export interface InterviewDialogProps {
  open: boolean;
  date: string;
  onClose: () => void;
}

/**
 * One step in the running order. Either one of the five fixed topics (or a
 * model follow-up inserted after one, `isFollowUp`), or the interview's one
 * optional loose-end question (020, D8) — the latter never gets a follow-up
 * and answers through a different channel entirely (`journal:answerLooseEnd`
 * rather than `journal:interviewAnswer`), so it is its own branch rather than
 * a `JournalInterviewStep` in disguise.
 */
type RunStep =
  | { kind: 'topic'; step: JournalInterviewStep; isFollowUp: boolean }
  | { kind: 'loose-end'; looseEnd: JournalInterviewLooseEnd };

interface Session {
  steps: RunStep[];
  index: number;
  /** Backbone step count from the plan this run opened with — the progress
      line's denominator never grows when a follow-up is inserted. */
  total: number;
}

export function InterviewDialog({ open, date, onClose }: InterviewDialogProps) {
  const t = useT();
  const route = useCoachRoute();
  const plan = useInterviewPlan(date, open);
  const mutations = useInterviewMutations(date);
  /* The loose-end answer (020, D5) always writes into *today*'s file, even
     when this dialog is open on an earlier day (`date` here) — the interview
     button has no "only on today" guard, so that can happen. `today`'s
     current hash is therefore what the guard needs, not `date`'s. Reused
     query key: when `date` already *is* today this is the same cache entry
     `JournalScreen`'s own `useJournalDay(date)` already holds — no second
     fetch. */
  const today = useJournalDay(todayIso());
  const [session, setSession] = useState<Session | null>(null);
  const [answer, setAnswer] = useState('');

  /* Derived, not effect-driven: the first render after the plan arrives
     computes the starting session straight from it; every render after that,
     `session` (set by answer/skip) wins. No reset-on-close effect is needed —
     see the file comment on the remount contract this component expects. */
  const active: Session | null =
    session ??
    (plan.data === undefined
      ? null
      : {
          /* The one optional loose-end question (020, D8) is appended after
             the five fixed topics — it never displaces or reorders them, it
             is purely an addition, exactly as the story's own wording says
             ("appends"). Built once here, from the plan this run opened
             with — same reasoning as the topics themselves not re-fetching
             mid-run. */
          steps: [
            ...plan.data.steps.map((step): RunStep => ({ kind: 'topic', step, isFollowUp: false })),
            ...(plan.data.looseEnd === null
              ? []
              : [{ kind: 'loose-end', looseEnd: plan.data.looseEnd } as RunStep]),
          ],
          index: 0,
          total: plan.data.steps.length + (plan.data.looseEnd === null ? 0 : 1),
        });

  const current =
    active !== null && active.index < active.steps.length ? active.steps[active.index] : undefined;
  const finished = active !== null && current === undefined;
  const busy =
    mutations.answer.isPending ||
    mutations.followUp.isPending ||
    mutations.answerLooseEnd.isPending;

  /** The question text on screen, verbatim for a fixed topic (Decisions: it's
      document-language content, not UI chrome), built through `t()` for the
      loose-end step (nothing about its wording is ever written to a file —
      only the typed answer is, through `journal:answerLooseEnd`), quoting the
      user's own sentence back rather than asserting anything happened. */
  function questionOf(entry: RunStep): string {
    return entry.kind === 'topic'
      ? entry.step.question
      : t('journal.interview.looseEnd.question', { quote: entry.looseEnd.quote });
  }

  async function handleAnswer(): Promise<void> {
    /* Guards against a fast double Ctrl+Enter re-entering this function with
       the same `current`/`answer` before the first write's `setAnswer('')`
       has landed, which would append the same question/answer pair twice —
       `busy` already gates the button (`disabled={busy}` below), the keyboard
       path needs the identical guard since it calls this function directly. */
    if (active === null || current === undefined || busy) return;
    const text = answer.trim();
    if (text.length === 0) return;

    /* The loose-end question's own path (020, D5): it writes through
       `journal:answerLooseEnd`, never through `journal:interviewAnswer` — no
       question text lands in the file, and there's no follow-up round for it. */
    if (current.kind === 'loose-end') {
      try {
        await mutations.answerLooseEnd.mutateAsync({
          id: current.looseEnd.id,
          day: current.looseEnd.day,
          text,
          expectedHash: today.data?.doc.hash,
        });
      } catch {
        /* Surfaced via `mutations.answerLooseEnd.error` below — the run does
           not advance on a failed write, same as the fixed topics. */
        return;
      }
      setAnswer('');
      setSession({ steps: active.steps, index: active.index + 1, total: active.total });
      return;
    }

    try {
      await mutations.answer.mutateAsync({ step: current.step, answer: text });
    } catch {
      /* Already surfaced to the user via `mutations.answer.error` below —
         nothing further to do here, and nothing advances on a failed write. */
      return;
    }
    setAnswer('');

    /* One optional follow-up per backbone answer, never for a follow-up's own
       answer — otherwise the interview could grow without end. A follow-up
       that fails to arrive is not the backbone's problem: the run continues
       without one, same as `noModel: true`. */
    let steps = active.steps;
    if (!current.isFollowUp) {
      try {
        const result = await mutations.followUp.mutateAsync({ step: current.step, answer: text });
        if (result.question !== null) {
          const inserted: RunStep = {
            kind: 'topic',
            step: { topic: current.step.topic, question: result.question },
            isFollowUp: true,
          };
          steps = [...steps.slice(0, active.index + 1), inserted, ...steps.slice(active.index + 1)];
        }
      } catch {
        /* No follow-up this time — the backbone keeps going. */
      }
    }
    setSession({ steps, index: active.index + 1, total: active.total });
  }

  function handleSkip(): void {
    if (active === null || current === undefined) return;
    setAnswer('');
    setSession({ ...active, index: active.index + 1 });
  }

  /* The backbone question number: follow-ups don't move it — answering a
     follow-up still reads as "on backbone question N", not N+1. The
     loose-end step counts as its own question (it's neither a follow-up nor
     one of the five topics, but still a step you answer or skip). */
  const backboneNumber =
    active === null
      ? 0
      : active.steps
          .slice(0, active.index + 1)
          .filter((entry) => entry.kind !== 'topic' || !entry.isFollowUp).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('journal.interview.title')}
      description={t('journal.interview.description')}
      size="lg"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('journal.interview.leave')}
          </Button>
          {current === undefined ? null : (
            <>
              <Button variant="secondary" onClick={handleSkip} disabled={busy}>
                {t('journal.interview.skip')}
              </Button>
              <Button
                icon="check"
                loading={busy}
                disabled={answer.trim().length === 0}
                onClick={() => void handleAnswer()}
              >
                {t('journal.interview.answer')}
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="sb-interview">
        {/* Which engine is running. The fixed-vs-model split itself comes
            from `plan.data.mode` — the server-side truth, decided by
            `gateway.isAvailable('journal-chat')` (provider present, enabled,
            keyed), not re-derived from `useCoachRoute`'s routing-config-only
            view. The two can disagree (e.g. a route configured for a
            disabled or key-less provider): showing "goes to Anthropic" while
            the plan actually runs `fixed` would be exactly the kind of
            unbacked claim guardrail 3 forbids. `route` still supplies the
            cosmetic detail — local vs. remote, the provider's name — once
            `mode` has already confirmed a model is genuinely in play. */}
        {plan.data === undefined ? null : (
          <p className="sb-privacy">
            <Icon name={plan.data.mode === 'model' && route.local ? 'sprout' : 'globe'} size={13} />
            {plan.data.mode !== 'model' ? (
              <span>{t('journal.interview.engine.fixed')}</span>
            ) : route.local ? (
              <span>{t('journal.interview.engine.model.local')}</span>
            ) : (
              <span>
                {t('journal.interview.engine.model.remote', { provider: route.provider ?? '' })}
              </span>
            )}
          </p>
        )}

        {finished ? (
          <p className="sb-panel-empty">{t('journal.interview.done.body')}</p>
        ) : current === undefined ? (
          plan.isError ? (
            <ErrorState error={plan.error} variant="secondary" subject={date} />
          ) : (
            <p className="sb-panel-empty">{t('common.loading')}</p>
          )
        ) : (
          <>
            <span className="sb-mono">
              {t('journal.interview.progress', {
                current: backboneNumber,
                total: active?.total ?? 0,
              })}
            </span>

            {/* A fixed topic's question is verbatim as `interviewPlan`
                returned it — never through `t()` (Decisions: the question
                texts are a document-language table in the core, not UI
                chrome). The loose-end question is the one exception
                (`questionOf`): nothing about its wording is ever written to a
                file, so it is genuinely UI text, built with the user's own
                quoted sentence. Both render through `DialogTurn` purely for
                the existing visual: legible as the app's turn, exactly as a
                fixed topic will look once written into the day stream (D2). */}
            <DialogTurn turn={{ role: 'assistant', text: questionOf(current), at: null }} />

            <label className="gs-label" htmlFor="sb-interview-field">
              {t('journal.interview.field.label')}
            </label>
            <textarea
              id="sb-interview-field"
              className="gs-input"
              rows={4}
              placeholder={t('journal.interview.field.placeholder')}
              value={answer}
              disabled={busy}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  /* `handleAnswer` itself re-checks `busy`/empty — this check
                     is defense in depth so an already-disabled field never
                     even attempts a second call. */
                  if (!busy && answer.trim().length > 0) void handleAnswer();
                }
              }}
            />

            {mutations.answer.error ? (
              <ErrorState error={mutations.answer.error} variant="secondary" subject={date} />
            ) : mutations.answerLooseEnd.error ? (
              <ErrorState
                error={mutations.answerLooseEnd.error}
                variant="secondary"
                subject={date}
              />
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
