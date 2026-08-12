/* A line that summarizes the day: "2 overdue - 3 due today - 1 reply
   pending".

   Counted from the reminders, not estimated. Every number is a button that
   jumps to the tile showing the items behind it — but only if that tile is
   visible. A button that leads nowhere because the module is hidden would
   be a button making a false claim.

   If nothing is overdue and nothing is due today, that's exactly what it
   says. An empty line would not be an answer. */

import type { DashboardModuleId, Reminder } from '@shared/types';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';

export interface DaySummaryProps {
  reminders: readonly Reminder[];
  /** Which modules are in the grid? Only those are jumped to. */
  visible: ReadonlySet<DashboardModuleId>;
  onJump: (id: DashboardModuleId) => void;
}

interface Part {
  key: string;
  text: string;
  target: DashboardModuleId;
  /** The tone of the message — overdue is red, not teal. */
  tone: 'danger' | 'warning' | 'muted';
}

export function DaySummary({ reminders, visible, onJump }: DaySummaryProps) {
  const t = useT();
  const overdue = reminders.filter((reminder) => reminder.urgency === 'overdue');
  const today = reminders.filter((reminder) => reminder.urgency === 'today');
  const waiting = reminders.filter((reminder) => reminder.source === 'waiting-overdue');

  /* The color comes from the fact itself, not from clickability: "overdue"
     is `--danger`, "due today" is `--warning`, the rest is calm. Same
     mapping as in the "Upcoming" tile — a headline that contradicts its own
     tile is worse than none at all. That it's clickable is shown by the
     underline on hover and the focus ring. */
  const parts: Part[] = [];
  if (overdue.length > 0) {
    parts.push({
      key: 'overdue',
      text: t('dashboard.summary.overdue', { count: overdue.length }),
      target: 'deadlines',
      tone: 'danger',
    });
  }
  if (today.length > 0) {
    parts.push({
      key: 'today',
      text: t('dashboard.summary.today', { count: today.length }),
      target: 'deadlines',
      tone: 'warning',
    });
  }
  if (waiting.length > 0) {
    parts.push({
      key: 'waiting',
      text: plural(waiting.length, 'dashboard.summary.waitingOne', 'dashboard.summary.waitingMany'),
      target: 'waiting-on',
      tone: 'muted',
    });
  }

  /* The line's heading is included as hidden text, not as an `aria-label`:
     a paragraph is a generic element, and a name attached to it is silently
     dropped by some assistive technologies. */
  return (
    <p className="sb-daysummary">
      <span className="sb-visually-hidden">{`${t('dashboard.summary.label')}: `}</span>
      {parts.length === 0 ? (
        <span className="sb-daysummary-clear">{t('dashboard.summary.clear')}</span>
      ) : (
        parts.map((part, index) => (
          <span key={part.key} className="sb-daysummary-part">
            {index === 0 ? null : <span className="sb-daysummary-dot">·</span>}
            {visible.has(part.target) ? (
              <button
                type="button"
                className={`sb-textlink sb-daysummary-link sb-daysummary-link--${part.tone}`}
                title={t('dashboard.summary.jump', { module: t(`module.${part.target}.name`) })}
                onClick={() => onJump(part.target)}
              >
                {part.text}
              </button>
            ) : (
              <span className={`sb-daysummary-link--${part.tone}`}>{part.text}</span>
            )}
          </span>
        ))
      )}
    </p>
  );
}
