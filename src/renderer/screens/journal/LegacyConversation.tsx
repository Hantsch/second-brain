/* A legacy day's `## Conversation` section (011, D9): still readable, no
 * longer written, and — on request — foldable into the unified day stream
 * (`journal:foldDay`, D5/D6). Nothing here migrates on its own; the button
 * asks first (guardrail 2), and the fold is a one-way action with no undo
 * path (`journal:foldDay` returns a plain `WriteResult`, not the
 * `{ written, undo }` shape `journal:applyClose` has), so the confirmation
 * copy says so plainly instead of implying a way back that doesn't exist.
 *
 * Self-contained: this component owns its own "confirm?" dialog state, the
 * same way `CloseDialog` owns its fields but not its `open` flag — the
 * difference here is that nothing outside needs to know whether the dialog
 * is open, so it never leaves this file.
 */

import { useEffect, useRef, useState } from 'react';
import type { JournalTurn } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { DialogTurn } from '../../components/DialogTurn';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

export interface LegacyConversationProps {
  /** The legacy turns, oldest first — non-empty whenever this component is
      rendered; `DayEntry` decides whether there is a legacy conversation at
      all, this component just displays it. */
  turns: readonly JournalTurn[];
  /** Runs `journal:foldDay`. The screen closes the day's current hash over
      this callback (mirroring `text.onSave`'s `expectedHash`) — this
      component never reads or guesses the hash itself. */
  onFold: () => void;
  busy: boolean;
  error: unknown;
}

export function LegacyConversation({ turns, onFold, busy, error }: LegacyConversationProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  /* Closes itself once the fold actually went through. A failed attempt
     (e.g. a stale-hash conflict) leaves the dialog open with the error
     visible — never a silent retry, never a claim that something moved when
     it didn't. */
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && (error === null || error === undefined)) setOpen(false);
    wasBusy.current = busy;
  }, [busy, error]);

  return (
    <section className="sb-coach" aria-label={t('journal.legacy.title')}>
      <h3 className="sb-section-title">{t('journal.legacy.title')}</h3>
      <div className="sb-dialogue">
        {turns.map((turn, at) => (
          <DialogTurn key={`${turn.role}-${at}-${turn.at ?? ''}`} turn={turn} />
        ))}
      </div>

      <div className="sb-dayentry-closewrap">
        <Button variant="secondary" size="sm" icon="arrow-right" onClick={() => setOpen(true)}>
          {t('journal.legacy.fold.action')}
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('journal.legacy.fold.title')}
        description={t('journal.legacy.fold.body')}
        size="sm"
        closeLabel={t('common.close')}
        footer={
          <>
            {/* Cancel only closes — it never touches `onFold`, so backdrop
                click and Escape (both routed through `onClose`) are exactly
                as inert as this button. */}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button icon="check" loading={busy} onClick={onFold}>
              {t('journal.legacy.fold.confirm')}
            </Button>
          </>
        }
      >
        {error === null || error === undefined ? null : (
          <ErrorState error={error} variant="secondary" scrollIntoView />
        )}
      </Dialog>
    </section>
  );
}
