/* Line diff view for a condensation proposal (story 038, D7). Renders the
   output of `diffLines` (`@core/condense`) as a mono gutter with a marker
   glyph per row plus a token-based background — the glyph carries the
   added/removed distinction, colour is only reinforcement (accessibility:
   colour-blind users must still be able to tell the rows apart). */

import type { DiffRow } from '@core/condense/diff';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

export interface CondenseDiffProps {
  rows: DiffRow[];
}

function markerFor(kind: DiffRow['kind']): string {
  if (kind === 'added') return 'plus';
  if (kind === 'removed') return 'minus';
  return '';
}

export function CondenseDiff({ rows }: CondenseDiffProps) {
  const t = useT();
  const removed = rows.filter((row) => row.kind === 'removed').length;
  const added = rows.filter((row) => row.kind === 'added').length;

  return (
    <div className="sb-condensediff">
      <p className="sb-condensediff-summary sb-mono">
        {t('notes.condensed.diff.summary', { removed, added })}
      </p>
      <ul className="sb-condensediff-rows">
        {rows.map((row, index) => (
          <li key={index} className={`sb-condensediff-row sb-condensediff-row--${row.kind}`}>
            <span className="sb-condensediff-marker" aria-hidden={row.kind === 'context'}>
              {row.kind === 'context' ? null : (
                <Icon
                  name={markerFor(row.kind)}
                  size={12}
                  label={t(
                    row.kind === 'added'
                      ? 'notes.condensed.diff.added'
                      : 'notes.condensed.diff.removed',
                  )}
                />
              )}
            </span>
            <span className="sb-condensediff-text sb-mono">
              {row.text.length > 0 ? row.text : ' '}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
