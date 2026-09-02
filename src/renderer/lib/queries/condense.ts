/* The condensation hooks for one area (story 038): reading the existing
   artifact, triggering a run, and accepting/rejecting a proposal. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { CondenseProposal } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';

export type CondensedArea = {
  content: string;
  hash: string;
  condensedAt: string;
  sources: string[];
} | null;

/** The existing condensed artifact of an area, read from the file — never
    gated on a model being routed (Guardrail 1: reading never needs an LLM). */
export function useCondensedArea(slug: string | null): UseQueryResult<CondensedArea> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.condense.read(slug ?? ''),
    queryFn: () => api.condense.read(slug ?? ''),
    enabled: ready && slug !== null && slug.length > 0,
  });
}

/** Runs the condensation over an area's deterministic inputs. The resulting
    proposal is transient renderer state owned by the caller (`AreaCondensedTab`)
    — nothing is written yet, so no cache invalidation belongs here. */
export function useCondenseRun(): UseMutationResult<CondenseProposal, unknown, string> {
  return useMutation({ mutationFn: (slug: string) => api.condense.run(slug) });
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
      void client.invalidateQueries({ queryKey: qk.condense.read(proposal.slug) });
    },
  });
}

export interface RejectCondenseArgs {
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
    mutationFn: ({ slug, reason }: RejectCondenseArgs) => api.condense.reject(slug, reason),
    onSuccess: (_result, { slug }) => {
      void client.invalidateQueries({ queryKey: qk.condense.read(slug) });
    },
  });
}

export interface DeleteCondenseArgs {
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
    mutationFn: ({ slug, expectedHash }: DeleteCondenseArgs) =>
      api.condense.delete(slug, expectedHash),
    onSuccess: (_result, { slug }) => {
      void client.invalidateQueries({ queryKey: qk.condense.read(slug) });
      void client.invalidateQueries({ queryKey: qk.gardener.report() });
    },
  });
}
