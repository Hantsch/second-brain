/* The days as a narrow list: date, weekday, mood dot, first words,
 * word count.
 *
 * Two decisions that keep the list honest:
 *
 * - **Gaps are named, not filled.** A day without a file gets no
 *   row — otherwise it would show days that don't exist. Instead, a quiet
 *   row sits between two entries: "3 days without an entry". Nobody writes
 *   every day, and that should be visible.
 * - **"Today" is always the first entry**, even without a file. It's the way
 *   in: a journal where you have to search for today's entry isn't being
 *   kept.
 *
 * Both promises survive the "only open days" filter (009, D5): today stays
 * first even when it isn't open itself, and the gap rows switch off entirely
 * while filtering — see `dayRows`.
 */

import type { JournalDay } from '@shared/types';
import { useLanguage, useT } from '../i18n';
import { plural } from '../lib/format';
import { isDayOpen } from '../lib/journal-open';

/** One row of the list: a day with a file, or a named gap. */
export type DayRow =
  | { kind: 'day'; date: string; day: JournalDay | null; today: boolean }
  | { kind: 'gap'; days: number; key: string };

const MS_PER_DAY = 86_400_000;

/**
 * Calendar day as a local date — never via `new Date('YYYY-MM-DD')`: that's UTC
 * and turns the 10th into the 9th west of Greenwich.
 *
 * Exported because the journal screen needs the same calculation. Two versions
 * of it would mean two different ideas of what day today is.
 */
export function dateOf(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Today's calendar day in local time, as 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function daysBetween(newer: string, older: string): number {
  return Math.round((dateOf(newer).getTime() - dateOf(older).getTime()) / MS_PER_DAY);
}

export interface DayRowOptions {
  /** Show only unfinished days (`isDayOpen`). Today's row is exempt — it is
      never open itself, and it stays the way in regardless. */
  openOnly?: boolean;
}

/**
 * The rows of the list, newest first: "Today" (with an entry if there is one),
 * then the remaining days with gap rows in between.
 *
 * With `openOnly` (009, D5) two things change, and both follow from the same
 * idea: a filtered selection is no longer a timeline.
 *
 * - Only days `isDayOpen` calls unfinished remain — today itself is kept
 *   unconditionally, because it is the way in and is never counted as open.
 * - **No gap rows at all.** A gap between two open days is a gap the filter
 *   made, not an absence of entries — naming it would be a claim about the
 *   vault that isn't true.
 */
export function dayRows(
  days: readonly JournalDay[],
  today: string,
  options: DayRowOptions = {},
): DayRow[] {
  const openOnly = options.openOnly ?? false;
  const sorted = [...days]
    .filter((day) => day.date.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows: DayRow[] = [];
  const first = sorted.find((day) => day.date === today) ?? null;
  rows.push({ kind: 'day', date: today, day: first, today: true });

  let previous = today;
  for (const day of sorted) {
    if (day.date === today) continue;
    if (openOnly) {
      if (isDayOpen(day, today)) rows.push({ kind: 'day', date: day.date, day, today: false });
      continue;
    }
    /* Only genuine gaps: consecutive days need no row, and neither does a
       day in the future (backfilled). */
    const missing = daysBetween(previous, day.date) - 1;
    if (missing > 0) rows.push({ kind: 'gap', days: missing, key: `${previous}-${day.date}` });
    rows.push({ kind: 'day', date: day.date, day, today: false });
    previous = day.date;
  }
  return rows;
}

/** The days that can be selected — the basis for the arrow keys. */
export function selectableDates(rows: readonly DayRow[]): string[] {
  return rows
    .filter((row): row is Extract<DayRow, { kind: 'day' }> => row.kind === 'day')
    .map((row) => row.date);
}

export interface DayListProps {
  rows: readonly DayRow[];
  /** The selected calendar day. */
  selected: string;
  onSelect: (date: string) => void;
  /** Keep rows reachable for the keyboard. */
  rowRef?: (date: string, element: HTMLButtonElement | null) => void;
}

export function DayList({ rows, selected, onSelect, rowRef }: DayListProps) {
  const t = useT();
  const language = useLanguage();
  const locale = language === 'de' ? 'de-DE' : 'en-GB';
  const short = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  return (
    <ul className="sb-daylist" aria-label={t('journal.list.title')}>
      {rows.map((row) =>
        row.kind === 'gap' ? (
          <li key={row.key} className="sb-daygap" aria-hidden="true">
            <span className="sb-daygap-line" />
            <span className="sb-daygap-text">
              {plural(row.days, 'journal.gapOne', 'journal.gap')}
            </span>
          </li>
        ) : (
          <li key={row.date}>
            <button
              type="button"
              className={[
                'sb-dayrow',
                row.today ? 'sb-dayrow--today' : '',
                row.date === selected ? 'sb-dayrow--active' : '',
              ]
                .join(' ')
                .trim()}
              aria-current={row.date === selected ? 'true' : undefined}
              aria-label={t('journal.open', { date: row.date })}
              ref={(element) => rowRef?.(row.date, element)}
              onClick={() => onSelect(row.date)}
            >
              <span className="sb-dayrow-head">
                <span className="sb-mono sb-dayrow-date">
                  {row.today ? t('journal.today') : short.format(dateOf(row.date))}
                </span>
                <span className="sb-dayrow-weekday">{weekday.format(dateOf(row.date))}</span>
                {row.day?.mood === null || row.day?.mood === undefined ? null : (
                  <span
                    className="sb-moodmark"
                    data-level={row.day.mood}
                    title={t(`journal.mood.${row.day.mood}`)}
                    aria-hidden="true"
                  />
                )}
                {(row.day?.turns ?? 0) > 0 ? (
                  <span
                    className="sb-dayrow-talk"
                    title={t('journal.hasDialogue')}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              {row.day === null ? (
                <span className="sb-dayrow-none">{t('journal.today.none')}</span>
              ) : (
                <>
                  <span className="sb-dayrow-excerpt">{row.day.excerpt}</span>
                  <span className="sb-mono sb-dayrow-words">
                    {t('journal.words', { count: row.day.wordCount })}
                  </span>
                </>
              )}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
