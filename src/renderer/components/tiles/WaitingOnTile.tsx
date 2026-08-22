/* „Auf wen warte ich?" — wer, worauf, seit wann, bis wann.

   Überfällige zuerst: was die Frist gerissen hat, drückt am meisten. Ohne Frist
   zählt das Alter; behauptet wird nichts, was nicht im Frontmatter steht.

   Der Klick führt ins Projekt — dort steht der Eintrag, und dort wird er
   abgehakt. Eine Kachel, die Warte-auf selbst auflöst, würde eine Datei ändern,
   die der Nutzer gerade nicht ansieht.

   „Ruhig stellen" steht nur an den Zeilen, die wirklich mahnen: Erinnerungen
   entstehen erst, wenn eine Frist vorbei ist oder lange genug gewartet wurde
   (`core/overview/reminders`). Ein Knopf an einer Zeile, hinter der keine
   Erinnerung steht, hätte nichts ruhig zu stellen. */

import { useNavigate } from 'react-router-dom';
import type { Reminder } from '@shared/types';
import { useT } from '../../i18n';
import { useLanguage } from '../../i18n';
import { dayDiff, formatDate } from '../../lib/format';
import {
  useDashboardData,
  useReminders,
  useSnoozeReminder,
  useUnsnoozeReminder,
} from '../../lib/queries/dashboard';
import { pushToast } from '../../lib/toast';
import { OverdueMark } from '../OverdueMark';
import { SnoozeMenu } from '../SnoozeMenu';
import { TileFrame } from '../TileFrame';

const LIMIT = 4;

/** `journal/2026/08/2026-08-10.md` → `2026-08-10` — the announcing day, the
    one day of the pair that actually has a file to open. */
const DAY_IN_LEAF = /^(\d{4}-\d{2}-\d{2})\.md$/;

function announcingDayOf(reminder: Reminder): string | null {
  const leaf = reminder.path.split('/').pop() ?? '';
  return DAY_IN_LEAF.exec(leaf)?.[1] ?? null;
}

/** A wait is late once its own deadline has passed. */
function isLate(entry: { due?: string }, now: Date): boolean {
  return entry.due !== undefined && dayDiff(now, new Date(`${entry.due}T00:00:00`)) < 0;
}

/**
 * Die Erinnerung hinter einem Warte-auf, wenn es eine gibt. Verglichen werden
 * Projekt, Person und der Gegenstand; den Titel setzt der Kern als
 * „Person: Gegenstand" zusammen.
 */
function reminderFor(
  entry: { project: string; who: string; what: string },
  reminders: readonly Reminder[],
): Reminder | null {
  const what = entry.what.trim();
  return (
    reminders.find(
      (reminder) =>
        reminder.source === 'waiting-overdue' &&
        reminder.project === entry.project &&
        reminder.who === entry.who &&
        (what.length === 0 || reminder.title.includes(what)),
    ) ?? null
  );
}

export function WaitingOnTile() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  const reminders = useReminders();
  const snooze = useSnoozeReminder();
  const unsnooze = useUnsnoozeReminder();
  const now = new Date();

  const entries = [...(data?.waitingOn ?? [])].sort((a, b) => {
    const lateA = isLate(a, now);
    const lateB = isLate(b, now);
    if (lateA !== lateB) return lateA ? -1 : 1;
    return a.since < b.since ? -1 : a.since > b.since ? 1 : 0;
  });
  const rows = entries.slice(0, LIMIT);

  /* Loose ends (020, D7): their own reminder source, not a `waitingOn` entry —
     the frontmatter never carries one. Shown as their own rows, the same way
     `DeadlinesTile` renders reminders directly instead of going through a
     project field. */
  const looseEnds = (reminders.data ?? []).filter((reminder) => reminder.source === 'loose-end');
  const total = entries.length + looseEnds.length;
  /* What actually nags in this tile: a deadline that has passed, a wait long
     enough that the core raised a reminder, or a loose end. Counted across all
     entries, not just the visible rows — same as `total`. */
  const overdue =
    looseEnds.length +
    entries.filter(
      (entry) => isLate(entry, now) || reminderFor(entry, reminders.data ?? []) !== null,
    ).length;

  return (
    <TileFrame
      id="waiting-on"
      title={t('module.waiting-on.name')}
      count={total > 0 ? total : null}
      overdue={overdue}
      pending={isPending}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0 && looseEnds.length === 0}
      empty={{ body: t('tile.waiting.empty') }}
    >
      <ul className="sb-lines">
        {looseEnds.map((reminder) => (
          <li key={reminder.id} className="sb-line">
            <OverdueMark />
            <button
              type="button"
              className="sb-line-open sb-line-open--overdue"
              title={reminder.title}
              onClick={() => {
                const day = announcingDayOf(reminder);
                void navigate(day === null ? '/journal' : `/journal?d=${day}`);
              }}
            >
              {reminder.title}
            </button>
            <span className="sb-line-detail">
              {t('tile.waiting.looseEnd', { date: formatDate(reminder.date, language) })}
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
          </li>
        ))}
        {rows.map((entry, index) => {
          const late = isLate(entry, now);
          const nagging = reminderFor(entry, reminders.data ?? []);
          return (
            <li key={`${entry.project}-${entry.who}-${index}`} className="sb-line">
              {late || nagging !== null ? <OverdueMark /> : null}
              <button
                type="button"
                className={`sb-line-open${late || nagging !== null ? ' sb-line-open--overdue' : ''}`}
                onClick={() => void navigate(`/projects?p=${encodeURIComponent(entry.project)}`)}
              >
                {entry.who}
              </button>
              <span className="sb-line-detail">{entry.what}</span>
              <span className="sb-line-meta">
                {t('tile.waiting.since', { date: formatDate(entry.since, language) })}
                {entry.due === undefined ? null : (
                  <span className={late ? 'sb-due--overdue' : ''}>
                    {' · '}
                    {late
                      ? t('tile.waiting.overdue')
                      : t('tile.waiting.due', { date: formatDate(entry.due, language) })}
                  </span>
                )}
              </span>
              {nagging === null ? null : (
                <SnoozeMenu
                  label={t('tile.deadlines.snooze', { title: nagging.title })}
                  disabled={snooze.isPending}
                  onSnooze={(days, until) =>
                    snooze.mutate(
                      { id: nagging.id, days },
                      {
                        onSuccess: () =>
                          pushToast('info', {
                            message: 'reminder.snooze.done',
                            values: { date: formatDate(until, language) },
                            action: {
                              label: 'reminder.snooze.undo',
                              run: () =>
                                unsnooze.mutate(nagging.id, {
                                  onSuccess: () => pushToast('info', 'reminder.snooze.undone'),
                                }),
                            },
                          }),
                      },
                    )
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
    </TileFrame>
  );
}
