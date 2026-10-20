/* The hooks for ingesting: job list, yt-dlp status, and the four actions
   (start, cancel, retry, fetch the binary).

   Progress used to arrive as `event:ingest-progress` and was written straight
   into the query cache. That channel is gone (074, D4): a job is mirrored onto
   the one work queue and travels with `event:work-tasks` instead — the whole
   current list, every time, with every other kind of task riding along in the
   same emission. `useIngestJobs` filters that list down to `'ingest'`-kind
   tasks and merges each one's `detail` (the job it concerns) into the cache,
   the same "write straight in, never refetch" shape the old subscription used:
   a job reports in dozens of times, and a round trip through the main process
   for every tick would be wasteful. */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { IngestJob, SourceDetail } from '@shared/types';
import { api } from '../api';
import { bridge } from '../bridge';
import { qk } from './keys';

export type YtdlpStatus = IpcResponse<'ingest:ytdlpStatus'>;

/** Insert the reported job into the list — appended if it's new. */
function mergeJob(jobs: readonly IngestJob[] | undefined, job: IngestJob): IngestJob[] {
  const list = jobs ?? [];
  const at = list.findIndex((entry) => entry.id === job.id);
  if (at < 0) return [...list, job];
  const next = [...list];
  next[at] = job;
  return next;
}

/**
 * All jobs, running ones reported first. The list lives in the main process;
 * here there's only a mirror of it.
 */
export function useIngestJobs(): UseQueryResult<IngestJob[]> {
  const client = useQueryClient();
  const result = useQuery({ queryKey: qk.ingest.jobs(), queryFn: api.ingest.jobs, retry: false });

  useEffect(() => {
    return bridge().on('event:work-tasks', (tasks) => {
      const ingestJobs = tasks
        .filter((task) => task.kind === 'ingest' && task.detail !== null)
        /* Only the ingest producer (`src/main/ipc/ingest.ts`'s `mirror()`) ever
           sets `detail` on a task of kind `'ingest'`, so this cast is safe. */
        .map((task) => task.detail as IngestJob);
      if (ingestJobs.length === 0) return;
      client.setQueryData<IngestJob[]>(qk.ingest.jobs(), (jobs) =>
        ingestJobs.reduce(mergeJob, jobs ?? []),
      );
    });
  }, [client]);

  return result;
}

/** Is yt-dlp present on this machine? Only asked, never fetched on its own. */
export function useYtdlpStatus(): UseQueryResult<YtdlpStatus> {
  return useQuery({
    queryKey: qk.ingest.ytdlp(),
    queryFn: api.ingest.ytdlpStatus,
    retry: false,
    /* Whether the binary is present is decided outside the app. */
    staleTime: 0,
  });
}

export function useSourceDetail(path: string | null): UseQueryResult<SourceDetail> {
  return useQuery({
    queryKey: qk.ingest.detail(path ?? ''),
    queryFn: () => api.ingest.detail(path ?? ''),
    enabled: path !== null,
    retry: false,
  });
}

function refreshJobs(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.ingest.jobs() });
}

export interface IngestMutations {
  start: UseMutationResult<IngestJob, unknown, IpcRequest<'ingest:start'>>;
  cancel: UseMutationResult<void, unknown, string>;
  retry: UseMutationResult<IngestJob, unknown, string>;
  condense: UseMutationResult<IngestJob, unknown, IpcRequest<'ingest:condense'>>;
  analyzeResources: UseMutationResult<SourceDetail, unknown, string>;
  attachFiles: UseMutationResult<SourceDetail, unknown, string>;
  install: UseMutationResult<YtdlpStatus, unknown, void>;
}

export function useIngestMutations(): IngestMutations {
  const client = useQueryClient();
  const done = (): void => refreshJobs(client);
  const updateDetail = (detail: SourceDetail): void => {
    client.setQueryData(qk.ingest.detail(detail.source.path), detail);
    void client.invalidateQueries({ queryKey: qk.modules.sources() });
  };
  return {
    start: useMutation({ mutationFn: api.ingest.start, onSuccess: done }),
    cancel: useMutation({ mutationFn: api.ingest.cancel, onSuccess: done }),
    retry: useMutation({ mutationFn: api.ingest.retry, onSuccess: done }),
    condense: useMutation({ mutationFn: api.ingest.condense, onSuccess: done }),
    analyzeResources: useMutation({
      mutationFn: api.ingest.analyzeResources,
      onSuccess: updateDetail,
    }),
    attachFiles: useMutation({ mutationFn: api.ingest.attachFiles, onSuccess: updateDetail }),
    install: useMutation({
      mutationFn: () => api.ingest.ytdlpInstall(),
      onSuccess: (status) => client.setQueryData(qk.ingest.ytdlp(), status),
    }),
  };
}
