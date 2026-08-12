/* Eine Frist als Chip. Überfällig rot, heute oder bald amber, sonst ruhig.

   Die Farbe ist Beiwerk: der Chip trägt das Datum in Mono und, wo Platz ist, den
   Satz dazu („2 Tage überfällig"). Wer die Farbe nicht sieht, liest dasselbe. */

import { Icon } from '../atoms/Icon';
import { useLanguage } from '../i18n';
import { dayDiff, dueTone, formatDate, formatDue } from '../lib/format';

export interface DeadlineChipProps {
  /** ISO-Tag oder `null` für „ohne Frist". */
  date: string | null;
  /**
   * Tage bis zur Frist; negativ ist überfällig. Fehlt der Wert, wird er aus dem
   * Datum gerechnet — der Index liefert ihn für Todos schon mit.
   */
  dueInDays?: number | null;
  /** Den Satz zur Frist mitschreiben, nicht nur das Datum. */
  relative?: boolean;
  /** Das „heute" dieser Anzeige. Tests geben eine feste Zeit. */
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
