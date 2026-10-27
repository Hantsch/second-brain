/* "Agent" tab: whether the Claude Code CLI is on this machine, the agent setup and what the
   agent is allowed to do. Opening Claude in the vault is the rail's Agent entry.

   Gaston only asks whether the CLI exists; it never installs it and never runs it itself. */

import { HELP_AGENT_PAGE } from '@shared/help-module';
import { CLAUDE_CODE_INSTALL_URL } from '@shared/types';
import type { AgentCliStatus } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { homeOf } from '../../lib/doc-home';
import { useAgentCliStatus, useAgentSetupState } from '../../lib/queries/agent';
import { AgentLastRunPanel } from './agent/AgentLastRunPanel';
import { AgentProtectionPanel } from './agent/AgentProtectionPanel';
import { AgentSetupPanel } from './agent/AgentSetupPanel';

export function AgentTab() {
  const t = useT();
  const query = useAgentCliStatus();
  const helpStatus = useAgentSetupState().data?.help.status;
  /* Without the module there is no page to open; collision means the folder is not Gaston's. */
  const helpReadable = helpStatus === 'current' || helpStatus === 'outdated';

  /* A failed query is "unknown", never a blank panel. */
  const status: AgentCliStatus | null = query.isError
    ? { state: 'unknown', reason: 'lookup-error' }
    : (query.data ?? null);

  return (
    <>
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

      <AgentSetupPanel />

      <AgentProtectionPanel />

      <AgentLastRunPanel />

      <Panel title={t('settings.agent.about.title')}>
        <div className="sb-setting-block">
          <p>{t('settings.agent.about.body')}</p>
          {/* No link atom exists. The router is a HashRouter, so a plain anchor navigates in-app
              without a handler and keeps middle-click and keyboard semantics. */}
          {helpReadable ? (
            <a href={`#${homeOf(HELP_AGENT_PAGE)}`}>{t('settings.agent.about.open')}</a>
          ) : helpStatus === undefined ? null : (
            <p className="sb-setting-example">{t('settings.agent.about.unavailable')}</p>
          )}
        </div>
      </Panel>
    </>
  );
}
