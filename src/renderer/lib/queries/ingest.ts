/* Die Hooks des Aufnehmens: Auftragsliste, yt-dlp-Zustand und die vier Aktionen
   (starten, abbrechen, wiederholen, Binary holen).

   Fortschritt kommt als `event:ingest-progress` und wird **in den Zwischenspeicher
   geschrieben**, nicht als Neuabfrage: ein Auftrag meldet sich dutzende Male, und
   jede Meldung eine Runde über den Hauptprozess zu schicken wäre Verschwendung.
   Die Wahrheit bleibt trotzdem dort — `events.ts` frischt die Liste zusätzlich
   auf, und beides sagt dasselbe. */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { IngestJob } from '@shared/types';
import { api } from '../api';
import { bridge } from '../bridge';
import { qk } from './keys';

export type YtdlpStatus = IpcResponse<'ingest:ytdlpStatus'>;

/** Den gemeldeten Auftrag in die Liste einsetzen — vorne, wenn er neu ist. */
function mergeJob(jobs: readonly IngestJob[] | undefined, job: IngestJob): IngestJob[] {
  const list = jobs ?? [];
  const at = list.findIndex((entry) => entry.id === job.id);
  if (at < 0) return [...list, job];
  const next = [...list];
  next[at] = job;
  return next;
}

/**
 * Alle Aufträge, laufende zuerst gemeldet. Die Liste lebt im Hauptprozess; hier
 * steht nur ihr Abbild.
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

/** Liegt yt-dlp auf dieser Maschine? Nur gefragt, nie von selbst geholt. */
export function useYtdlpStatus(): UseQueryResult<YtdlpStatus> {
  return useQuery({
    queryKey: qk.ingest.ytdlp(),
    queryFn: api.ingest.ytdlpStatus,
    retry: false,
    /* Ob das Binary da ist, entscheidet sich außerhalb der App. */
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
