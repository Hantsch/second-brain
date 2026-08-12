/* Die Tage als schmale Liste: Datum, Wochentag, Stimmungspunkt, erste Worte,
 * Wortzahl.
 *
 * Zwei Entscheidungen, die die Liste ehrlich halten:
 *
 * - **Lücken werden benannt, nicht gefüllt.** Ein Tag ohne Datei bekommt keine
 *   Zeile — sonst stünden dort Tage, die es nicht gibt. Stattdessen liegt zwischen
 *   zwei Einträgen eine ruhige Zeile: „3 Tage ohne Eintrag". Niemand schreibt
 *   jeden Tag, und das darf man sehen.
 * - **„Heute" ist immer der erste Eintrag**, auch ohne Datei. Es ist der Weg
 *   hinein: ein Tagebuch, in dem man den heutigen Tag suchen muss, wird nicht
 *   geführt.
 */

import type { JournalDay } from '@shared/types';
import { useLanguage, useT } from '../i18n';
import { plural } from '../lib/format';

/** Eine Zeile der Liste: ein Tag mit Datei, oder eine benannte Lücke. */
export type DayRow =
  | { kind: 'day'; date: string; day: JournalDay | null; today: boolean }
  | { kind: 'gap'; days: number; key: string };

const MS_PER_DAY = 86_400_000;

/**
 * Kalendertag als lokales Datum — nie über `new Date('YYYY-MM-DD')`: das ist UTC
 * und macht westlich von Greenwich aus dem 10. den 9.
 *
 * Öffentlich, weil der Tagebuch-Screen dieselbe Rechnung braucht. Zwei Fassungen
 * davon wären zwei Vorstellungen davon, welcher Tag heute ist.
 */
export function dateOf(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Der heutige Kalendertag in Ortszeit, als 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function daysBetween(newer: string, older: string): number {
  return Math.round((dateOf(newer).getTime() - dateOf(older).getTime()) / MS_PER_DAY);
}

/**
 * Die Zeilen der Liste, jüngste zuerst: „Heute" (mit Eintrag, wenn es einen gibt),
 * dann die übrigen Tage mit Lückenzeilen dazwischen.
 */
export function dayRows(days: readonly JournalDay[], today: string): DayRow[] {
  const sorted = [...days]
    .filter((day) => day.date.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const rows: DayRow[] = [];
  const first = sorted.find((day) => day.date === today) ?? null;
  rows.push({ kind: 'day', date: today, day: first, today: true });

  let previous = today;
  for (const day of sorted) {
    if (day.date === today) continue;
    /* Nur echte Lücken: aufeinanderfolgende Tage brauchen keine Zeile, und ein
       Tag in der Zukunft (nachgetragen) auch keine. */
    const missing = daysBetween(previous, day.date) - 1;
    if (missing > 0) rows.push({ kind: 'gap', days: missing, key: `${previous}-${day.date}` });
    rows.push({ kind: 'day', date: day.date, day, today: false });
    previous = day.date;
  }
  return rows;
}

/** Die Tage, die sich auswählen lassen — die Grundlage der Pfeiltasten. */
export function selectableDates(rows: readonly DayRow[]): string[] {
  return rows
    .filter((row): row is Extract<DayRow, { kind: 'day' }> => row.kind === 'day')
    .map((row) => row.date);
}

export interface DayListProps {
  rows: readonly DayRow[];
  /** Der ausgewählte Kalendertag. */
  selected: string;
  onSelect: (date: string) => void;
  /** Zeilen für die Tastatur greifbar halten. */
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
