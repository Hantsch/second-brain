/* Title-bar entry for an offered update. It stays out of the way: nothing
   renders until main reports an update worth acting on, and "Not now" hides it
   for this run only (main keeps that flag, not the renderer). */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useUpdateState } from '../../lib/queries/update';
import { UpdateAction } from './UpdateAction';

const ACTIONABLE = ['available', 'downloading', 'downloaded'];

export function UpdateControl() {
  const t = useT();
  const navigate = useNavigate();
  const { data } = useUpdateState();
  const [open, setOpen] = useState(false);

  if (!data || data.dismissed || !data.update || !ACTIONABLE.includes(data.phase)) return null;
  const version = data.update.version;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="sb-no-drag"
        data-testid="update-control"
        aria-label={t('update.control.aria', { version })}
        onClick={() => setOpen(true)}
      >
        {t('update.control', { version })}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('update.dialog.title', { version })}
        description={t('update.dialog.body')}
        size="sm"
        closeLabel={t('update.dialog.close')}
        footer={
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              void api.update.dismiss().catch(() => undefined);
            }}
          >
            {t('update.dialog.notNow')}
          </Button>
        }
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            void navigate('/settings?tab=about');
          }}
        >
          {t('update.dialog.whatChanged')}
        </Button>
        <UpdateAction state={data} />
      </Dialog>
    </>
  );
}
