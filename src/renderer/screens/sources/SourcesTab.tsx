/* Sources — the path from outside into the vault, as a reusable tab body.

   Top to bottom in the order you need them: the input (a field that detects
   for itself what's coming in), the state of yt-dlp, this session's jobs,
   and below that the inventory — what's already been ingested, with the
   uncondensed ones highlighted.

   The whole tab is a drop zone: a file falls in and gets ingested
   (`DropZone` explains what works and what doesn't).

   Why the drop zone sits here and not in the screen: a drop feeds exactly the
   state this component owns — the input field, the target module, the ingest
   mutations — so the handlers have to live next to that state. `DropZone` is
   therefore this component's root and carries the column layout of the tab
   body itself (`.sb-dropzone` in `styles/app/sources.css`), which keeps the
   panel spacing identical to the screen column the panels used to sit in.
   The tab renders no `ScreenHeader`: it is meant to be one body among several
   on a screen that already brings its own header.

   The one teal focus point is "ingest". Everything else stays calm. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IngestKind } from '@shared/types';
import type { IngestJob } from '@shared/types';
import { Switch } from '../../atoms/Switch';
import { DropZone } from '../../components/DropZone';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { plural } from '../../lib/format';
import { runningJobFor } from '../../lib/jobs';
import { useModules, useSources } from '../../lib/queries/data';
import { openSourceJob, useAgentJobMutations, useAgentJobs } from '../../lib/queries/agent-jobs';
import { useIngestJobs, useIngestMutations, useYtdlpStatus } from '../../lib/queries/ingest';
import { pushToast } from '../../lib/toast';
import { JobList } from './JobList';
import { SourceInput } from './SourceInput';
import { SourceDetailDialog } from './SourceDetailDialog';
import { SourceRow } from './SourceRow';
import { YtdlpRow } from './YtdlpRow';

export interface SourcesTabProps {
  /** Seeds the target-module picker; the user may change it afterwards. */
  initialModule?: string | null;
}

export function SourcesTab({ initialModule = null }: SourcesTabProps) {
  const t = useT();
  const navigate = useNavigate();
  const sources = useSources();
  const modules = useModules();
  const jobs = useIngestJobs();
  const ytdlp = useYtdlpStatus();
  const mutations = useIngestMutations();
  const agentJobs = useAgentJobs();
  const agentMutations = useAgentJobMutations();

  const [input, setInput] = useState('');
  /* A seed, not a binding: `initialModule` only decides where the picker
     starts. Whoever passes a new one remounts this tab (see `ModulesScreen`),
     so no effect has to overwrite what the user picked in the meantime. */
  const [module, setModule] = useState<string | null>(initialModule);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hideSuccessful, setHideSuccessful] = useState(true);

  const afterStart = (job: IngestJob): void => {
    setInput('');
    if (job.stage !== 'duplicate' || job.duplicateOf === null || job.duplicateOf === undefined) {
      return;
    }
    setSelectedPath(job.duplicateOf);
    pushToast('warn', t('sources.duplicate', { path: job.duplicateOf }));
  };

  const start = (kind: IngestKind, text: string): void => {
    mutations.start.mutate({ kind, input: text, module }, { onSuccess: afterStart });
  };

  /* The duplicate check exists so a re-drop doesn't silently double a source —
     but sometimes running it again is exactly the point (the source changed
     upstream). The trigger sits on the duplicate row itself and bypasses the
     check on purpose, once, for that one job. */
  const ingestAgain = (id: string): void => {
    const job = (jobs.data ?? []).find((entry) => entry.id === id);
    if (job === undefined) return;
    mutations.start.mutate(
      { kind: job.kind, input: job.input, module: job.module, force: true },
      { onSuccess: afterStart },
    );
  };

  /** Selected files come with their path — the original moves into raw/. */
  const pickFiles = (): void => {
    void api.ingest
      .pickFiles()
      .then((paths) => {
        for (const path of paths) {
          mutations.start.mutate({ kind: 'file', input: path, module }, { onSuccess: afterStart });
        }
      })
      .catch(() => undefined);
  };

  const openRaw = (path: string): void => {
    void api.shell.showInFolder(path).catch(() => undefined);
  };

  const openPage = (path: string): void => {
    const slug = /^modules\/([^/]+)\//.exec(path)?.[1];
    if (slug === undefined) return;
    void navigate(`/knowledge?m=${encodeURIComponent(slug)}&p=${encodeURIComponent(path)}`);
  };

  const openSourcePage = (sourcePage: string, target: string): void => {
    void navigate(
      `/knowledge?m=${encodeURIComponent(target)}&p=${encodeURIComponent(
        `modules/${target}/wiki/sources/${sourcePage}.md`,
      )}`,
    );
  };

  const failure =
    mutations.start.error ??
    mutations.retry.error ??
    mutations.install.error ??
    agentMutations.handOver.error ??
    agentMutations.withdraw.error ??
    null;
  const list = sources.data ?? [];
  const visibleList = hideSuccessful ? list.filter((source) => source.sourcePage === null) : list;

  return (
    <DropZone
      onText={(text) => setInput(text)}
      onFiles={(files) => {
        /* Dropped files come in as content, not as a path — that's why
           they're ingested as text. The file dialog takes the original. */
        for (const file of files) {
          if (file.text.trim().length > 0)
            mutations.start.mutate({ kind: 'text', input: file.text, module });
        }
      }}
      onRejected={(kind, names) =>
        pushToast('warn', t(`sources.drop.${kind}`, { names: names.join(', ') }))
      }
    >
      <Panel title={t('sources.input.title')}>
        <SourceInput
          value={input}
          onChange={setInput}
          modules={modules.data ?? []}
          module={module}
          onModule={setModule}
          busy={mutations.start.isPending}
          onSubmit={start}
          onPickFiles={pickFiles}
        />
        <YtdlpRow
          status={ytdlp.data}
          pending={ytdlp.isPending}
          installing={mutations.install.isPending}
          onInstall={() => mutations.install.mutate()}
        />
      </Panel>

      {failure === null ? null : <ErrorState error={failure} variant="secondary" scrollIntoView />}

      {jobs.error ? (
        <ErrorState error={jobs.error} variant="secondary" onRetry={() => void jobs.refetch()} />
      ) : (jobs.data ?? []).length === 0 ? null : (
        <Panel
          title={t('sources.jobs.title')}
          meta={plural((jobs.data ?? []).length, 'sources.jobs.countOne', 'sources.jobs.count')}
        >
          <JobList
            jobs={jobs.data ?? []}
            onCancel={(id) => mutations.cancel.mutate(id)}
            onRetry={(id) => mutations.retry.mutate(id)}
            onIngestAgain={ingestAgain}
            ingestAgainPending={mutations.start.isPending}
            onOpenRaw={openRaw}
            onOpenPage={openPage}
            agentJobs={agentJobs.data ?? []}
            onHandOver={(rawPath, target) =>
              agentMutations.handOver.mutate({ rawPath, module: target })
            }
            onWithdraw={(id) => agentMutations.withdraw.mutate(id)}
          />
        </Panel>
      )}

      {sources.error ? (
        <ErrorState
          error={sources.error}
          variant="secondary"
          onRetry={() => void sources.refetch()}
        />
      ) : sources.isPending || sources.data === undefined ? (
        <Panel title={t('sources.list.title')}>
          <Skeleton lines={3} height={44} />
        </Panel>
      ) : list.length === 0 ? (
        <Panel title={t('sources.kinds.title')} note={t('screen.sources.empty.body')}>
          <ul className="sb-lines">
            {(['youtube', 'url', 'file', 'text'] as const).map((kind) => (
              <li key={kind} className="sb-line">
                <span className="sb-line-name">{t(`sources.kind.${kind}`)}</span>
                <span className="sb-line-detail">{t(`sources.kinds.${kind}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel
          title={t('sources.list.title')}
          meta={plural(list.length, 'sources.list.countOne', 'sources.list.count')}
          action={
            <Switch
              label={t('sources.list.hideSuccessful')}
              checked={hideSuccessful}
              onChange={(event) => setHideSuccessful(event.target.checked)}
            />
          }
        >
          {visibleList.length === 0 ? (
            <p className="sb-panel-empty">{t('sources.list.noAttention')}</p>
          ) : (
            <ul className="sb-rows">
              {visibleList.map((source) => (
                <SourceRow
                  key={source.path}
                  source={source}
                  onOpen={setSelectedPath}
                  onOpenPage={(slug) => {
                    const found = list.find((entry) => entry.sourcePage === slug);
                    const target = found?.modules[0];
                    if (target === undefined) return;
                    openSourcePage(slug, target);
                  }}
                  modules={modules.data ?? []}
                  agentJob={openSourceJob(agentJobs.data, source.path)}
                  onHandOver={(path, targetModule) =>
                    agentMutations.handOver.mutate({ rawPath: path, module: targetModule })
                  }
                  onWithdraw={(id) => agentMutations.withdraw.mutate(id)}
                  onCondense={(path, targetModule) =>
                    mutations.condense.mutate({ path, module: targetModule })
                  }
                  onCondenseFromMetadata={(path, targetModule) =>
                    mutations.condense.mutate({ path, module: targetModule, basis: 'metadata' })
                  }
                  /* The button stays locked until the run is through — the
                     mutation is done as soon as the job is queued, and a
                     second click would condense the same source twice. */
                  condensing={
                    (mutations.condense.isPending &&
                      mutations.condense.variables?.path === source.path) ||
                    runningJobFor(jobs.data ?? [], source.path) !== null
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      )}
      <SourceDetailDialog
        key={selectedPath ?? 'closed'}
        path={selectedPath}
        modules={modules.data ?? []}
        jobs={jobs.data ?? []}
        onClose={() => setSelectedPath(null)}
        onOpenRaw={openRaw}
        onOpenPage={openSourcePage}
      />
    </DropZone>
  );
}
