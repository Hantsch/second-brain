/* The confirmation after an action: what happened, and the way back.

   It's deliberately placed in the screen and not as a toast: a toast
   disappears after six seconds and carries no button. "No action without
   undo" means the way back stays visible for ten seconds.

   The line only claims what actually happened. "Filed to" without a path
   would be a broken sentence — and for a dump that's deliberately left
   unfiled, even a false statement. That's why the caller's intent doesn't
   decide, the result does: without a written file, it counts as "left
   unfiled". */

import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';

export interface UndoOffer {
  kind: 'filed' | 'discarded' | 'kept';
  /** Files written — none for "discarded" and "left unfiled". */
  paths: readonly string[];
  /** Without a token there's nothing to undo. Each of the three actions now
      supplies one — even "left unfiled" (`capture:keep`) writes something
      and is therefore undoable. */
  undoToken: string | null;
}

export interface UndoStripProps {
  offer: UndoOffer;
  busy: boolean;
  onUndo: () => void;
}

/** The text that matches the result — not the one the caller intended. */
function textKey(offer: UndoOffer): string {
  if (offer.kind === 'discarded') return 'inbox.undo.discarded';
  /* No path means: no file was written. Then the dump was left unfiled,
     regardless of which button was pressed. */
  if (offer.kind === 'kept' || offer.paths.length === 0) return 'inbox.undo.kept';
  return 'inbox.undo.filed';
}

export function UndoStrip({ offer, busy, onUndo }: UndoStripProps) {
  const t = useT();
  const first = offer.paths[0] ?? null;
  return (
    <div className="sb-undostrip" role="status">
      <Icon name="circle-check-big" size={16} />
      <span className="sb-undostrip-text">{t(textKey(offer))}</span>
      {first === null ? null : <span className="sb-mono sb-undostrip-path">{first}</span>}
      {offer.paths.length > 1 ? (
        <span className="sb-mono">{t('inbox.undo.more', { count: offer.paths.length - 1 })}</span>
      ) : null}
      {offer.undoToken === null ? null : (
        <Button variant="secondary" size="sm" icon="history" loading={busy} onClick={onUndo}>
          {t('inbox.undo.action')}
        </Button>
      )}
    </div>
  );
}
