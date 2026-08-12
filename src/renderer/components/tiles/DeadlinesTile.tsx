/* Anstehende Fristen: Projekt-Deadlines und Todo-Fristen in einer Liste.

   Beides kommt aus den Erinnerungen — dort ist der Horizont aus den Einstellungen
   schon angewandt und überfällig steht oben. Datum in Mono, daneben die Tage bis
   dahin; die Farbe ist Beiwerk, der Satz trägt die Aussage.

   „Ruhig stellen" ist die einzige Aktion und sie tut genau das: die Erinnerung
   verschwindet bis zu einem Tag, den der Nutzer wählt (heute, morgen, nächste
   Woche, eigenes Datum). Die Frist selbst bleibt in der Datei — verschoben wird
   sie im Projekt oder am Todo. Und jede Ruhigstellung trägt ihren Rückweg in der
   Meldung: `reminders:unsnooze` mahnt sofort wieder. */

import { useNavigate } from 'react-router-dom';
import type { Reminder } from '@shared/types';
import { useLanguage, useT } from '../../i18n';
import { formatDate, formatDue } from '../../lib/format';
import { pushToast } from '../../lib/toast';
import {
  useOverviewSettings,
  useReminders,
  useSnoozeReminder,
  useUnsnoozeReminder,
} from '../../lib/queries/dashboard';
import { SnoozeMenu } from '../SnoozeMenu';
import { TileFrame } from '../TileFrame';

const LIMIT = 5;

const SOURCES: readonly Reminder['source'][] = ['project-deadline', 'todo-due'];

/** Die Farbe folgt der Dringlichkeit; die Aussage steht im Text daneben. */
function tone(reminder: Reminder): 'overdue' | 'soon' | 'later' {
  if (reminder.urgency === 'overdue') return 'overdue';
  return reminder.urgency === 'today' ? 'soon' : 'later';
}

export function DeadlinesTile() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const overview = useOverviewSettings();
  const { data, isPending, error, refetch } = useReminders();
  const snooze = useSnoozeReminder();
  const unsnooze = useUnsnoozeReminder();

  const all = (data ?? []).filter((reminder) => SOURCES.includes(reminder.source));
  const rows = all.slice(0, LIMIT);

  return (
    <TileFrame
      id="deadlines"
      title={t('module.deadlines.name')}
      count={all.length > 0 ? all.length : null}
      pending={isPending}
      error={error ?? snooze.error}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0}
      empty={{ body: t('tile.deadlines.empty', { days: overview?.deadlineHorizonDays ?? 14 }) }}
      foot={
        all.length > LIMIT ? (
          <span className="sb-tile-rest sb-mono">
            {t('tile.more', { count: all.length - LIMIT })}
          </span>
        ) : undefined
      }
    >
      <ul className="sb-lines">
        {rows.map((reminder) => (
          <li key={reminder.id} className="sb-line">
            <button
              type="button"
              className="sb-line-open"
              title={reminder.title}
              onClick={() =>
                void navigate(
                  reminder.project === null
                    ? '/projects?tab=todos'
                    : `/projects?p=${encodeURIComponent(reminder.project)}`,
                )
              }
            >
              {reminder.title}
            </button>
            <span className="sb-line-detail">
              {t(
                reminder.source === 'project-deadline'
                  ? 'tile.deadlines.project'
                  : 'tile.deadlines.todo',
              )}
            </span>
            <span className="sb-line-right">
              <span className={`sb-line-meta sb-due--${tone(reminder)}`}>
                <span className="sb-mono">{formatDate(reminder.date, language)}</span>
                {' · '}
                {formatDue(reminder.daysOut)}
              </span>
              <SnoozeMenu
                label={t('tile.deadlines.snooze', { title: reminder.title })}
                disabled={snooze.isPending}
                onSnooze={(days, until) =>
                  snooze.mutate(
                    { id: reminder.id, days },
                    {
                      onSuccess: () =>
                        pushToast('info', {
                          message: 'reminder.snooze.done',
                          values: { date: formatDate(until, language) },
                          action: {
                            label: 'reminder.snooze.undo',
                            run: () =>
                              unsnooze.mutate(reminder.id, {
                                onSuccess: () => pushToast('info', 'reminder.snooze.undone'),
                              }),
                          },
                        }),
                    },
                  )
                }
              />
            </span>
          </li>
        ))}
      </ul>
    </TileFrame>
  );
}
