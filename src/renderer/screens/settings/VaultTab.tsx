/* Tab „Vault": wo die Dateien liegen, was der Index von ihnen weiß, und die
   drei Wege zu einem anderen Vault.

   Der Indexlauf zeigt seinen Fortschritt aus `event:index-progress` — ein
   Neuaufbau über tausend Dateien dauert länger als zwei Sekunden und darf nicht
   als stiller Klick enden. */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IndexStats } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { ErrorState } from '../../components/ErrorState';
import { IndexStatsCard } from '../../components/IndexStatsCard';
import { Panel } from '../../components/Panel';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { bridge } from '../../lib/bridge';
import { formatAge, formatNumber } from '../../lib/format';
import { qk } from '../../lib/queries/keys';
import { useIndexStats, useVaultStatus } from '../../lib/queries/data';

interface Progress {
  done: number;
  total: number;
  indexing: boolean;
}

/** Fortschritt des Indexlaufs, direkt aus dem Ereignis — kein Polling. */
function useIndexProgress(): Progress | null {
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => bridge().on('event:index-progress', setProgress), []);
  return progress;
}

/** Der Ordnername eines Vaults — er ist der Gegenstand, den eine Meldung nennt. */
function vaultName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function indexStateKey(status: { indexing: boolean; indexedAt: string | null }): string {
  if (status.indexing) return 'settings.vault.indexBuilding';
  return status.indexedAt ? 'settings.vault.indexReady' : 'settings.vault.indexMissing';
}

export function VaultTab() {
  const t = useT();
  const language = useLanguage();
  const client = useQueryClient();
  const { data: status } = useVaultStatus();
  const { data: stats } = useIndexStats();
  const progress = useIndexProgress();
  const [rebuilt, setRebuilt] = useState<IndexStats | null>(null);
  const recent = useQuery({ queryKey: qk.vault.recent(), queryFn: api.vault.recent });

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: qk.vault.status() });
    void client.invalidateQueries({ queryKey: qk.index.stats() });
    void client.invalidateQueries({ queryKey: qk.vault.recent() });
  };

  const rebuild = useMutation({
    mutationFn: api.index.rebuild,
    onSuccess: (next) => {
      setRebuilt(next);
      refresh();
    },
  });

  const open = useMutation({ mutationFn: api.vault.open, onSuccess: refresh });
  const choose = useMutation({ mutationFn: api.vault.choose, onSuccess: refresh });
  const create = useMutation({ mutationFn: () => api.vault.create('', ''), onSuccess: refresh });

  const root = status?.root ?? null;
  const busy = rebuild.isPending || (progress?.indexing ?? false);

  /* Ein Vault, der sich nicht öffnen lässt, war bisher ein Klick ohne Antwort.
     Der Fehler nennt jetzt den Ordner, um den es ging. */
  const failed = open.error ?? choose.error ?? create.error ?? rebuild.error ?? null;
  const failedName = open.variables ?? root ?? '';

  return (
    <>
      {failed === null ? null : (
        <ErrorState
          error={failed}
          variant="secondary"
          {...(failedName === '' ? {} : { subject: vaultName(failedName) })}
          scrollIntoView
        />
      )}
      <Panel
        title={t('settings.vault')}
        meta={root ? undefined : t('vault.none')}
        note={t('settings.vault.about')}
      >
        <div className="sb-setting-block">
          <p className="sb-mono sb-vault-path">{root ?? t('vault.none')}</p>
          <div className="sb-setting-actions">
            <Button
              variant="secondary"
              size="sm"
              icon="folder-open"
              disabled={root === null}
              onClick={() => root && void api.shell.showInFolder(root).catch(() => undefined)}
            >
              {t('settings.vault.reveal')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="folder"
              onClick={() => choose.mutate()}
              loading={choose.isPending}
            >
              {t('settings.vaultOpen')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="folder-plus"
              onClick={() => create.mutate()}
              loading={create.isPending}
            >
              {t('settings.vault.create')}
            </Button>
          </div>

          <dl className="sb-kv">
            <div>
              <dt>{t('settings.vault.docs')}</dt>
              <dd className="sb-mono">{formatNumber(status?.docCount ?? 0, language)}</dd>
            </div>
            <div>
              <dt>{t('settings.vault.indexState')}</dt>
              <dd>{t(indexStateKey(status ?? { indexing: false, indexedAt: null }))}</dd>
            </div>
            <div>
              <dt>{t('settings.vault.indexAt')}</dt>
              <dd className="sb-mono">
                {status?.indexedAt
                  ? formatAge(status.indexedAt, language)
                  : t('settings.vault.indexNever')}
              </dd>
            </div>
            {stats?.durationMs ? (
              <div>
                <dt>{t('settings.vault.duration')}</dt>
                <dd className="sb-mono">
                  {t('settings.vault.indexDuration', { ms: stats.durationMs })}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="sb-setting-actions">
            <Button
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              loading={busy}
              disabled={root === null}
              onClick={() => rebuild.mutate()}
            >
              {t('settings.vault.rebuild')}
            </Button>
            {busy && progress && progress.total > 0 ? (
              <span className="sb-mono">
                {t('settings.vault.rebuildProgress', {
                  done: progress.done,
                  total: progress.total,
                })}
              </span>
            ) : null}
            {!busy && rebuilt ? (
              <span className="sb-setting-readout">
                {t('settings.vault.rebuildDone', { count: rebuilt.docs })}
              </span>
            ) : null}
          </div>
          <p className="sb-note-line">{t('settings.vault.indexNote')}</p>
        </div>
      </Panel>

      <IndexStatsCard />

      {recent.data && recent.data.length > 0 ? (
        <Panel title={t('settings.vault.recent')}>
          <ul className="sb-rows">
            {recent.data.map((entry) => (
              <li key={entry.path} className="sb-row">
                <button
                  type="button"
                  className="sb-row-button"
                  aria-label={t('settings.vault.recentOpen', { name: entry.name })}
                  disabled={!entry.exists || entry.path === root}
                  onClick={() => open.mutate(entry.path)}
                >
                  <span className="sb-row-name">{entry.name}</span>
                  <span className="sb-row-meta">
                    <span className="sb-mono">{entry.path}</span>
                    {entry.exists ? null : <span>{t('settings.vault.recentMissing')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
