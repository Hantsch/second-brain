/* The hooks for ingesting: job list, yt-dlp status, and the four actions
   (start, cancel, retry, fetch the binary).

   Progress arrives as `event:ingest-progress` and is **written straight into
   the query cache**, not refetched: a job reports in dozens of times, and
   sending every report on a round trip through the main process would be
   wasteful. The source of truth stays there regardless — `events.ts` also
   refreshes the list, and both say the same thing. */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { IngestJob } from '@shared/types';
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
    return bridge().on('event:ingest-progress', (job) => {
      client.setQueryData<IngestJob[]>(qk.ingest.jobs(), (jobs) => mergeJob(jobs, job));
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

function refreshJobs(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.ingest.jobs() });
}

export interface IngestMutations {
  start: UseMutationResult<IngestJob, unknown, IpcRequest<'ingest:start'>>;
  cancel: UseMutationResult<void, unknown, string>;
  retry: UseMutationResult<IngestJob, unknown, string>;
  install: UseMutationResult<YtdlpStatus, unknown, void>;
}

export function useIngestMutations(): IngestMutations {
  const client = useQueryClient();
  const done = (): void => refreshJobs(client);
  return {
    start: useMutation({ mutationFn: api.ingest.start, onSuccess: done }),
    cancel: useMutation({ mutationFn: api.ingest.cancel, onSuccess: done }),
    retry: useMutation({ mutationFn: api.ingest.retry, onSuccess: done }),
    install: useMutation({
      mutationFn: () => api.ingest.ytdlpInstall(),
      onSuccess: (status) => client.setQueryData(qk.ingest.ytdlp(), status),
    }),
  };
}
