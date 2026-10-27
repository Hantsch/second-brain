/* The hand-to-agent buttons for a module and for the last gardener run. One presentational
   button says either "hand to agent" or — while an open job exists — "with the agent", never
   both, so a second click cannot file a second job. A refused hand-over stays visible next
   to the button. (story 091) */

import { HELP_MODULE_SLUG } from '@shared/help-module';
import { Button } from '../atoms/Button';
import { useT } from '../i18n';
import {
  openJob,
  useAgentJobs,
  useCondenseWithAgent,
  useHandOverCondense,
  useHandOverGardenerRun,
  useHandOverModule,
} from '../lib/queries/agent-jobs';
import { isWithAgent, useTaskForSubject } from '../lib/hooks/use-task-for-subject';
import { ErrorState } from './ErrorState';

interface HandToAgentProps {
  open: boolean;
  pending: boolean;
  error: unknown;
  /** Already translated: what the error sentence is about. */
  subject: string;
  testId: string;
  variant: 'secondary' | 'ghost';
  /** Disables the button without saying the agent holds anything (e.g. an in-app run is going). */
  disabled?: boolean;
  /** Already translated; replaces the generic label while nothing is handed over. */
  label?: string;
  onHandOver: () => void;
}

function HandToAgent({
  open,
  pending,
  error,
  subject,
  testId,
  variant,
  disabled = false,
  label,
  onHandOver,
}: HandToAgentProps) {
  const t = useT();
  return (
    <div className="sb-handtoagent">
      <Button
        variant={variant}
        size="sm"
        icon="bot"
        data-testid={testId}
        disabled={open || pending || disabled}
        onClick={onHandOver}
      >
        {open ? t('sources.agent.with') : (label ?? t('sources.agent.hand'))}
      </Button>
      {error ? <ErrorState error={error} subject={subject} variant="secondary" /> : null}
    </div>
  );
}

/** Not offered for the help module: it is read-only by convention. */
export function HandOverModuleButton({
  slug,
  variant = 'secondary',
}: {
  slug: string;
  variant?: 'secondary' | 'ghost';
}) {
  const jobs = useAgentJobs().data;
  const handOver = useHandOverModule();
  if (slug === HELP_MODULE_SLUG) return null;
  return (
    <HandToAgent
      open={openJob(jobs, 'curate-module', slug) !== null}
      pending={handOver.isPending}
      error={handOver.error}
      subject={slug}
      testId={`hand-module-${slug}`}
      variant={variant}
      onHandOver={() => handOver.mutate(slug)}
    />
  );
}

/** In the module's condensed tab. Disabled while any condensation of the module is queued or
    running, so a hand-over cannot start next to an in-app run; main refuses that case too. */
export function HandOverCondenseButton({ slug }: { slug: string }) {
  const t = useT();
  const handOver = useHandOverCondense();
  const current = useTaskForSubject('condense', `module:${slug}`);
  const agentOpen = useCondenseWithAgent(slug);
  const active = current.status === 'running' || current.status === 'queued';
  return (
    <HandToAgent
      open={agentOpen || isWithAgent(current)}
      pending={handOver.isPending}
      error={handOver.error}
      subject={slug}
      testId={`hand-condense-${slug}`}
      variant="secondary"
      disabled={active || agentOpen}
      label={t('modules.condensed.handToAgent')}
      onHandOver={() => handOver.mutate(slug)}
    />
  );
}

/** Mounted only when main offers the run (`agentAudit.offered`); `open` says a job waits. */
export function HandOverGardenerRunButton({ open }: { open: boolean }) {
  const t = useT();
  const handOver = useHandOverGardenerRun();
  return (
    <HandToAgent
      open={open}
      pending={handOver.isPending}
      error={handOver.error}
      subject={t('rail.garden')}
      testId="hand-gardener-run"
      variant="ghost"
      onHandOver={() => handOver.mutate()}
    />
  );
}
