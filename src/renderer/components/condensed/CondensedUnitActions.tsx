/* The trigger row of a condensed unit: Condense, what the queue is doing about
   it, and — when the caller offers one — the hand-over to the agent. A
   condensation that is with the agent is not a running one: the trigger is
   disabled without a spinner, because nothing in the app is turning, and the
   line says who has it. */

import type { ReactNode } from 'react';
import { Button } from '../../atoms/Button';
import { Spinner } from '../../atoms/Spinner';
import { useT } from '../../i18n';
import type { TaskForSubject } from '../../lib/hooks/use-task-for-subject';

export interface CondensedUnitActionsProps {
  /** i18n key block of the panel, e.g. `modules.condensed`. */
  keyPrefix: string;
  current: TaskForSubject;
  /** The agent holds the condensation: not a run in this app, so no spinner. */
  withAgent: boolean;
  hasArtifact: boolean;
  onTrigger: () => void;
  agentAction?: ReactNode;
  /** False with no model routed: there is nothing to run, but the agent can still be asked. */
  canTrigger?: boolean;
}

export function CondensedUnitActions({
  keyPrefix,
  current,
  withAgent,
  hasArtifact,
  onTrigger,
  agentAction,
  canTrigger = true,
}: CondensedUnitActionsProps) {
  const t = useT();
  const busy = withAgent || current.status === 'running' || current.status === 'queued';
  const key = (suffix: string): string => `${keyPrefix}.${suffix}`;
  return (
    <div className="sb-condensed-actions">
      {canTrigger ? (
        <Button icon="sparkles" loading={busy && !withAgent} disabled={busy} onClick={onTrigger}>
          {hasArtifact ? t(key('triggerAgain')) : t(key('trigger'))}
        </Button>
      ) : null}
      {agentAction}
      {withAgent ? <span className="sb-condensed-running">{t(key('withAgent'))}</span> : null}
      {current.status === 'running' && !withAgent ? (
        <span className="sb-condensed-running">
          <Spinner size={14} />
          {t(key('running'))}
        </span>
      ) : null}
      {/* Waiting for the model lane, not running — no spinner, because nothing is turning yet.
          `queuePosition` is only null for a task that is no longer queued, so there is nothing
          to say in that case that the disabled trigger doesn't already say. */}
      {current.status === 'queued' && !withAgent && current.queuePosition !== null ? (
        <span className="sb-condensed-running">
          {t(key('waiting'), { position: current.queuePosition })}
        </span>
      ) : null}
    </div>
  );
}
