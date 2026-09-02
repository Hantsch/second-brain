/* The delete confirmation dialog of a condensed artifact (story 043, D2).
   Unlike `CondenseRejectDialog`, there is no reason field — the user has
   already decided against the artifact, and once it's gone there is no
   `Direktiven`/`Directives` section left for a reason to attach to (that
   section is exactly what this dialog warns is not coming back). A plain
   confirm/cancel is the whole shape.

   The body text is static: no discard-plan fetch like `DiscardPageAction`
   makes before its own confirm. The one fact that matters — the sections
   and sources are regenerable from the sources, the directives are not —
   is known without reading anything, so there is nothing to fetch fresh. */

import { Button } from '../atoms/Button';
import { Dialog } from '../atoms/Dialog';
import { ErrorState } from './ErrorState';
import { useT } from '../i18n';

export interface CondenseDeleteDialogProps {
  open: boolean;
  /** The condensed artifact's own path, named in the confirm text. */
  path: string;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: unknown;
}

export function CondenseDeleteDialog({
  open,
  path,
  onClose,
  onSubmit,
  busy = false,
  error,
}: CondenseDeleteDialogProps) {
  const t = useT();

  const close = (): void => {
    if (busy) return;
    onClose();
  };

  const submit = (): void => {
    if (busy) return;
    onSubmit();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('notes.condensed.delete.title', { path })}
      description={t('notes.condensed.delete.description')}
      size="md"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" icon="trash-2" loading={busy} onClick={submit}>
            {t('notes.condensed.delete.confirm')}
          </Button>
        </>
      }
    >
      {error === null || error === undefined ? null : (
        <ErrorState error={error} variant="secondary" />
      )}
      <p className="sb-finding-note">{t('notes.condensed.delete.directivesLost')}</p>
    </Dialog>
  );
}
