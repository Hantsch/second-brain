/* The Agent screen's one primary action. It opens a terminal in the vault with plain
   `claude` — no first prompt, so model and session settings stay the user's to choose
   before anything runs. Readiness is decided by main; a refusal comes back as a toast
   that names why and leads to the Agent tab in Settings. */

import { useNavigate } from 'react-router-dom';
import type { TerminalLaunchResult } from '@shared/types';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';
import { useLaunchAgentTerminal } from '../../lib/queries/agent-terminal';
import { pushToast } from '../../lib/toast';

const AGENT_SETTINGS_ROUTE = '/settings?tab=agent';

export function OpenClaudeButton() {
  const t = useT();
  const navigate = useNavigate();
  const launch = useLaunchAgentTerminal();

  const report = (result: TerminalLaunchResult) => {
    if (result.ok) {
      pushToast('success', `rail.agent.opened.${result.terminal}`);
      return;
    }
    pushToast('warn', {
      message: 'rail.agent.refused',
      description:
        result.reason === 'no-terminal' && result.detail
          ? 'rail.agent.reason.no-terminal.detail'
          : `rail.agent.reason.${result.reason}`,
      values: result.detail === undefined ? {} : { code: result.detail },
      action: { label: 'rail.agent.settings', run: () => void navigate(AGENT_SETTINGS_ROUTE) },
    });
  };

  return (
    <Button
      variant="primary"
      icon="square-terminal"
      disabled={launch.isPending}
      onClick={() =>
        launch.mutate(undefined, {
          onSuccess: report,
          onError: () => pushToast('error', 'rail.agent.error'),
        })
      }
    >
      {t('agent.open')}
    </Button>
  );
}
