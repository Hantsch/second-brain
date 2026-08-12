/* A deadline as a chip. Overdue red, today or soon amber, otherwise calm.

   The color is decoration: the chip carries the date in mono and, where
   there's room, the sentence describing it ("2 days overdue"). Anyone who
   can't see the color reads the same thing. */

import { Icon } from '../atoms/Icon';
import { useLanguage } from '../i18n';
import { dayDiff, dueTone, formatDate, formatDue } from '../lib/format';

export interface DeadlineChipProps {
  /** ISO day or `null` for "no deadline". */
  date: string | null;
  /**
   * Days until the deadline; negative is overdue. If the value is missing,
   * it's computed from the date — the index already supplies it for todos.
   */
  dueInDays?: number | null;
  /** Also write out the sentence about the deadline, not just the date. */
  relative?: boolean;
  /** The "today" of this display. Tests pass a fixed time. */
  now?: Date;
}

export function DeadlineChip({ date, dueInDays, relative = false, now }: DeadlineChipProps) {
  const language = useLanguage();
  if (date === null || date.length === 0) return null;
  const days =
    dueInDays === undefined || dueInDays === null
      ? dayDiff(now ?? new Date(), new Date(`${date}T00:00:00`))
      : dueInDays;
  const tone = dueTone(days);
  const sentence = formatDue(days);
  return (
    <span className={`sb-deadline sb-deadline--${tone}`} title={sentence}>
      <Icon name="clock" size={11} />
      <span className="sb-deadline-date">{formatDate(date, language)}</span>
      {relative ? <span className="sb-deadline-rel">{sentence}</span> : null}
    </span>
  );
}
