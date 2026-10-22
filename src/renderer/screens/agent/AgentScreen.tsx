/* Agent — Claude Code working on this vault. The header opens it in a terminal; below
   are the commands that session knows, then what it needs to start (the CLI, the setup)
   and what it may not do (protection). */

import { HELP_AGENT_PAGE } from '@shared/help-module';
import { Panel } from '../../components/Panel';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { homeOf } from '../../lib/doc-home';
import { useAgentSetupState } from '../../lib/queries/agent';
import { AgentCliPanel } from './AgentCliPanel';
import { AgentCommandsPanel } from './AgentCommandsPanel';
import { AgentProtectionPanel } from './AgentProtectionPanel';
import { AgentSetupPanel } from './AgentSetupPanel';
import { OpenClaudeButton } from './OpenClaudeButton';

export function AgentScreen() {
  const t = useT();
  const helpStatus = useAgentSetupState().data?.help.status;
  /* Without the module there is no page to open; collision means the folder is not Gaston's. */
  const helpReadable = helpStatus === 'current' || helpStatus === 'outdated';

  return (
    <div className="sb-screen">
      <ScreenHeader
        overline={t('screen.agent.overline')}
        title={t('screen.agent.title')}
        action={<OpenClaudeButton />}
      />
      <AgentCommandsPanel />
      <AgentCliPanel />
      <AgentSetupPanel />
      <AgentProtectionPanel />
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
    </div>
  );
}
