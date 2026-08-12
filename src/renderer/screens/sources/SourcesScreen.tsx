/* Sources — the path from outside into the vault.

   Top to bottom in the order you need them: the input (a field that detects
   for itself what's coming in), the state of yt-dlp, this session's jobs,
   and below that the inventory — what's already been ingested, with the
   uncondensed ones highlighted.

   The whole screen is a drop zone: a file falls in and gets ingested
   (`DropZone` explains what works and what doesn't).

   The one teal focus point is "ingest". Everything else stays calm. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IngestKind } from '@shared/types';
import { DropZone } from '../../components/DropZone';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { plural } from '../../lib/format';
import { useModules, useSources } from '../../lib/queries/data';
import { useIngestJobs, useIngestMutations, useYtdlpStatus } from '../../lib/queries/ingest';
import { pushToast } from '../../lib/toast';
import { JobList } from './JobList';
import { SourceInput } from './SourceInput';
import { SourceRow } from './SourceRow';
import { YtdlpRow } from './YtdlpRow';

export function SourcesScreen() {
  const t = useT();
  const navigate = useNavigate();
  const sources = useSources();
  const modules = useModules();
  const jobs = useIngestJobs();
  const ytdlp = useYtdlpStatus();
  const mutations = useIngestMutations();

  const [input, setInput] = useState('');
  const [module, setModule] = useState<string | null>(null);

  const start = (kind: IngestKind, text: string): void => {
    mutations.start.mutate({ kind, input: text, module }, { onSuccess: () => setInput('') });
  };

  /** Selected files come with their path — the original moves into raw/. */
  const pickFiles = (): void => {
    void api.ingest
      .pickFiles()
      .then((paths) => {
        for (const path of paths) mutations.start.mutate({ kind: 'file', input: path, module });
      })
      .catch(() => undefined);
  };

  const openRaw = (path: string): void => {
    void api.shell.showInFolder(path).catch(() => undefined);
  };

  const openPage = (path: string): void => {
    const slug = /^modules\/([^/]+)\//.exec(path)?.[1];
    if (slug === undefined) return;
    void navigate(`/modules?m=${encodeURIComponent(slug)}&p=${encodeURIComponent(path)}`);
  };

  const failure = mutations.start.error ?? mutations.retry.error ?? mutations.install.error ?? null;
  const list = sources.data ?? [];

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
      <div className="sb-screen sb-screen--wide">
        <ScreenHeader overline={t('screen.sources.overline')} title={t('screen.sources.title')} />

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

        {failure === null ? null : (
          <ErrorState error={failure} variant="secondary" scrollIntoView />
        )}

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
              onOpenRaw={openRaw}
              onOpenPage={openPage}
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
          >
            <ul className="sb-rows">
              {list.map((source) => (
                <SourceRow
                  key={source.path}
                  source={source}
                  onOpen={openRaw}
                  onOpenPage={(slug) => {
                    const found = list.find((entry) => entry.sourcePage === slug);
                    const target = found?.modules[0];
                    if (target === undefined) return;
                    void navigate(
                      `/modules?m=${encodeURIComponent(target)}&p=${encodeURIComponent(
                        `modules/${target}/wiki/sources/${slug}.md`,
                      )}`,
                    );
                  }}
                />
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </DropZone>
  );
}
