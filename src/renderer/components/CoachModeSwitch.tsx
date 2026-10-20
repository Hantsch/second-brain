/* The coach's three stances as a segment — right next to the field where you
 * write.
 *
 * Why it sits here and not in a setting: you need to know who you're talking
 * to **while** you're typing. The base stance comes from the settings
 * (`journal.mode`), but only serves as a default; switching happens per
 * conversation.
 *
 * Each stance carries its own sentence — in the tooltip on the button and as a
 * hint line under the segment for the selected one. The sentence is the
 * promise: "Listen" says the entry is filed with no answer at all (011: it
 * never calls a model — `core/journal/coach.ts`), "Tips"/"Analyse" each name
 * exactly what their prompt forbids and allows (`core/llm/prompts/journal-chat.ts`).
 *
 * Keyboard: Ctrl+1 through Ctrl+3. Not the bare digits — those belong to the
 * rail (screen switching), and in the writing field they're characters. With
 * Ctrl they work everywhere, even mid-sentence.
 */

import type { CoachMode } from '@shared/types';
import { Kbd } from '../atoms/Kbd';
import { Tooltip } from '../atoms/Tooltip';
import { useT } from '../i18n';

/** The order in the segment: listen first — the most restrained stance. */
const MODES: readonly CoachMode[] = ['listen', 'tips', 'analyze'];

export interface CoachModeSwitchProps {
  value: CoachMode;
  onChange: (mode: CoachMode) => void;
  /** Off while a response is running: it would switch the stance mid-sentence. */
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
      {/* The selected stance's promise, always visible — a tooltip alone only
          reaches the mouse. */}
      <p className="sb-stance-hint">{t(`journal.mode.${value}.hint`)}</p>
    </div>
  );
}
