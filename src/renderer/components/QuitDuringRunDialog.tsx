/* The close-during-a-run warning (042, D7): the renderer's answer to
 * `event:close-requested` (D6) — main has already vetoed the close and is
 * waiting for `window:confirmClose` or `window:cancelClose`, with a ~5 s
 * dead-man timer of its own in case neither ever arrives. Mirrors
 * `screens/journal/InterviewDialog.tsx`'s use of `atoms/Dialog` +
 * `atoms/Button`, not ad-hoc markup.
 *
 * Two ways out, both explicit — no third "just close" option, per the
 * story's Decisions: a write could still be in flight, so the only offered
 * path off a running maintenance pass is 021b's own stop.
 *
 * "Stop run and close" only calls `window:confirmClose` once
 * `gardener:cancel` has actually resolved — never optimistically. If the
 * cancel (or the confirm round-trip itself) throws, the dialog stays open
 * and shows the error instead of closing the window on a guess: guardrail 1
 * ("never a silent failure") applies to quitting exactly as it does to any
 * other write.
 *
 * "Cancel" — and `Escape`, which the `Dialog` atom already wires to
 * `onClose` — both just call `window:cancelClose` and close the dialog
 * locally. Neither the run nor the window is touched, so the strip keeps
 * advancing behind it untouched. */

import { useEffect, useState } from 'react';
import { Button } from '../atoms/Button';
import { Dialog } from '../atoms/Dialog';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { bridge } from '../lib/bridge';
import { markGardenerStopped } from '../lib/gardener-progress';
import { useGardenerCancel } from '../lib/queries/gardener';
import { ErrorState } from './ErrorState';

export function QuitDuringRunDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cancel = useGardenerCancel();

  /* Payload-free event (see the IPC contract comment) — nothing to read out
     of it, only the fact that it fired. */
  useEffect(
    () =>
      bridge().on('event:close-requested', () => {
        setError(null);
        setOpen(true);
      }),
    [],
  );

  /* Leaves the run and the window alone; the next close is judged from
     scratch (see `window:cancelClose`'s own contract comment). Guarded
     against firing mid-stop-and-close: closing this way while that request
     is in flight would leave the veto in an ambiguous state. */
  function handleCancel(): void {
    if (cancel.isPending) return;
    setOpen(false);
    setError(null);
    void api.window.cancelClose();
  }

  async function handleStopAndClose(): Promise<void> {
    setError(null);
    try {
      await cancel.mutateAsync();
      /* Same bookkeeping the strip's own stop button does (`RunStrip.tsx`),
         so a strip still mounted behind this dialog for the ~5 s dead-man
         window (or if the close is somehow not immediate) reads "stopped
         partway" rather than a run that silently vanished. */
      markGardenerStopped();
      await api.window.confirmClose();
      setOpen(false);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title={t('garden.quit.title')}
      description={t('garden.quit.body')}
      size="sm"
      closeLabel={t('garden.quit.cancel')}
      footer={
        <>
          <Button variant="secondary" onClick={handleCancel} disabled={cancel.isPending}>
            {t('garden.quit.cancel')}
          </Button>
          <Button
            variant="danger"
            icon="x"
            loading={cancel.isPending}
            onClick={() => void handleStopAndClose()}
          >
            {t('garden.quit.stopAndClose')}
          </Button>
        </>
      }
    >
      {error ? <ErrorState error={error} variant="secondary" /> : null}
    </Dialog>
  );
}
