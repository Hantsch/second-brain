/* A small sign that the agent setup in Settings has something to install or update.
   Nothing while the setup is current or its state is not known yet. */

import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';
import { useAgentSetupState } from '../../lib/queries/agent';

const NOTICE_KEY = {
  install: 'agent.notice.install',
  update: 'agent.notice.update',
} as const;

export function AgentSetupNotice() {
  const t = useT();
  const action = useAgentSetupState().data?.action;
  if (action === undefined || action === 'none') return null;

  return (
    <p className="sb-agent-notice" role="status">
      <Icon name="circle-alert" size={16} />
      <span>{t(NOTICE_KEY[action])}</span>
      {/* No link atom exists. The router is a HashRouter, so a plain anchor navigates in-app. */}
      <a href="#/settings?tab=agent">{t('agent.notice.open')}</a>
    </p>
  );
}
