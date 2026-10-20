/* Hugging Face search + file-list hooks for the llama.cpp model panel (033,
   D11) — split out of `queries/llm.ts` rather than grown into it: that file
   was already flagged over the project's soft line limit after D10, and
   these three hooks belong to one screen and share no state with the rest
   of it.

   Modeled as mutations, not queries: a search is a user-triggered action
   with no natural cache key (typing the same query twice should hit the
   network again, not serve a stale cache entry), and `llm:searchModelFiles`
   itself never throws for a gated repo or an offline network — those are
   honest states carried in the response (`ok: false, reason`), not errors a
   query's `error` would hold. */

import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { HfModelSearchResponse, HfPullFile } from '@shared/types';
import { api } from '../api';
import { usePullMutations } from './llm';

export function useHfModelSearch(): UseMutationResult<HfModelSearchResponse, unknown, string> {
  return useMutation({
    mutationFn: (query: string) => api.llm.searchModelFiles({ step: 'search', query }),
  });
}

export function useHfModelFiles(): UseMutationResult<HfModelSearchResponse, unknown, string> {
  return useMutation({
    mutationFn: (modelId: string) => api.llm.searchModelFiles({ step: 'files', modelId }),
  });
}

export interface LlamaCppModelPullMutations {
  start: UseMutationResult<{ pullId: string }, unknown, HfPullFile>;
  cancel: UseMutationResult<void, unknown, string>;
}

/**
 * Starts a llama.cpp model download from a picked Hugging Face file (033,
 * D7's `hfFile` contract) and reuses `usePullMutations`'s `cancelPull`
 * unchanged — the progress-event subscription (`events.ts` → `pullStore.ts`)
 * is already generic over `runtime`, so nothing about cancelling needs a
 * llama.cpp-specific copy. `hfFile.path` stands in for the channel's
 * `modelId`: `llamacpp-pull.ts`'s `pull` ignores that argument for this
 * runtime and reports progress under the file's own base name instead, so
 * the value carries no information the download itself doesn't already
 * have.
 */
export function useLlamaCppModelPull(): LlamaCppModelPullMutations {
  const { cancel } = usePullMutations('llamacpp');
  const start = useMutation({
    mutationFn: (hfFile: HfPullFile) => api.llm.pullModel('llamacpp', hfFile.path, hfFile),
  });
  return { start, cancel };
}
