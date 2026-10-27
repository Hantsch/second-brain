/* The plan for an agent setup install or update, and the write it confirms.

   The plan is the one the panel held when the dialog opened: applying it
   refetches the setup state, and a plan that rewrote itself under the user's
   eyes would no longer be the thing they confirmed. Files the user changed are
   offered unticked; only what is ticked, plus what the plan writes anyway, is
   sent. */

import { useState } from 'react';
import type { AgentSetupApplyResult, AgentSetupPlan } from '@shared/types';
import { Badge } from '../../../atoms/Badge';
import { Button } from '../../../atoms/Button';
import { Checkbox } from '../../../atoms/Checkbox';
import { Dialog } from '../../../atoms/Dialog';
import { useT } from '../../../i18n';
import { decodeIpcError } from '../../../lib/ipc-error';
import { useApplyAgentSetup } from '../../../lib/queries/agent';

export interface AgentSetupPlanDialogProps {
  plan: AgentSetupPlan;
  action: 'install' | 'update';
  /** Paths of the files Gaston ships a template for; a `yours` file at one of them is
      the user's replacement for a managed file. */
  managedPaths: ReadonlySet<string>;
  onClose: () => void;
}

type Outcomes = AgentSetupApplyResult['results'];

function PlanSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sb-setting" aria-label={title}>
      <p className="gs-label">{title}</p>
      {children}
    </section>
  );
}

function Outcome({ results }: { results: Outcomes }) {
  const t = useT();
  const written = results.filter((entry) => entry.outcome === 'written').length;
  const problems = results.filter((entry) => entry.outcome !== 'written');
  return (
    <>
      <p role="status">
        {written === 0
          ? t('settings.agent.setup.plan.result.none')
          : t(
              written === 1
                ? 'settings.agent.setup.plan.result.writtenOne'
                : 'settings.agent.setup.plan.result.written',
              { count: written },
            )}
      </p>
      {problems.map(({ path, outcome, reason }) => (
        <p key={path} className="sb-note-detail sb-note-bad">
          {outcome === 'failed'
            ? t('settings.agent.setup.plan.result.failed', { path, reason: reason ?? '' })
            : t(
                `settings.agent.setup.plan.result.${outcome === 'conflict' ? 'conflict' : 'refused'}`,
                { path },
              )}
        </p>
      ))}
    </>
  );
}

export function AgentSetupPlanDialog({
  plan,
  action,
  managedPaths,
  onClose,
}: AgentSetupPlanDialogProps) {
  const t = useT();
  const apply = useApplyAgentSetup();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<Outcomes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmed = [...plan.write, ...plan.optIn.filter((entry) => ticked.has(entry.path))].map(
    ({ path, expectedHash }) => ({ path, expectedHash }),
  );

  const toggle = (path: string, on: boolean): void => {
    const next = new Set(ticked);
    if (on) next.add(path);
    else next.delete(path);
    setTicked(next);
  };

  const confirm = (): void => {
    setError(null);
    apply.mutate(
      { confirmed },
      {
        onSuccess: (res) => setResults(res.results),
        onError: (failure: unknown) => setError(t(`error.code.${decodeIpcError(failure).code}`)),
      },
    );
  };

  return (
    <Dialog
      open
      title={t(`settings.agent.setup.plan.${action}`)}
      onClose={apply.isPending ? undefined : onClose}
      closeLabel={t('common.close')}
      size="lg"
      footer={
        results ? (
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={apply.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              loading={apply.isPending}
              disabled={confirmed.length === 0 || plan.collision !== undefined}
              onClick={confirm}
            >
              {t(
                confirmed.length === 1
                  ? 'settings.agent.setup.plan.confirmOne'
                  : 'settings.agent.setup.plan.confirm',
                { count: confirmed.length },
              )}
            </Button>
          </>
        )
      }
    >
      <div className="sb-setting-block">
        {results ? (
          <Outcome results={results} />
        ) : (
          <>
            <p className="sb-dialog-lead">{t('settings.agent.setup.plan.intro')}</p>
            {plan.collision ? (
              <p role="status" className="sb-note-detail sb-note-bad">
                {t('settings.agent.setup.help.collision')}
              </p>
            ) : null}
            {plan.write.length > 0 ? (
              <PlanSection title={t('settings.agent.setup.plan.write')}>
                <ul className="sb-setup-files">
                  {plan.write.map(({ path, reason }) => (
                    <li key={path} className="sb-setup-file">
                      <span className="sb-mono sb-setup-path">{path}</span>
                      <Badge variant="warning">{t(`settings.agent.setup.status.${reason}`)}</Badge>
                    </li>
                  ))}
                </ul>
              </PlanSection>
            ) : null}
            {plan.optIn.length > 0 ? (
              <PlanSection title={t('settings.agent.setup.plan.optIn')}>
                <ul className="sb-setup-files">
                  {plan.optIn.map(({ path }) => (
                    <li key={path} className="sb-setup-file">
                      <Checkbox
                        checked={ticked.has(path)}
                        onChange={(event) => toggle(path, event.target.checked)}
                        label={path}
                        description={t('settings.agent.setup.plan.optInHint')}
                      />
                    </li>
                  ))}
                </ul>
              </PlanSection>
            ) : null}
            {plan.leave.length > 0 ? (
              <PlanSection title={t('settings.agent.setup.plan.leave')}>
                <ul className="sb-setup-files">
                  {plan.leave.map(({ path, status }) => (
                    <li key={path} className="sb-setup-file">
                      <span className="sb-mono sb-setup-path">{path}</span>
                      <Badge>{t(`settings.agent.setup.status.${status}`)}</Badge>
                      {status === 'yours' && managedPaths.has(path) ? (
                        <span className="sb-note-detail">
                          {t('settings.agent.setup.plan.leaveManaged')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </PlanSection>
            ) : null}
            {plan.dirs.length > 0 ? (
              <PlanSection title={t('settings.agent.setup.plan.dirs')}>
                <ul className="sb-setup-files">
                  {plan.dirs.map((dir) => (
                    <li key={dir} className="sb-mono sb-setup-path">
                      {dir}
                    </li>
                  ))}
                </ul>
              </PlanSection>
            ) : null}
            {error ? (
              <p role="alert" className="sb-note-detail sb-note-bad">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
