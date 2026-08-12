/* Eine Zeile, die den Tag zusammenfasst: „2 überfällig · 3 heute fällig ·
   1 Antwort ausstehend".

   Gezählt wird aus den Erinnerungen, nicht geschätzt. Jede Zahl ist ein Knopf,
   der zu der Kachel springt, die die Sachen dahinter zeigt — und zwar nur dann,
   wenn diese Kachel sichtbar ist. Ein Knopf, der ins Nichts führt, weil das Modul
   ausgeblendet ist, wäre ein Knopf, der etwas behauptet.

   Ist nichts überfällig und nichts heute fällig, steht genau das da. Eine leere
   Zeile wäre keine Antwort. */

import type { DashboardModuleId, Reminder } from '@shared/types';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';

export interface DaySummaryProps {
  reminders: readonly Reminder[];
  /** Welche Module stehen im Gitter? Nur dorthin wird gesprungen. */
  visible: ReadonlySet<DashboardModuleId>;
  onJump: (id: DashboardModuleId) => void;
}

interface Part {
  key: string;
  text: string;
  target: DashboardModuleId;
  /** Der Ton der Nachricht — überfällig ist rot, nicht teal. */
  tone: 'danger' | 'warning' | 'muted';
}

export function DaySummary({ reminders, visible, onJump }: DaySummaryProps) {
  const t = useT();
  const overdue = reminders.filter((reminder) => reminder.urgency === 'overdue');
  const today = reminders.filter((reminder) => reminder.urgency === 'today');
  const waiting = reminders.filter((reminder) => reminder.source === 'waiting-overdue');

  /* Die Farbe kommt aus der Sache, nicht aus der Klickbarkeit: „überfällig" ist
     `--danger`, „heute fällig" `--warning`, der Rest ruhig. Dieselbe Zuordnung wie
     in der Kachel „Steht an" — eine Kopfzeile, die ihrer eigenen Kachel
     widerspricht, ist schlimmer als keine. Dass man klicken kann, zeigt der
     Unterstrich unter dem Zeiger und der Fokusring. */
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

  /* Die Überschrift der Zeile steht als versteckter Text darin, nicht als
     `aria-label`: ein Absatz ist ein generisches Element, und ein Name daran
     wird von manchen Hilfsmitteln stillschweigend verworfen. */
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
