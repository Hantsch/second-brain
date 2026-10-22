/* "Agent setup": which of the files Gaston installs for Claude Code are in
   place. Files the user wrote or changed are listed as theirs; nothing here
   rewrites them. */

import { useState } from 'react';
import type { AgentSetupFileStatus, AgentSetupState } from '@shared/types';
import { Badge } from '../../../atoms/Badge';
import type { BadgeProps } from '../../../atoms/Badge';
import { Button } from '../../../atoms/Button';
import { Panel } from '../../../components/Panel';
import { Skeleton } from '../../../components/Skeleton';
import { useT } from '../../../i18n';
import { decodeIpcError } from '../../../lib/ipc-error';
import { useAgentSetupState } from '../../../lib/queries/agent';
import { AgentSetupPlanDialog } from './AgentSetupPlanDialog';

const STATUS_VARIANT: Record<AgentSetupFileStatus, NonNullable<BadgeProps['variant']>> = {
  current: 'success',
  outdated: 'warning',
  missing: 'warning',
  modified: 'neutral',
  newer: 'neutral',
  yours: 'neutral',
};

export function AgentSetupPanel() {
  const t = useT();
  const query = useAgentSetupState();
  const state = query.data;
  /* The state the plan was opened from; see AgentSetupPlanDialog. */
  const [opened, setOpened] = useState<AgentSetupState | null>(null);

  return (
    <Panel title={t('settings.agent.setup.title')}>
      <div className="sb-setting-block">
        <p>{t('settings.agent.setup.intro')}</p>
        {query.isError ? (
          <p role="alert">
            {t('settings.agent.setup.error', { reason: decodeIpcError(query.error).message })}
          </p>
        ) : state ? (
          <>
            <ul className="sb-setup-files">
              {state.files.map((file) => (
                <li key={file.path} className="sb-setup-file">
                  <span className="sb-mono sb-setup-path">{file.path}</span>
                  <Badge variant={STATUS_VARIANT[file.status]}>
                    {t(`settings.agent.setup.status.${file.status}`)}
                  </Badge>
                  {file.installedVersion !== null && file.shippedVersion !== null ? (
                    <span className="sb-mono sb-setup-version">
                      {`v${file.installedVersion} → v${file.shippedVersion}`}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {state.action === 'none' ? (
              <p>{t('settings.agent.setup.current')}</p>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setOpened(state)}>
                {t(`settings.agent.setup.${state.action}`)}
              </Button>
            )}
          </>
        ) : (
          <div role="status" aria-label={t('settings.agent.setup.loading')}>
            <Skeleton lines={3} height={20} />
          </div>
        )}
      </div>
      {opened && opened.action !== 'none' ? (
        <AgentSetupPlanDialog
          plan={opened.plan}
          action={opened.action}
          managedPaths={
            new Set(opened.files.filter((f) => f.shippedVersion !== null).map((f) => f.path))
          }
          onClose={() => setOpened(null)}
        />
      ) : null}
    </Panel>
  );
}
