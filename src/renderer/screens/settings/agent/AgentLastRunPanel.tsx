/* "Last run": the newest report the agent's stop hook left in the vault. Read on every
   change to the vault, so a run that ends while this tab is open shows up without a revisit. */

import { Panel } from '../../../components/Panel';
import { Skeleton } from '../../../components/Skeleton';
import { useLanguage, useT } from '../../../i18n';
import { formatDateTime, plural } from '../../../lib/format';
import { decodeIpcError } from '../../../lib/ipc-error';
import { useAgentLastRun, useAgentProposals } from '../../../lib/queries/agent';

type CountField = 'pages' | 'proposals' | 'jobsDone' | 'jobsFailed' | 'jobsSkipped';
const COUNT_FIELDS: CountField[] = ['pages', 'proposals', 'jobsDone', 'jobsFailed', 'jobsSkipped'];

export function AgentLastRunPanel() {
  const t = useT();
  const language = useLanguage();
  const query = useAgentLastRun();
  const waiting = useAgentProposals().data?.length ?? 0;
  const run = query.data;

  return (
    <Panel title={t('settings.agent.lastRun.title')}>
      <div className="sb-setting-block">
        {query.isError ? (
          <p role="alert">
            {t('settings.agent.lastRun.error', { reason: decodeIpcError(query.error).message })}
          </p>
        ) : run === undefined ? (
          <div role="status" aria-label={t('settings.agent.lastRun.loading')}>
            <Skeleton lines={3} height={20} />
          </div>
        ) : run.state === 'none' ? (
          <p>{t('settings.agent.lastRun.none')}</p>
        ) : run.state === 'unreadable' ? (
          <div className="sb-setting">
            <p>{t('settings.agent.lastRun.unreadable')}</p>
            <p className="sb-mono sb-setup-path">{run.path}</p>
            <span className="gs-label">{t('settings.agent.lastRun.reason')}</span>
            <p>{run.reason}</p>
          </div>
        ) : (
          <>
            <div className="sb-setting">
              <span className="gs-label">{t('settings.agent.lastRun.finished')}</span>
              <p className="sb-mono">{formatDateTime(run.report.finished, language)}</p>
              <span className="gs-label">{t('settings.agent.lastRun.skill')}</span>
              <p className="sb-mono">
                {run.report.argument === null
                  ? run.report.skill
                  : `${run.report.skill} ${run.report.argument}`}
              </p>
            </div>
            <ul className="sb-setup-files">
              {COUNT_FIELDS.filter(
                (field) => field !== 'jobsSkipped' || run.report.jobsSkipped.length > 0,
              ).map((field) => (
                <li key={field} className="sb-setup-file">
                  <span>{t(`settings.agent.lastRun.${field}`)}</span>
                  <span className="sb-mono">{run.report[field].length}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {/* Plain anchor, as in the rail's hash routing: keeps middle-click and keyboard semantics. */}
        {waiting > 0 ? (
          <a href="#/garden">
            {plural(waiting, 'settings.agent.lastRun.waitingOne', 'settings.agent.lastRun.waiting')}
          </a>
        ) : null}
      </div>
    </Panel>
  );
}
