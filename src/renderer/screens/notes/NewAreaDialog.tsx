/* New area: a title, nothing else. `newAreaDocument` in the core always
   defaults a fresh area to `scope: 'private'` — this dialog doesn't offer a
   choice, per story 005's plan for this deliverable ("title field → slug
   preview"). Scope can still be changed by hand afterward.

   The slug rule is replicated from `NewProjectDialog.previewSlug` rather
   than duplicated — one slug rule, one place to get it wrong, same
   principle the story already applies to its alias lists. */

import { useState } from 'react';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { previewSlug } from '../projects/NewProjectDialog';

export interface NewAreaDialogProps {
  open: boolean;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export function NewAreaDialog({ open, busy, error, onClose, onCreate }: NewAreaDialogProps) {
  const t = useT();
  const [title, setTitle] = useState('');

  const slug = previewSlug(title);
  const ready = slug.length > 0;
  /* `areas:create` throws `conflict` on an existing slug (D4). The generic
     `error.code.conflict` card reads as "the file changed", which is
     confusing for "this area already exists" — so that one code gets its
     own readable sentence, attached to the field that caused it. Every
     other code still falls back to the generic card below. */
  const duplicate = error instanceof IpcCallError && error.code === 'conflict';

  const submit = (): void => {
    if (!ready || busy) return;
    onCreate(title.trim());
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('notes.newArea.title')}
      description={t('notes.newArea.description')}
      size="lg"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button icon="folder-plus" disabled={!ready} loading={busy} onClick={submit}>
            {t('notes.newArea.submit')}
          </Button>
        </>
      }
    >
      <div className="sb-newarea">
        {error === null || error === undefined || duplicate ? null : (
          <ErrorState error={error} variant="secondary" subject={title} />
        )}
        <Input
          label={t('notes.newArea.titleField')}
          placeholder={t('notes.newArea.titlePlaceholder')}
          value={title}
          autoFocus
          error={duplicate ? t('notes.newArea.duplicate') : undefined}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <p className="sb-newarea-path sb-mono">
          {ready ? t('notes.newArea.slugPreview', { slug }) : ''}
        </p>
      </div>
    </Dialog>
  );
}
