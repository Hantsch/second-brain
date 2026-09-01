/* The reject dialog of a condensation proposal (story 038, D8). Rejecting
   is never a bare dismiss — a reason is required, and only a successful
   submit makes the proposal go away. Closing the dialog (×, Escape,
   backdrop, Cancel) only closes it; the still-open proposal underneath is
   untouched, the parent decides what happens to it. */

import { useState } from 'react';
import { Button } from '../atoms/Button';
import { Dialog } from '../atoms/Dialog';
import { ErrorState } from './ErrorState';
import { useT } from '../i18n';

export interface CondenseRejectDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  busy?: boolean;
  error?: unknown;
}

export function CondenseRejectDialog({
  open,
  onClose,
  onSubmit,
  busy = false,
  error,
}: CondenseRejectDialogProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  const ready = reason.trim().length > 0;

  /* Clears on every path out of the dialog, not only `close()` — a successful
     submit closes the dialog through its own callback (`setRejectOpen(false)`
     in `AreaCondensedTab`) rather than calling `close()` here, so relying on
     `close()` alone would leave the previous reason showing the next time the
     dialog opens. Adjusting state during render (comparing to the previous
     `open` prop) rather than in an effect: no extra render pass, and no
     cascading-setState-in-effect warning for a value that only ever needs to
     reset in the very render `open` flips to `false`. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setReason('');
  }

  const close = (): void => {
    onClose();
  };

  const submit = (): void => {
    if (!ready || busy) return;
    onSubmit(reason);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('notes.condensed.reject.title')}
      description={t('notes.condensed.reject.description')}
      size="md"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button icon="thumbs-down" disabled={!ready} loading={busy} onClick={submit}>
            {t('notes.condensed.reject.submit')}
          </Button>
        </>
      }
    >
      {error === null || error === undefined ? null : (
        <ErrorState error={error} variant="secondary" />
      )}
      <label className="gs-label" htmlFor="sb-condensed-reject-field">
        {t('notes.condensed.reject.fieldLabel')}
      </label>
      <textarea
        id="sb-condensed-reject-field"
        className="gs-input sb-condensed-reject-field"
        rows={4}
        value={reason}
        placeholder={t('notes.condensed.reject.placeholder')}
        onChange={(event) => setReason(event.target.value)}
      />
    </Dialog>
  );
}
