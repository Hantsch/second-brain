/* "Terminal": opens a terminal in the vault with Claude Code started. Readiness is
   decided by the shared check, so the sentence under the buttons names the one step
   still missing; a refused or failed launch says why here, not only in a toast. */

import { useState } from 'react';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { setupIsComplete, terminalReadiness } from '@shared/agent/terminal-readiness';
import type { AgentCliStatus, TerminalIntent, TerminalLaunchResult } from '@shared/types';
import { Button } from '../../../atoms/Button';
import { Select } from '../../../atoms/Select';
import { Panel } from '../../../components/Panel';
import { useT } from '../../../i18n';
import { useAgentCliStatus, useAgentSetupState } from '../../../lib/queries/agent';
import { useLaunchAgentTerminal } from '../../../lib/queries/agent-terminal';
import { useModules, useVaultStatus } from '../../../lib/queries/data';

export function AgentTerminalSection() {
  const t = useT();
  const vault = useVaultStatus();
  const cliQuery = useAgentCliStatus();
  const setupQuery = useAgentSetupState();
  const modules = useModules();
  const launch = useLaunchAgentTerminal();
  const [module, setModule] = useState('');
  const [outcome, setOutcome] = useState<TerminalLaunchResult | 'failed' | null>(null);

  const vaultOpen = vault.data?.ready === true;
  /* A failed lookup is "unknown" here as in the CLI panel, never a silent pass. */
  const cli: AgentCliStatus | undefined = cliQuery.isError
    ? { state: 'unknown', reason: 'lookup-error' }
    : cliQuery.data;
  const setupKnown = setupQuery.data !== undefined || setupQuery.isError;
  /* Pending answers leave the buttons off without a sentence: nothing is wrong yet. */
  const pending = vault.data === undefined || cli === undefined || (vaultOpen && !setupKnown);
  const readiness = pending
    ? null
    : terminalReadiness({
        vaultOpen,
        cli: cli.state,
        setupComplete: setupQuery.data ? setupIsComplete(setupQuery.data.files) : false,
      });
  const ready = readiness?.ready === true;
  const pickable = (modules.data ?? []).filter((entry) => entry.slug !== HELP_MODULE_SLUG);
  const busy = launch.isPending;

  const run = (intent: TerminalIntent) => {
    setOutcome(null);
    launch.mutate(intent, {
      onSuccess: setOutcome,
      onError: () => setOutcome('failed'),
    });
  };

  return (
    <Panel title={t('settings.agent.terminal.title')}>
      <div className="sb-setting-block">
        <p>{t('settings.agent.terminal.intro')}</p>
        {readiness && !readiness.ready ? (
          <p>{t(`settings.agent.terminal.reason.${readiness.reason}`)}</p>
        ) : null}
        <div className="sb-setting-actions">
          <Button
            variant="primary"
            size="sm"
            disabled={!ready || busy}
            onClick={() => run({ kind: 'open' })}
          >
            {t('settings.agent.terminal.open')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!ready || busy}
            onClick={() => run({ kind: 'jobs' })}
          >
            {t('settings.agent.terminal.jobs')}
          </Button>
        </div>
        <div className="sb-setting-actions">
          <Select
            label={t('settings.agent.terminal.module.label')}
            placeholder={t('settings.agent.terminal.module.placeholder')}
            options={pickable.map((entry) => ({ value: entry.slug, label: entry.title }))}
            value={module}
            disabled={!ready || busy || pickable.length === 0}
            onChange={(event) => setModule(event.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!ready || busy || module === ''}
            onClick={() => run({ kind: 'curate', module })}
          >
            {t('settings.agent.terminal.curate')}
          </Button>
        </div>
        {ready && modules.data && pickable.length === 0 ? (
          <p>{t('settings.agent.terminal.module.none')}</p>
        ) : null}
        <Outcome outcome={outcome} />
      </div>
    </Panel>
  );
}

function Outcome({ outcome }: { outcome: TerminalLaunchResult | 'failed' | null }) {
  const t = useT();
  if (outcome === null) return null;
  if (outcome === 'failed') return <p role="alert">{t('settings.agent.terminal.error')}</p>;
  if (outcome.ok) {
    return <p role="status">{t(`settings.agent.terminal.opened.${outcome.terminal}`)}</p>;
  }
  return (
    <p role="alert">
      {outcome.reason === 'no-terminal' && outcome.detail
        ? t('settings.agent.terminal.reason.no-terminal.detail', { code: outcome.detail })
        : t(`settings.agent.terminal.reason.${outcome.reason}`)}
    </p>
  );
}
