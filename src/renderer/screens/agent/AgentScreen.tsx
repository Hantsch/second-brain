/* Agent — what the user can do with Claude Code in this vault, and the button that opens
   it. Setting it up (CLI, setup files, protection) is the Settings tab's job; this screen
   only says when that tab has something to install or update. */

import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { AgentCommandsPanel } from './AgentCommandsPanel';
import { AgentSetupNotice } from './AgentSetupNotice';
import { OpenClaudeButton } from './OpenClaudeButton';

export function AgentScreen() {
  const t = useT();

  return (
    <div className="sb-screen">
      <ScreenHeader
        overline={t('screen.agent.overline')}
        title={t('screen.agent.title')}
        action={<OpenClaudeButton />}
      />
      <AgentSetupNotice />
      <AgentCommandsPanel />
    </div>
  );
}
