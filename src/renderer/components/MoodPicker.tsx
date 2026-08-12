/* Stimmung und Energie: fünf Stufen, sofort gespeichert.
 *
 * Keine Zahlenskala. „3 von 5" ist eine Messung, und niemand misst seinen Tag —
 * deshalb trägt jede Stufe ein Wort („Geht so", „Gut"), und die Zahl steht nur als
 * Punktreihe da, damit die Richtung sichtbar bleibt.
 *
 * Zwei Entscheidungen:
 *
 * - **Ein Klick schreibt.** Kein Speichern-Knopf, keine Bestätigung — dafür eine
 *   Rückmeldung („Gespeichert"), damit der Klick nicht ins Ungewisse geht.
 * - **Kein Weg zurück auf „nicht eingetragen".** Eine Stufe wieder abzuwählen
 *   würde `null` schreiben, und der Kanal kennt das nicht: ein Knopf, der mal
 *   speichert und mal löscht, wäre eine Behauptung. Wer sich vertippt, klickt
 *   die richtige Stufe.
 */

import { useT } from '../i18n';

/** Die Skala von docs/VAULT-FORMAT.md: 1 bis 5, beide Felder gleich. */
const LEVELS: readonly number[] = [1, 2, 3, 4, 5];

export interface MoodPickerProps {
  kind: 'mood' | 'energy';
  /** 1–5 oder `null`, wenn der Tag noch keine Angabe trägt. */
  value: number | null;
  /** Der Schreibvorgang läuft. */
  busy?: boolean;
  /** Der letzte Stand ist in der Datei angekommen. */
  saved?: boolean;
  onPick: (level: number) => void;
}

export function MoodPicker({ kind, value, busy = false, saved = false, onPick }: MoodPickerProps) {
  const t = useT();
  const label = t(`journal.${kind}.label`);

  return (
    <div className="sb-mood" role="group" aria-label={label}>
      <span className="gs-overline sb-mood-label">{label}</span>
      <span className="sb-mood-steps">
        {LEVELS.map((level) => {
          const name = t(`journal.${kind}.${level}`);
          const active = value === level;
          return (
            <button
              key={level}
              type="button"
              className={`sb-moodstep ${active ? 'sb-moodstep--active' : ''}`.trim()}
              aria-pressed={active}
              aria-label={t('journal.level.set', { label: name })}
              disabled={busy}
              onClick={() => onPick(level)}
            >
              <span className="sb-moodstep-dot" aria-hidden="true" />
              <span className="sb-moodstep-text">{name}</span>
            </button>
          );
        })}
      </span>
      {/* Eine Live-Region, die im Ruhezustand leer ist: „nicht eingetragen" ist
          eine Aussage über den Tag, „Gespeichert" eine über den Klick. */}
      <span className="sb-mood-state" role="status">
        {saved ? t('journal.level.saved') : value === null ? t('journal.level.none') : ''}
      </span>
    </div>
  );
}
