/* The condensation hooks for one area (story 038): reading the existing
   artifact, triggering a run, and accepting/rejecting a proposal. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { CondenseProposal, CondenseUnit, WorkTask } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

export type CondensedArea = {
  content: string;
  hash: string;
  /** Where the artifact actually lies, as the read resolved it — a project's
      path needs the scope, so the renderer never derives it itself. */
  path: string;
  condensedAt: string;
  sources: string[];
} | null;

/** The existing condensed artifact of an area, read from the file — never
    gated on a model being routed (Guardrail 1: reading never needs an LLM). */
export function useCondensedArea(
  unit: CondenseUnit,
  slug: string | null,
): UseQueryResult<CondensedArea> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.condense.read(unit, slug ?? ''),
    queryFn: () => api.condense.read(unit, slug ?? ''),
    enabled: ready && slug !== null && slug.length > 0,
  });
}

export interface RunCondenseArgs {
  unit: CondenseUnit;
  slug: string;
}

/** Queues a condensation run and answers with the task that will carry it
    (073, D3/D5). Fire-and-forget by design: this hook's job ends the moment
    the queue has accepted the run. Waiting for it, reading back the proposal
    and surviving a navigation are all `useTaskForSubject`'s
    (`../hooks/use-task-for-subject`), which derives them from the session-
    lived work queue instead of from a mutation that dies with its component.

    What is left here is exactly what cannot come from the queue: the *queueing
    itself* failing — the dead end when no model is routed, for instance, which
    `condense:run` throws before any task exists (AC7). That error belongs to
    the click, not to a run, and the caller renders it as such. */
export function useCondenseRun(): UseMutationResult<WorkTask, unknown, RunCondenseArgs> {
  return useMutation({
    mutationFn: ({ unit, slug }: RunCondenseArgs) => api.condense.run(unit, slug),
  });
}

/** Accepts a proposal — the only path that actually writes
    `areas/<slug>.condensed.md` (D7). A stale `baseHash` fails with a
    `conflict` error instead of overwriting; the caller decides what to show
    for that, this hook only refreshes the artifact cache on success. */
export function useCondenseAccept(): UseMutationResult<
  { path: string; hash: string; undoToken: string | null },
  unknown,
  CondenseProposal
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (proposal: CondenseProposal) => api.condense.accept(proposal),
    onSuccess: (_result, proposal) => {
      void client.invalidateQueries({ queryKey: qk.condense.read(proposal.unit, proposal.slug) });
    },
  });
}

export interface RejectCondenseArgs {
  unit: CondenseUnit;
  slug: string;
  reason: string;
}

/** Rejects a proposal with a required reason — writes a directives-only
    file (`condense:reject` in the main process appends the reason, it
    never just discards). The caller decides what to show for a conflict
    or any other error; this hook only refreshes the artifact cache on
    success. */
export function useCondenseReject(): UseMutationResult<
  { path: string },
  unknown,
  RejectCondenseArgs
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ unit, slug, reason }: RejectCondenseArgs) =>
      api.condense.reject(unit, slug, reason),
    onSuccess: (_result, { unit, slug }) => {
      void client.invalidateQueries({ queryKey: qk.condense.read(unit, slug) });
    },
  });
}

export interface DeleteCondenseArgs {
  unit: CondenseUnit;
  slug: string;
  expectedHash: string;
}

/** Deletes the condensed artifact outright (043) — unlike reject, nothing of
    it survives, directives included. A stale `expectedHash` fails with a
    `conflict` instead of deleting; the caller decides what to show for that.
    `qk.gardener.report()` is invalidated alongside the artifact itself: a
    maintenance report that already flagged this area as due for a
    condensation refresh must not keep pointing at a file that no longer
    exists. */
export function useCondenseDelete(): UseMutationResult<
  { path: string; undoToken: string },
  unknown,
  DeleteCondenseArgs
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ unit, slug, expectedHash }: DeleteCondenseArgs) =>
      api.condense.delete(unit, slug, expectedHash),
    onSuccess: (_result, { unit, slug }) => {
      void client.invalidateQueries({ queryKey: qk.condense.read(unit, slug) });
      void client.invalidateQueries({ queryKey: qk.gardener.report() });
    },
  });
}
