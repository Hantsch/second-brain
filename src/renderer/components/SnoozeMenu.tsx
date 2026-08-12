/* Eine Erinnerung ruhig stellen — bis wann, sagt der Nutzer.

   Vorher stand hier eine feste Zahl (drei Tage). Das war eine Entscheidung der
   App über etwas, das nur der Nutzer weiß: „nicht mehr heute" und „nächste
   Woche" sind zwei verschiedene Dinge.

   Zwei Regeln:
   - **Jede Wahl nennt den Tag, an dem wieder gemahnt wird.** Der Kanal rechnet in
     Tagen (`reminders:snooze`), der Mensch denkt in Tagen des Kalenders. „Für drei
     Tage" wäre eine Rechnung, die er im Kopf machen müsste.
   - **Eigenes Datum heißt eigenes Datum.** Ein Tag, der nicht in der Zukunft
     liegt, wird abgelehnt statt stillschweigend auf morgen gerundet — er würde
     nichts ruhig stellen.

   Kein `role="menu"`: darin darf kein Datumsfeld stehen (`aria-required-children`).
   Eine Gruppe mit Namen trägt dieselbe Bedeutung und hält axe still. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { useLanguage, useT } from '../i18n';
import { formatDate } from '../lib/format';

/** Kalendertag in lokaler Zeit als `YYYY-MM-DD` — wie in `DueField`. */
function isoDay(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function shifted(from: Date, days: number): string {
  return isoDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
}

/** Kalendertage zwischen zwei Tagen (`YYYY-MM-DD`). */
export function daysUntil(today: string, target: string): number {
  const from = new Date(`${today}T00:00:00`);
  const to = new Date(`${target}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Die drei Vorgaben: `days` ist der Abstand zum Tag, an dem wieder gemahnt wird. */
export const SNOOZE_PRESETS: readonly { key: string; labelKey: string; days: number }[] = [
  { key: 'today', labelKey: 'reminder.snooze.today', days: 1 },
  { key: 'tomorrow', labelKey: 'reminder.snooze.tomorrow', days: 2 },
  { key: 'week', labelKey: 'reminder.snooze.week', days: 7 },
];

export interface SnoozeMenuProps {
  /** Name des Knopfs, bereits übersetzt — er nennt die Sache. */
  label: string;
  disabled?: boolean;
  /** `days` ist der Abstand in Kalendertagen; `until` derselbe Tag als Datum. */
  onSnooze: (days: number, until: string) => void;
  /** Das „heute" dieser Anzeige. Tests geben eine feste Zeit. */
  now?: Date;
}

export function SnoozeMenu({
  label,
  disabled = false,
  onSnooze,
  now = new Date(),
}: SnoozeMenuProps) {
  const t = useT();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const today = isoDay(now);

  /* Kein Panel ohne Fluchtweg: Esc schließt, ein Klick daneben auch. */
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: globalThis.MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  const close = (): void => {
    setOpen(false);
    setError(false);
    box.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();
  };

  const pick = (days: number): void => {
    setOpen(false);
    setError(false);
    onSnooze(days, shifted(now, days));
  };

  const pickCustom = (): void => {
    const days = daysUntil(today, custom);
    if (custom.length === 0 || days < 1) {
      setError(true);
      return;
    }
    pick(days);
  };

  return (
    <div className="sb-snooze" ref={box}>
      <IconButton
        icon="clock"
        size="sm"
        variant="ghost"
        label={label}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div
          className="sb-snooze-panel"
          role="group"
          aria-label={t('reminder.snooze.title')}
          ref={panel}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            close();
          }}
        >
          <span className="sb-snooze-title">{t('reminder.snooze.title')}</span>
          {SNOOZE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="sb-snooze-item"
              onClick={() => pick(preset.days)}
            >
              <span>{t(preset.labelKey)}</span>
              <span className="sb-snooze-when">
                {formatDate(shifted(now, preset.days), language)}
              </span>
            </button>
          ))}
          <div className="sb-snooze-custom">
            <label className="gs-field">
              <span className="gs-label">{t('reminder.snooze.pick')}</span>
              <input
                type="date"
                className="gs-input"
                min={shifted(now, 1)}
                value={custom}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setCustom(event.target.value);
                  setError(false);
                }}
              />
            </label>
            <Button size="sm" variant="secondary" onClick={pickCustom}>
              {t('reminder.snooze.apply')}
            </Button>
          </div>
          {error ? <span className="gs-errormsg">{t('reminder.snooze.past')}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
