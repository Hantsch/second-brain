/* Modul anlegen: zwei Felder und ein Satz, der erklärt, was ein Modul ist.

   Der erklärende Satz steht im Dialog, nicht in einem Hilfetext daneben: wer hier
   ankommt, entscheidet gerade, ob er ein Modul braucht. Darunter steht, was
   tatsächlich auf die Platte geschrieben wird — kein Dialog, der etwas anlegt,
   ohne zu sagen was. */

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
