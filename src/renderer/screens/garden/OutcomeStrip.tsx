/* What just happened — and the way back.

   The same stance as in the inbox: the confirmation stands in the screen and
   not as a toast, because a toast disappears after six seconds and carries
   no button. "No action without undo" means the way back stays visible.

   And it only claims what actually happened: without a written file, no
   "written" appears here. A fix that only opens says "opened"; an undo that
   didn't touch a file edited since then also says so (`kept`). */

import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';

export type Outcome =
  /** A fix has written. Without a token there is no way back. */
  | { kind: 'fixed'; files: string[]; undoToken: string | null }
  /** "Looks fine" — the finding is hidden. */
  | { kind: 'dismissed'; id: string }
  /** The supersedes relationship is in the frontmatter. */
  | { kind: 'superseded'; file: string; before: string[]; hash: string }
  /** A fix was reverted; `kept` was left untouched. */
  | { kind: 'undone'; kept: string[] }
  /** A run was cancelled. */
  | { kind: 'cancelled' }
  /** An action that writes nothing: the second file remains as a path. */
  | { kind: 'opened'; paths: string[] };

export interface OutcomeStripProps {
  outcome: Outcome;
  busy: boolean;
  /** The way back, if there is one. */
  onUndo?: () => void;
  /** The second path of an "open only" action. */
  onOpenSecond?: (path: string) => void;
}

function sentence(outcome: Outcome): { key: string; values?: Record<string, string | number> } {
  if (outcome.kind === 'fixed') {
    return { key: 'garden.card.written', values: { file: outcome.files[0] ?? '' } };
  }
  if (outcome.kind === 'dismissed') return { key: 'garden.card.dismissed' };
  if (outcome.kind === 'superseded') {
    return { key: 'garden.contradiction.superseded', values: { file: outcome.file } };
  }
  if (outcome.kind === 'undone') return { key: 'garden.card.undone' };
  if (outcome.kind === 'cancelled') return { key: 'garden.run.cancelled' };
  return { key: 'garden.card.opened', values: { path: outcome.paths[0] ?? '' } };
}

/** Label of the way back — "show again" is not "undo". */
function undoLabel(outcome: Outcome): string {
  return outcome.kind === 'dismissed' ? 'garden.card.undismiss' : 'garden.card.undo';
}

export function OutcomeStrip({ outcome, busy, onUndo, onOpenSecond }: OutcomeStripProps) {
  const t = useT();
  const line = sentence(outcome);
  const second = outcome.kind === 'opened' ? (outcome.paths[1] ?? null) : null;
  const kept = outcome.kind === 'undone' ? outcome.kept : [];

  return (
    <div className="sb-undostrip" role="status">
      <Icon name="circle-check-big" size={16} />
      <span className="sb-undostrip-text">{t(line.key, line.values)}</span>
      {kept.length === 0 ? null : (
        <span className="sb-mono">
          {plural(kept.length, 'garden.card.keptOne', 'garden.card.kept')}
        </span>
      )}
      {second === null || onOpenSecond === undefined ? null : (
        <Button variant="ghost" size="sm" icon="external-link" onClick={() => onOpenSecond(second)}>
          {t('garden.card.openSecond')}
        </Button>
      )}
      {onUndo === undefined ? null : (
        <Button variant="secondary" size="sm" icon="history" loading={busy} onClick={onUndo}>
          {t(undoLabel(outcome))}
        </Button>
      )}
    </div>
  );
}
