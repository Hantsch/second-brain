/* Picking a due date without a foreign body in the dark layout.

   A raw `input type="date"` writes "dd/mm/yyyy" into the row and opens a
   light-themed system calendar — neither belongs on this screen. Almost every
   due date that comes up during filing is "today" or "tomorrow"; so those two
   sit there as chips, and only someone who needs a different date expands the
   field. The chosen date is shown next to it in mono, formatted according to
   the UI language.

   The value stays the contract: `YYYY-MM-DD` or `null`. */

import { useState } from 'react';
import { Button } from '../atoms/Button';
import { useLanguage, useT } from '../i18n';
import { formatDate } from '../lib/format';

/** Calendar day in local time as `YYYY-MM-DD`. */
function isoDay(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** The same day, shifted by `days` — computed in calendar days. */
function shifted(from: Date, days: number): string {
  return isoDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
}

export interface DueFieldProps {
  /** `YYYY-MM-DD` or `null` for "no due date". */
  value: string | null;
  /** Name of the field for assistive tech, already translated. */
  ariaLabel: string;
  onChange: (value: string | null) => void;
  /** This display's notion of "today". Tests pass a fixed time. */
  now?: Date;
}

export function DueField({ value, ariaLabel, onChange, now = new Date() }: DueFieldProps) {
  const t = useT();
  const language = useLanguage();
  const today = isoDay(now);
  const tomorrow = shifted(now, 1);
  /* A date that neither of the two chips represents — in that case the field stays open. */
  const custom = value !== null && value !== today && value !== tomorrow;
  const [picking, setPicking] = useState(false);
  const open = picking || custom;

  /* A chip that's already active removes the due date again. Otherwise there
     would be no way back to "no due date". */
  const toggle = (day: string): void => {
    setPicking(false);
    onChange(value === day ? null : day);
  };

  return (
    <span className="sb-due" role="group" aria-label={ariaLabel}>
      <span className="sb-due-label">{t('inbox.proposal.due')}</span>
      <span className="sb-due-chips">
        <Button
          size="sm"
          variant={value === today ? 'secondary' : 'ghost'}
          aria-pressed={value === today}
          onClick={() => toggle(today)}
        >
          {t('inbox.proposal.dueToday')}
        </Button>
        <Button
          size="sm"
          variant={value === tomorrow ? 'secondary' : 'ghost'}
          aria-pressed={value === tomorrow}
          onClick={() => toggle(tomorrow)}
        >
          {t('inbox.proposal.dueTomorrow')}
        </Button>
        <Button
          size="sm"
          variant={open ? 'secondary' : 'ghost'}
          aria-pressed={open}
          onClick={() => setPicking(!open)}
        >
          {t('inbox.proposal.duePick')}
        </Button>
      </span>
      {open ? (
        <input
          type="date"
          className="gs-input sb-due-input"
          aria-label={t('inbox.proposal.duePick')}
          value={custom && value !== null ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        />
      ) : null}
      <span className="sb-mono sb-due-value">
        {value === null ? t('inbox.proposal.dueNone') : formatDate(value, language)}
      </span>
    </span>
  );
}
