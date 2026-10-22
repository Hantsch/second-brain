/* The rail's "Agent" entry: an action, not a screen. It opens a terminal in the vault
   with plain `claude` — no first prompt, so model and session settings stay the
   user's to choose before anything runs. Readiness is decided by main; a refusal
   comes back as a toast that names why and leads to the Agent tab. */

import { useNavigate } from 'react-router-dom';
import type { TerminalLaunchResult } from '@shared/types';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { useLaunchAgentTerminal } from '../lib/queries/agent-terminal';
import { pushToast } from '../lib/toast';

const AGENT_SETTINGS_ROUTE = '/settings?tab=agent';

export function RailAgentButton() {
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
    <button
      type="button"
      className="sb-rail-item"
      disabled={launch.isPending}
      onClick={() =>
        launch.mutate(undefined, {
          onSuccess: report,
          onError: () => pushToast('error', 'rail.agent.error'),
        })
      }
    >
      <Icon name="bot" size={16} />
      <span>{t('rail.agent')}</span>
    </button>
  );
}
