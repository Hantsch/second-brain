/* The hooks of capturing: write a dump, fetch a proposal, file it, leave it
   unfiled, discard it, undo it.

   The proposal is fetched with a deliberate delay: someone moving through the
   inbox with j/k shouldn't trigger a model run for every step. After the
   delay, the main process answers from its cache as long as the dump is
   unchanged — moving back then costs nothing. */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { CaptureSettings, DumpItem, FilingProposal, FilingResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';

/** How long a selection must hold still before filing is proposed. */
export const PROPOSAL_DELAY_MS = 250;

/**
 * Delays a path; every change restarts the timer.
 *
 * The first selection doesn't wait: the list finishing its load isn't a move
 * by the user — the proposal for the top dump should arrive immediately. The
 * wait only kicks in once someone advances with j/k.
 */
function useSettledPath(path: string | null, delayMs: number): string | null {
  const [settled, setSettled] = useState(path);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(path), settled === null ? 0 : delayMs);
    return () => clearTimeout(timer);
  }, [path, delayMs, settled]);
  return settled;
}

/**
 * The filing proposal for a dump. `null` means: none is currently selected —
 * then no request is made and nothing is claimed.
 */
export function useProposal(
  path: string | null,
  delayMs = PROPOSAL_DELAY_MS,
): UseQueryResult<FilingProposal> {
  const settled = useSettledPath(path, delayMs);
  return useQuery({
    queryKey: qk.capture.proposal(path ?? ''),
    queryFn: () => api.capture.classify(path ?? ''),
    enabled: path !== null && settled === path,
    /* Classifying is expensive and can't get better without a model: a
       failure stays a failure that the user retries themselves. */
    retry: false,
  });
}

/** The vault's capture settings; `undefined` while unknown. */
export function useCaptureSettings(): CaptureSettings | undefined {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  return data?.vault?.capture;
}

/* Filing touches project files, todos and the index. The main process
   afterward sends `event:vault-changed`, which centrally invalidates
   everything affected; here only the inbox is reloaded immediately, so the
   card disappears without the detour through an event. */
function refreshInbox(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.capture.inbox() });
}

export interface CaptureMutations {
  dump: UseMutationResult<DumpItem, unknown, IpcRequest<'capture:dump'>>;
  apply: UseMutationResult<FilingResult, unknown, FilingProposal>;
  keep: UseMutationResult<IpcResponse<'capture:keep'>, unknown, string>;
  discard: UseMutationResult<{ undoToken: string }, unknown, string>;
  undo: UseMutationResult<void, unknown, string>;
}

export function useCaptureMutations(): CaptureMutations {
  const client = useQueryClient();
  const done = (): void => refreshInbox(client);

  return {
    dump: useMutation({ mutationFn: api.capture.dump, onSuccess: done }),
    apply: useMutation({ mutationFn: api.capture.apply, onSuccess: done }),
    keep: useMutation({ mutationFn: api.capture.keep, onSuccess: done }),
    discard: useMutation({ mutationFn: api.capture.discard, onSuccess: done }),
    undo: useMutation({
      mutationFn: api.capture.undo,
      onSuccess: () => {
        refreshInbox(client);
        /* Undo brings the dump back — its earlier proposal is valid again,
           but needs to be fetched anew. */
        void client.invalidateQueries({ queryKey: ['capture', 'proposal'] });
      },
    }),
  };
}
