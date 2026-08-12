/* Eine Zeitangabe, wie der Mensch sie liest: „heute", „gestern", „vor 3 Tagen",
   ab einer Woche das Datum. Der genaue Zeitstempel steht im `title` und in
   `dateTime` — die Aussage bleibt prüfbar, ohne die Zeile zu überladen.

   Zahlen und Zeitstempel in Mono, so steht es in ARCHITECTURE.md. */

import { useLanguage, useT } from '../i18n';
import { formatAge } from '../lib/format';

export interface RelativeTimeProps {
  /** ISO-Zeitstempel. Leer oder unbrauchbar heißt: nichts anzeigen. */
  at: string | null;
  className?: string;
  /** Feste Uhrzeit für Tests. */
  now?: Date;
}

export function RelativeTime({ at, className = 'sb-tile-when', now }: RelativeTimeProps) {
  const t = useT();
  const language = useLanguage();
  if (at === null || at.length === 0) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const text = formatAge(at, language, now);
  return (
    <time className={className} dateTime={at} title={date.toLocaleString()}>
      {text.length > 0 ? text : t('time.today')}
    </time>
  );
}
