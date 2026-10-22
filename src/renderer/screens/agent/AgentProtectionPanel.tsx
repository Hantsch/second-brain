/* "Protection": which of the agent's guard rules the vault's installed
   .claude/settings.json actually carries. Read back from the file on every
   visit, so a rule the user removed by hand shows up as missing. */

import { VAULT_DIRS } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';
import { useAgentProtection } from '../../lib/queries/agent';

export function AgentProtectionPanel() {
  const t = useT();
  const query = useAgentProtection();
  const state = query.data;
  /* A failed query and an unreadable file read the same: the rules are unknown, never blank. */
  const unknownReason = query.isError
    ? decodeIpcError(query.error).message
    : state?.state === 'unreadable'
      ? state.reason
      : null;
  const resolved = query.isError || state !== undefined;

  return (
    <Panel title={t('settings.agent.protection.title')}>
      <div className="sb-setting-block">
        {unknownReason !== null ? (
          <p role="alert">{t('settings.agent.protection.unreadable', { reason: unknownReason })}</p>
        ) : state?.state === 'none' ? (
          <p>{t('settings.agent.protection.none')}</p>
        ) : state?.state === 'read' ? (
          <>
            <ul className="sb-setup-files">
              {state.rules.map((rule) => (
                <li key={rule.id} className="sb-setup-file">
                  {/* The folder name is a parameter: catalog files must not spell the old product name. */}
                  <span>
                    {t(`settings.agent.protection.rule.${rule.id}`, { dir: VAULT_DIRS.internal })}
                  </span>
                  <Badge variant={rule.status === 'installed' ? 'success' : 'warning'}>
                    {t(`settings.agent.protection.status.${rule.status}`)}
                  </Badge>
                  {rule.missing.map((entry) => (
                    <span key={entry} className="sb-mono sb-setup-path">
                      {entry}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            {state.extraDeny.length > 0 ? (
              <section aria-labelledby="sb-protection-extra">
                <h3 id="sb-protection-extra" className="gs-label">
                  {t('settings.agent.protection.extra')}
                </h3>
                <ul className="sb-setup-files">
                  {state.extraDeny.map((entry) => (
                    <li key={entry} className="sb-mono sb-setup-path">
                      {entry}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <div role="status" aria-label={t('settings.agent.protection.loading')}>
            <Skeleton lines={3} height={20} />
          </div>
        )}
        {resolved ? (
          <p className="sb-setting-example">{t('settings.agent.protection.limit')}</p>
        ) : null}
      </div>
    </Panel>
  );
}
