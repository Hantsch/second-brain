/* Kommende Erwaehnungen: eine Ankuendigung im Tagebuch, deren Tag noch bevor-
   steht (070 D2/D3). Die andere Haelfte von `LooseEndsTile`, im selben Fenster
   gespiegelt und deshalb bewusst dasselbe Zeilenmuster — mit einem Unterschied:
   diese Kachel ist vollstaendig lesend.

   Kein `SnoozeMenu`: eine Sache ruhig zu stellen, bevor ihr Tag ueberhaupt
   gekommen ist, hat keine Bedeutung — das Ruhen existiert erst, sobald daraus
   ein loses Ende wird. Der einzige Sprung ist der in den Tageseintrag, an dem
   angekuendigt wurde; der Zieltag selbst steht daneben als Text.

   `reminder.date` ist bei dieser Quelle das Datum, fuer das etwas angekuendigt
   wurde (`core/overview/reminders.ts#fromUpcomingMentions`); der Tag der
   Ankuendigung selbst steckt nur im Dateinamen von `reminder.path` — genau wie
   bei `LooseEndsTile`. */

import { useNavigate } from 'react-router-dom';
import { useLanguage, useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useReminders } from '../../lib/queries/dashboard';
import { TileFrame } from '../TileFrame';

const LIMIT = 5;

/** Journal day files always end in their own ISO date. */
const DAY_IN_PATH = /(\d{4}-\d{2}-\d{2})\.md$/;

function announcedDay(path: string): string | null {
  return DAY_IN_PATH.exec(path)?.[1] ?? null;
}

export function UpcomingMentionsTile() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useReminders();

  const all = (data ?? []).filter((reminder) => reminder.source === 'upcoming-mention');
  const rows = all.slice(0, LIMIT);

  return (
    <TileFrame
      id="upcoming-mentions"
      title={t('module.upcoming-mentions.name')}
      count={all.length > 0 ? all.length : null}
      pending={isPending}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0}
      empty={{ body: t('tile.upcomingMentions.empty') }}
      foot={
        all.length > LIMIT ? (
          <span className="sb-tile-rest sb-mono">
            {t('tile.more', { count: all.length - LIMIT })}
          </span>
        ) : undefined
      }
    >
      <ul className="sb-lines">
        {rows.map((reminder) => {
          const day = announcedDay(reminder.path);
          return (
            <li key={reminder.id} className="sb-line">
              {day === null ? (
                <span className="sb-line-name" title={reminder.title}>
                  {reminder.title}
                </span>
              ) : (
                <button
                  type="button"
                  className="sb-line-open"
                  title={reminder.title}
                  aria-label={t('tile.upcomingMentions.open', { date: formatDate(day, language) })}
                  onClick={() => void navigate(`/journal?d=${day}`)}
                >
                  {reminder.title}
                </button>
              )}
              <span className="sb-line-detail">
                {day === null
                  ? t('reminder.urgency.open')
                  : t('tile.upcomingMentions.announced', { date: formatDate(day, language) })}
              </span>
              <span className="sb-line-right">
                <span className="sb-line-meta">
                  {t('tile.upcomingMentions.for', { date: formatDate(reminder.date, language) })}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </TileFrame>
  );
}
