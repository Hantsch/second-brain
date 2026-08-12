/* Vault-Status am Fuß der Rail: Name, Dokumentzahl, Index-Anzeige.
   Klickbar — führt in die Vault-Einstellungen bzw. ins Onboarding. */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { VaultStatus } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { qk } from '../lib/queries/keys';

function indexLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  status: VaultStatus,
): string {
  if (status.indexing) return t('vault.indexing');
  if (status.indexedAt) return t('vault.indexed');
  return t('vault.noIndex');
}

export function VaultIndicator() {
  const t = useT();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: qk.vault.status(), queryFn: api.vault.status });
  const status = data ?? null;
  const open = status?.root !== null && status !== null;

  return (
    <button
      type="button"
      className="sb-vault"
      aria-label={t('vault.statusAria')}
      onClick={() => void navigate(open ? '/settings' : '/onboarding')}
    >
      <span className="sb-vault-name">{open ? (status?.name ?? '') : t('vault.none')}</span>
      <span className="sb-vault-meta">
        {open && status ? (
          <>
            {/* Der Punkt ist der Index-Indikator; seine Bedeutung steht im Label. */}
            <span
              className={`sb-dot ${status.indexing ? 'sb-dot--busy' : status.indexedAt ? 'sb-dot--ok' : ''}`}
              role="img"
              aria-label={indexLabel(t, status)}
            />
            <span>{t('vault.docs', { count: status.docCount })}</span>
          </>
        ) : (
          <>
            <Icon name="folder-open" size={12} />
            <span>{t('vault.choose')}</span>
          </>
        )}
      </span>
    </button>
  );
}
