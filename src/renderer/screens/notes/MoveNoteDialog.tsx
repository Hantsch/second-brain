/* Move one note into a different area. `from` filters the target list
   defensively (never offer the note's own area, no matter what the caller
   passes) — `others` is expected to already exclude it, this is belt and
   suspenders, not the only guard. */

import { useState } from 'react';
import type { Area } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Select } from '../../atoms/Select';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

export interface MoveNoteDialogNote {
  line: number;
  heading: string | null;
}

export interface MoveNoteDialogProps {
  open: boolean;
  note: MoveNoteDialogNote;
  from: Area;
  others: readonly Area[];
  busy: boolean;
  /**
   * A `conflict` already surfaces as a toast one layer up (`AreaSection.tsx`)
   * — the file changed, not this dialog's business to restate. Every other
   * code (the note's own heading vanished, the target area disappeared, an
   * unreachable store) would otherwise fail completely silently: the dialog
   * just sat there with a spinner that stopped. This is the one place left
   * to say so.
   */
  error?: unknown;
  onClose: () => void;
  onSubmit: (toSlug: string) => void;
}

export function MoveNoteDialog({
  open,
  note,
  from,
  others,
  busy,
  error,
  onClose,
  onSubmit,
}: MoveNoteDialogProps) {
  const t = useT();
  const targets = others.filter((area) => area.slug !== from.slug);
  const [target, setTarget] = useState(targets[0]?.slug ?? '');
  const ready = target.length > 0;

  const submit = (): void => {
    if (!ready || busy) return;
    onSubmit(target);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('notes.moveNote.title')}
      size="md"
      closeLabel={t('common.close')}
      footer={
        targets.length === 0 ? (
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button icon="folder-open" disabled={!ready} loading={busy} onClick={submit}>
              {t('notes.moveNote.submit')}
            </Button>
          </>
        )
      }
    >
      {error === null || error === undefined ? null : (
        <ErrorState error={error} variant="secondary" subject={from.title} />
      )}
      {targets.length === 0 ? (
        <p className="sb-panel-empty">{t('notes.moveNote.noOther')}</p>
      ) : (
        <div className="sb-movenote">
          {note.heading === null ? null : (
            <span className="sb-areanote-day sb-mono">{note.heading}</span>
          )}
          <Select
            label={t('notes.moveNote.targetLabel')}
            value={target}
            options={targets.map((area) => ({ value: area.slug, label: area.title }))}
            onChange={(event) => setTarget(event.target.value)}
          />
        </div>
      )}
    </Dialog>
  );
}
