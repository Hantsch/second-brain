/* Create a knowledge module: two fields and a sentence explaining what a
   module is.

   The explanatory sentence lives in the dialog itself, not in a help text next
   to it: whoever lands here is deciding right now whether they need a module.
   Below it is what actually gets written to disk — no dialog that creates
   something without saying what. */

import { useState } from 'react';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

export interface CreateModuleDialogProps {
  open: boolean;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onCreate: (input: { title: string; description: string }) => void;
}

export function CreateModuleDialog({
  open,
  busy,
  error,
  onClose,
  onCreate,
}: CreateModuleDialogProps) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');

  const submit = (): void => {
    const named = title.trim();
    if (named.length === 0 || busy) return;
    onCreate({ title: named, description: purpose.trim() });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('modules.create.title')}
      description={t('modules.create.what')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button icon="plus" loading={busy} disabled={title.trim().length === 0} onClick={submit}>
            {t('modules.create.submit')}
          </Button>
        </>
      }
    >
      <div className="sb-modulecreate">
        <Input
          label={t('modules.create.name')}
          placeholder={t('modules.create.namePlaceholder')}
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <Input
          label={t('modules.create.purpose')}
          placeholder={t('modules.create.purposePlaceholder')}
          hint={t('modules.create.hint')}
          multiline
          className="sb-modulecreate-purpose"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
        />
        {error === null || error === undefined ? null : (
          <ErrorState error={error} variant="secondary" />
        )}
      </div>
    </Dialog>
  );
}
