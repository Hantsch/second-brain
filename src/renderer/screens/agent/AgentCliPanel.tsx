/* "Claude Code": whether the CLI is on this machine.

   Gaston only asks whether the CLI exists; it never installs it and never runs it itself. */

import { CLAUDE_CODE_INSTALL_URL } from '@shared/types';
import type { AgentCliStatus } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useAgentCliStatus } from '../../lib/queries/agent';

export function AgentCliPanel() {
  const t = useT();
  const query = useAgentCliStatus();

  /* A failed query is "unknown", never a blank panel. */
  const status: AgentCliStatus | null = query.isError
    ? { state: 'unknown', reason: 'lookup-error' }
    : (query.data ?? null);

  return (
    <Panel title={t('settings.agent.cli.title')}>
      {status ? (
        <div className="sb-setting-block">
          {status.state === 'installed' ? (
            <div className="sb-setting">
              <p>{t('settings.agent.cli.installed')}</p>
              <span className="gs-label">{t('settings.agent.cli.foundAt')}</span>
              <p className="sb-mono sb-vault-path">{status.path}</p>
            </div>
          ) : null}
          {status.state === 'absent' ? (
            <div className="sb-setting">
              <p>{t('settings.agent.cli.absent')}</p>
              <Button
                variant="secondary"
                size="sm"
                icon="external-link"
                onClick={() =>
                  void api.shell.openExternal(CLAUDE_CODE_INSTALL_URL).catch(() => undefined)
                }
              >
                {t('settings.agent.cli.guide')}
              </Button>
            </div>
          ) : null}
          {status.state === 'unknown' ? (
            <p>
              {status.reason === 'timeout'
                ? t('settings.agent.cli.unknown.timeout')
                : status.code
                  ? t('settings.agent.cli.unknown.error', { code: status.code })
                  : t('settings.agent.cli.unknown.errorNoCode')}
            </p>
          ) : null}
          <p className="sb-setting-example">{t('settings.agent.cli.note')}</p>
        </div>
      ) : (
        <Skeleton lines={2} height={20} />
      )}
    </Panel>
  );
}
