/* Mood and energy: five levels, saved immediately.
 *
 * No numeric scale. "3 out of 5" is a measurement, and no one measures their
 * day — that's why each level carries a word ("So-so", "Good"), and the number
 * appears only as a row of dots, so the direction stays visible.
 *
 * Two decisions:
 *
 * - **A click writes.** No save button, no confirmation — but there is
 *   feedback ("Saved"), so the click doesn't disappear into uncertainty.
 * - **No way back to "not recorded".** Deselecting a level would write `null`,
 *   and the channel doesn't support that: a button that sometimes saves and
 *   sometimes deletes would be a false claim. Anyone who mis-clicks just clicks
 *   the right level.
 */

import { useT } from '../i18n';

/** The scale from docs/VAULT-FORMAT.md: 1 to 5, both fields alike. */
const LEVELS: readonly number[] = [1, 2, 3, 4, 5];

export interface MoodPickerProps {
  kind: 'mood' | 'energy';
  /** 1–5 or `null`, if the day doesn't have a value yet. */
  value: number | null;
  /** The write is in progress. */
  busy?: boolean;
  /** The latest state has arrived in the file. */
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
              data-level={level}
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
      {/* A live region that's empty at rest: "not recorded" is a statement
          about the day, "Saved" is one about the click. */}
      <span className="sb-mood-state" role="status">
        {saved ? t('journal.level.saved') : value === null ? t('journal.level.none') : ''}
      </span>
    </div>
  );
}
