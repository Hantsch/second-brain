/* The warning and the offer for old-language section headings (024, D8).
   Mirrors `LocalRuntimeInstallDialog`'s shape: a `Dialog` atom, local
   `result`/`error` state, a footer that switches between "confirm" and
   "done".

   The card queries the plan itself (`useSectionMigrationPlan`, enabled
   whenever `LanguagesTab` is open) rather than reacting to the switch as a
   one-off side effect — the story's own decision is that an offer that
   disappears on reload would be a worse promise than none. It renders
   nothing while the plan is empty: nothing to migrate is nothing to say. */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IpcResponse } from '@shared/ipc';
import type { DocLanguage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Dialog } from '../../atoms/Dialog';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { decodeIpcError } from '../../lib/ipc-error';
import { useSectionMigrationPlan } from '../../lib/queries/data';
import { qk } from '../../lib/queries/keys';

export interface SectionMigrationCardProps {
  /** The current `languages.documents` setting — the plan's target. */
  to: DocLanguage;
}

/** Only two document languages exist (`DocLanguage`), so the "old" one the
    plan found headings in is simply the other of the pair. */
const OTHER_LANGUAGE: Record<DocLanguage, DocLanguage> = { de: 'en', en: 'de' };

type MigrateResult = IpcResponse<'vault:sectionMigrate'>;

export function SectionMigrationCard({ to }: SectionMigrationCardProps) {
  const t = useT();
  const client = useQueryClient();
  const plan = useSectionMigrationPlan(to, true);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<MigrateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const migrate = useMutation({
    mutationFn: () => api.vault.sectionMigrate({ to, entries: plan.data?.entries ?? [] }),
    onSuccess: (res) => {
      setResult(res);
      // The plan is stale the instant a migration ran against it — refetch
      // so the card's own count (and a re-opened dialog) reflect reality.
      void client.invalidateQueries({ queryKey: qk.vault.sectionPlan(to) });
    },
    onError: (failure: unknown) => setError(t(`error.code.${decodeIpcError(failure).code}`)),
  });

  // Nothing to offer: no plan yet, or the plan found nothing left to do.
  // Once the dialog is open this stays true even if a just-finished
  // migration invalidates the plan down to zero — otherwise the result the
  // user just triggered would vanish out from under them mid-read.
  if (!plan.data || (plan.data.count === 0 && !open)) return null;

  const count = plan.data.count;
  const otherLanguage = t(`settings.lang.${OTHER_LANGUAGE[to]}`);

  const closeDialog = (): void => {
    setOpen(false);
    setResult(null);
    setError(null);
  };

  const confirm = (): void => {
    setError(null);
    migrate.mutate();
  };

  return (
    <Card
      className="sb-setting-block"
      role="region"
      aria-label={t('settings.lang.migration.title')}
    >
      <p className="sb-note-detail sb-note-bad">
        {t(count === 1 ? 'settings.lang.migration.warningOne' : 'settings.lang.migration.warning', {
          count,
          language: otherLanguage,
        })}
      </p>
      <Button variant="secondary" size="sm" icon="globe" onClick={() => setOpen(true)}>
        {t('settings.lang.migration.action')}
      </Button>

      <Dialog
        open={open}
        title={t('settings.lang.migration.dialog.title')}
        onClose={migrate.isPending ? undefined : closeDialog}
        closeLabel={t('common.close')}
        size="md"
        footer={
          result ? (
            <Button size="sm" onClick={closeDialog}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={closeDialog}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" icon="globe" loading={migrate.isPending} onClick={confirm}>
                {t('settings.lang.migration.dialog.confirm')}
              </Button>
            </>
          )
        }
      >
        <div className="sb-setting-block">
          {!result ? (
            <>
              <p className="sb-dialog-lead">{t('settings.lang.migration.dialog.intro')}</p>
              <p className="sb-mono">
                {t(
                  count === 1
                    ? 'settings.lang.migration.dialog.countOne'
                    : 'settings.lang.migration.dialog.count',
                  { count },
                )}
              </p>
              {error ? <p className="sb-note-detail sb-note-bad">{error}</p> : null}
            </>
          ) : (
            <>
              <p>
                {result.migrated === 0
                  ? t('settings.lang.migration.result.noneMigrated')
                  : t(
                      result.migrated === 1
                        ? 'settings.lang.migration.result.migratedOne'
                        : 'settings.lang.migration.result.migrated',
                      { count: result.migrated },
                    )}
              </p>
              {result.conflicts > 0 ? (
                <p className="sb-note-detail sb-note-bad">
                  {t(
                    result.conflicts === 1
                      ? 'settings.lang.migration.result.conflictsOne'
                      : 'settings.lang.migration.result.conflicts',
                    { count: result.conflicts },
                  )}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Dialog>
    </Card>
  );
}
