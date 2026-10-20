/* The "Facts" section: what the day-close extracted and the human confirmed —
 * plus the way back afterward. The button that triggers the close ("Close
 * day") isn't here: it's anchored to the bottom edge of the detail column,
 * next to the composer (CoachPanel), so it never slides below the visible
 * edge.
 *
 * Two decisions:
 *
 * - **The lines appear verbatim**, not as rendered markdown. A checkbox with
 *   `@due:2026-08-17 #work` is exactly the line that's in the file; parsed as
 *   a list, the loose brackets would fall away and the markers would
 *   disappear.
 * - **The confirmation names only what was actually written**, and the way
 *   back only if there is one. The way back is the list of `vault:write`
 *   requests from `journal:applyClose` — each carrying the hash of the state
 *   it reverts.
 */

import type { WriteRequest } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';

/** What a performed day-close has left behind. */
export interface AppliedClose {
  written: string[];
  undo: WriteRequest[];
}

export interface FactsSectionProps {
  /** The section from the file, verbatim. */
  facts: string;
  applied: AppliedClose | null;
  undoBusy: boolean;
  onUndo: () => void;
}

export function FactsSection({ facts, applied, undoBusy, onUndo }: FactsSectionProps) {
  const t = useT();
  const first = applied?.written[0] ?? null;

  return (
    <section className="sb-dayfacts" aria-label={t('journal.facts.title')}>
      <h3 className="sb-section-title">{t('journal.facts.title')}</h3>

      {facts.trim().length === 0 ? (
        <p className="sb-panel-empty">{t('journal.facts.empty')}</p>
      ) : (
        <p className="sb-dayfacts-text">{facts}</p>
      )}

      {applied === null ? null : (
        /* The same strip as in the inbox — it stays put until the day
           changes: ten seconds is too short for this decision. */
        <div className="sb-undostrip" role="status">
          <span className="sb-undostrip-text">
            {applied.written.length === 0
              ? t('journal.close.doneNothing')
              : t('journal.close.done')}
          </span>
          {first === null ? null : <span className="sb-mono sb-undostrip-path">{first}</span>}
          {applied.written.length > 1 ? (
            <span className="sb-mono">
              {t('journal.close.doneMore', { count: applied.written.length - 1 })}
            </span>
          ) : null}
          {applied.undo.length === 0 ? null : (
            <Button
              variant="secondary"
              size="sm"
              icon="history"
              loading={undoBusy}
              onClick={onUndo}
            >
              {t('common.undo')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
