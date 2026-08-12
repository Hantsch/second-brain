/* Die drei Haltungen des Coachs als Segment — direkt neben dem Feld, in dem man
 * schreibt.
 *
 * Warum sie hier steht und nicht in einer Einstellung: man muss wissen, mit wem
 * man spricht, **während** man tippt. Die Grundhaltung kommt aus den Einstellungen
 * (`journal.mode`), gilt aber nur als Vorgabe; umgeschaltet wird pro Gespräch.
 *
 * Jede Haltung trägt ihren Satz — im Tooltip am Knopf und als Hilfszeile unter dem
 * Segment für die gewählte. Der Satz ist die Zusage: „Zuhören: ich spiegle und
 * frage nach, ohne Ratschläge" ist genau das, was der Prompt dieser Haltung
 * verbietet und erlaubt (`core/llm/prompts/journal-chat.ts`).
 *
 * Tastatur: Ctrl+1 bis Ctrl+3. Nicht die nackten Ziffern — die gehören der Rail
 * (Screenwechsel), und im Schreibfeld sind sie Zeichen. Mit Strg greifen sie
 * überall, auch mitten im Satz.
 */

import type { CoachMode } from '@shared/types';
import { Kbd } from '../atoms/Kbd';
import { Tooltip } from '../atoms/Tooltip';
import { useT } from '../i18n';

/** Die Reihenfolge im Segment: zuhören zuerst — die zurückhaltendste Haltung. */
const MODES: readonly CoachMode[] = ['listen', 'tips', 'analyze'];

export interface CoachModeSwitchProps {
  value: CoachMode;
  onChange: (mode: CoachMode) => void;
  /** Aus, solange eine Antwort läuft: sie würde die Haltung mitten im Satz wechseln. */
  disabled?: boolean;
}

export function CoachModeSwitch({ value, onChange, disabled = false }: CoachModeSwitchProps) {
  const t = useT();

  return (
    <div className="sb-stance">
      <div className="sb-stance-row" role="group" aria-label={t('journal.mode.label')}>
        <span className="gs-overline sb-stance-label">{t('journal.mode.label')}</span>
        <span className="sb-stance-seg">
          {MODES.map((mode) => {
            const name = t(`journal.mode.${mode}`);
            const active = mode === value;
            return (
              <Tooltip key={mode} content={t(`journal.mode.${mode}.hint`)}>
                <button
                  type="button"
                  className={`sb-stancebtn ${active ? 'sb-stancebtn--active' : ''}`.trim()}
                  aria-pressed={active}
                  aria-label={t('journal.mode.set', { label: name })}
                  disabled={disabled}
                  onClick={() => onChange(mode)}
                >
                  {name}
                </button>
              </Tooltip>
            );
          })}
        </span>
        <span className="sb-stance-keys">
          <Kbd keys={['Ctrl', '1']} />
          <span>{t('journal.mode.keys')}</span>
        </span>
      </div>
      {/* Die Zusage der gewählten Haltung, immer sichtbar — ein Tooltip allein
          erreicht nur die Maus. */}
      <p className="sb-stance-hint">{t(`journal.mode.${value}.hint`)}</p>
    </div>
  );
}
