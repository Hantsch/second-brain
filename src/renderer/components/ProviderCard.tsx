/* Ein Provider als Karte: was er ist, wo er sitzt, ob er antwortet.

   Der Status ist ein Befund, keine Behauptung: es steht nur da, was der letzte
   Verbindungstest ergeben hat — vorher „noch nicht getestet". Fehler kommen im
   Klartext des Providers, nicht als Code; einen Schlüssel enthält keine dieser
   Zeilen, der Hauptprozess gibt ihn nie heraus.

   Das Entfernen fragt an der Stelle nach, an der es ausgelöst wurde. Kein
   Dialog, aber auch kein Klick ohne Rückfrage. */

import { useState } from 'react';
import type { ProviderConfig } from '@shared/types';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { useLanguage, useT } from '../i18n';
import { formatAge, plural } from '../lib/format';

export interface ProviderCardProps {
  provider: ProviderConfig;
  /** Läuft gerade ein Verbindungstest oder ein Modell-Abruf? */
  busy?: boolean;
  /** Ergebnis der letzten Aktion an dieser Karte, bereits übersetzt. */
  note?: string | null;
  noteTone?: 'ok' | 'error';
  onProbe: () => void;
  onLoadModels: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

function statusClass(provider: ProviderConfig): string {
  if (!provider.enabled) return 'sb-dot';
  if (!provider.probe) return 'sb-dot';
  return provider.probe.ok ? 'sb-dot sb-dot--ok' : 'sb-dot sb-dot--bad';
}

export function ProviderCard({
  provider,
  busy = false,
  note = null,
  noteTone = 'ok',
  onProbe,
  onLoadModels,
  onEdit,
  onRemove,
}: ProviderCardProps) {
  const t = useT();
  const language = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const probe = provider.probe;

  const status = !probe
    ? t('provider.probeNever')
    : probe.ok
      ? t('provider.probeOk', { ms: probe.latencyMs ?? 0 })
      : t('provider.probeFailed');

  return (
    <Card className="sb-provider">
      <div className="sb-provider-head">
        <span className={statusClass(provider)} aria-hidden="true" />
        <h3 className="sb-provider-name">{provider.label}</h3>
        <Badge variant="neutral">{t(provider.local ? 'provider.local' : 'provider.remote')}</Badge>
        {!provider.enabled ? <Badge variant="warning">{t('provider.disabled')}</Badge> : null}
        {!provider.local && !provider.hasKey ? (
          <Badge variant="warning">{t('provider.needsKey')}</Badge>
        ) : null}
      </div>

      <p className="sb-mono sb-provider-url">{provider.baseUrl}</p>

      <dl className="sb-provider-facts">
        <div>
          <dt>{t(`provider.kind.${provider.kind}`)}</dt>
          <dd>
            {provider.models.length === 0
              ? t('provider.noModels')
              : plural(provider.models.length, 'provider.modelsOne', 'provider.models')}
          </dd>
        </div>
        <div>
          <dt>{status}</dt>
          <dd>{probe ? t('provider.probeAt', { when: formatAge(probe.at, language) }) : '—'}</dd>
        </div>
      </dl>

      {probe && !probe.ok && probe.error ? <p className="sb-note-detail">{probe.error}</p> : null}
      {note ? (
        <p className={noteTone === 'error' ? 'sb-note-detail sb-note-bad' : 'sb-note-detail'}>
          {note}
        </p>
      ) : null}

      <div className="sb-provider-actions">
        <Button variant="secondary" size="sm" icon="zap" loading={busy} onClick={onProbe}>
          {t('provider.probe')}
        </Button>
        <Button variant="ghost" size="sm" icon="download" disabled={busy} onClick={onLoadModels}>
          {t('provider.loadModels')}
        </Button>
        <Button variant="ghost" size="sm" icon="pencil" onClick={onEdit}>
          {t('provider.edit')}
        </Button>
        {confirming ? null : (
          <Button
            variant="ghost"
            size="sm"
            icon="trash-2"
            onClick={() => setConfirming(true)}
            className="sb-provider-remove"
          >
            {t('provider.remove')}
          </Button>
        )}
      </div>

      {confirming ? (
        <div className="sb-provider-confirm" role="group" aria-label={t('provider.remove')}>
          <p>{t('provider.removeAsk')}</p>
          <div className="sb-provider-actions">
            <Button variant="danger" size="sm" icon="trash-2" onClick={onRemove}>
              {t('provider.removeConfirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
