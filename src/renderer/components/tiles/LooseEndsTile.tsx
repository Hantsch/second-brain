/* Lose Enden: eine Ankündigung im Tagebuch, deren Tag vorbei ist und die
   niemand seither aufgegriffen hat (022 D4).

   Bis hierher lag das in "Warte auf" — falsch, denn dort wartet man auf
   jemand anderen. Ein loses Ende ist eine eigene Ankündigung, kein
   geschuldeter Beitrag. Deshalb bekommt es hier eine eigene Kachel, standard-
   mäßig ausgeblendet (`DEFAULT_DASHBOARD_TILES`): nicht jeder will das sehen,
   aber wer es will, soll es leicht einschalten können.

   Die Zeile ist read-only bis auf zwei Aktionen: "ruhig stellen" (wie bei
   `DeadlinesTile`, gleicher `SnoozeMenu`) und der Sprung in den Tageseintrag,
   an dem angekündigt wurde — nicht den, für den etwas angekündigt wurde.
   Beide Tage stehen nebeneinander, damit klar bleibt, welcher welcher ist.

   `reminder.date` ist bei dieser Quelle das Datum, für das etwas angekündigt
   wurde (`core/overview/reminders.ts#fromLooseEnds`); der Tag der Ankündigung
   selbst steckt nur im Dateinamen von `reminder.path` — Tagesdateien enden
   immer auf ihr eigenes ISO-Datum (`core/journal/day.ts#pathFor`), genau wie
   `screens/garden/LooseEndCard.tsx` es schon nutzt. */

import { useNavigate } from 'react-router-dom';
import { useLanguage, useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import { pushToast } from '../../lib/toast';
import { useReminders, useSnoozeReminder, useUnsnoozeReminder } from '../../lib/queries/dashboard';
import { SnoozeMenu } from '../SnoozeMenu';
import { TileFrame } from '../TileFrame';

const LIMIT = 5;

/** Journal day files always end in their own ISO date. */
const DAY_IN_PATH = /(\d{4}-\d{2}-\d{2})\.md$/;

function announcedDay(path: string): string | null {
  return DAY_IN_PATH.exec(path)?.[1] ?? null;
}

export function LooseEndsTile() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useReminders();
  const snooze = useSnoozeReminder();
  const unsnooze = useUnsnoozeReminder();

  const all = (data ?? []).filter((reminder) => reminder.source === 'loose-end');
  const rows = all.slice(0, LIMIT);

  return (
    <TileFrame
      id="loose-ends"
      title={t('module.loose-ends.name')}
      count={all.length > 0 ? all.length : null}
      pending={isPending}
      error={error ?? snooze.error}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0}
      empty={{ body: t('tile.looseEnds.empty') }}
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
                  aria-label={t('tile.looseEnds.open', { date: formatDate(day, language) })}
                  onClick={() => void navigate(`/journal?d=${day}`)}
                >
                  {reminder.title}
                </button>
              )}
              <span className="sb-line-detail">
                {day === null
                  ? t('reminder.urgency.open')
                  : t('tile.looseEnds.announced', { date: formatDate(day, language) })}
              </span>
              <span className="sb-line-right">
                <span className="sb-line-meta">
                  {t('tile.looseEnds.for', { date: formatDate(reminder.date, language) })}
                </span>
                <SnoozeMenu
                  label={t('tile.looseEnds.snooze', { title: reminder.title })}
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
          );
        })}
      </ul>
    </TileFrame>
  );
}
