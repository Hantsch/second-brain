/* A loose end, shown on the day it was announced (022, D6): the interview
 * (`InterviewDialog.tsx`) and the maintenance report (`LooseEndCard.tsx`)
 * already ask this same question elsewhere — this row is the third, most
 * direct spot, right on the day itself, no detour through either of them
 * required.
 *
 * `dayView.looseEnds` is already filtered to "open" by `openLooseEnds()`
 * (020, D5's own single source of truth) — this component trusts that and
 * runs no second check of its own. Answering writes through
 * `journal:answerLooseEnd` (via `onAnswer`, owned by the caller, the same
 * mutation `InterviewDialog.tsx` uses) and clears the field; the row itself
 * disappears once the day refetches and the loose end is no longer open,
 * the same way it does everywhere else this list is read.
 *
 * Visually a compact line, not a card: several of these can stack above the
 * entry stream without dominating the day the way `LooseEndCard.tsx` — a
 * full `FindingCard` — is allowed to on the maintenance screen. */

import { useState } from 'react';
import type { JournalInterviewLooseEnd } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { Input } from '../../atoms/Input';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

export interface LooseEndRowProps {
  looseEnd: JournalInterviewLooseEnd;
  /** True while this row's own answer is being written — not just any
      loose end's, so two open rows never show each other as busy. */
  busy: boolean;
  error?: unknown;
  onAnswer: (text: string) => void;
}

export function LooseEndRow({ looseEnd, busy, error, onAnswer }: LooseEndRowProps) {
  const t = useT();
  const [text, setText] = useState('');

  const submit = (): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) return;
    onAnswer(trimmed);
    setText('');
  };

  return (
    <div className="sb-looseend-row">
      <blockquote className="sb-looseend-quote sb-looseend-row-quote">
        {t('journal.looseEnd.quote', { quote: looseEnd.quote })}
      </blockquote>
      <span className="sb-looseend-answer">
        <Input
          className="sb-looseend-answer-input"
          label={t('journal.looseEnd.answerLabel')}
          placeholder={t('journal.looseEnd.answerPlaceholder')}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submit();
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          icon="check"
          loading={busy}
          disabled={text.trim().length === 0}
          onClick={submit}
        >
          {t('journal.looseEnd.answerSubmit')}
        </Button>
      </span>
      {error === undefined || error === null ? null : (
        <ErrorState error={error} variant="secondary" />
      )}
    </div>
  );
}
