/* Eine Frist wählen, ohne Fremdkörper im dunklen Layout.

   Ein rohes `input type="date"` schreibt „dd/mm/yyyy" in die Zeile und öffnet
   einen hellen Systemkalender — beides gehört nicht in diesen Screen. Fast jede
   Frist, die beim Einordnen entsteht, ist „heute" oder „morgen"; also stehen die
   beiden als Chips da, und nur wer ein anderes Datum braucht, klappt das Feld
   auf. Das gewählte Datum steht daneben in Mono, in der Schreibweise der
   Oberflächensprache.

   Der Wert bleibt der Vertrag: `YYYY-MM-DD` oder `null`. */

import { useState } from 'react';
import { Button } from '../atoms/Button';
import { useLanguage, useT } from '../i18n';
import { formatDate } from '../lib/format';

/** Kalendertag in lokaler Zeit als `YYYY-MM-DD`. */
function isoDay(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** Derselbe Tag, um `days` verschoben — gerechnet in Kalendertagen. */
function shifted(from: Date, days: number): string {
  return isoDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
}

export interface DueFieldProps {
  /** `YYYY-MM-DD` oder `null` für „ohne Frist". */
  value: string | null;
  /** Name des Feldes für Hilfsmittel, bereits übersetzt. */
  ariaLabel: string;
  onChange: (value: string | null) => void;
  /** Das „heute" dieser Anzeige. Tests geben eine feste Zeit. */
  now?: Date;
}

export function DueField({ value, ariaLabel, onChange, now = new Date() }: DueFieldProps) {
  const t = useT();
  const language = useLanguage();
  const today = isoDay(now);
  const tomorrow = shifted(now, 1);
  /* Ein Datum, das keiner der beiden Chips trägt — dann steht das Feld offen. */
  const custom = value !== null && value !== today && value !== tomorrow;
  const [picking, setPicking] = useState(false);
  const open = picking || custom;

  /* Ein Chip, der schon gilt, nimmt die Frist wieder weg. Sonst gäbe es keinen
     Weg zurück zu „ohne Frist". */
  const toggle = (day: string): void => {
    setPicking(false);
    onChange(value === day ? null : day);
  };

  return (
    <span className="sb-due" role="group" aria-label={ariaLabel}>
      <span className="sb-due-label">{t('inbox.proposal.due')}</span>
      <span className="sb-due-chips">
        <Button
          size="sm"
          variant={value === today ? 'secondary' : 'ghost'}
          aria-pressed={value === today}
          onClick={() => toggle(today)}
        >
          {t('inbox.proposal.dueToday')}
        </Button>
        <Button
          size="sm"
          variant={value === tomorrow ? 'secondary' : 'ghost'}
          aria-pressed={value === tomorrow}
          onClick={() => toggle(tomorrow)}
        >
          {t('inbox.proposal.dueTomorrow')}
        </Button>
        <Button
          size="sm"
          variant={open ? 'secondary' : 'ghost'}
          aria-pressed={open}
          onClick={() => setPicking(!open)}
        >
          {t('inbox.proposal.duePick')}
        </Button>
      </span>
      {open ? (
        <input
          type="date"
          className="gs-input sb-due-input"
          aria-label={t('inbox.proposal.duePick')}
          value={custom && value !== null ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        />
      ) : null}
      <span className="sb-mono sb-due-value">
        {value === null ? t('inbox.proposal.dueNone') : formatDate(value, language)}
      </span>
    </span>
  );
}
