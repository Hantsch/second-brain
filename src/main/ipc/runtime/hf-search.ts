/* `llm:searchModelFiles` (033) — search Hugging Face for GGUF repositories, or
 * list one repository's `.gguf` files, over D3's pure `core/llm/hf/search.ts`.
 *
 * Minimal wiring only: the honest-failure classification (`gated`,
 * `network-error`, `error`) and the quantisation parsing already live in D3
 * and are not repeated here. This file's only job is the IPC boundary —
 * inject the real `fetch`, tag the outcome with which step produced it, and
 * never log the query or the model id (guardrail 6: no user content in a log
 * line).
 */

import { listHfModelFiles, searchHfModels } from '@core/llm';
import type { FetchLike } from '@core/llm';
import type { HandlerMap } from '../registry';
import { defineHandlers } from '../registry';
import type { Services } from '../../services';

/** Test seam: production uses the real global `fetch`; tests inject a fake,
    so no test ever touches the network. */
export interface HfSearchDeps {
  fetchImpl?: FetchLike;
}

export function hfSearchHandlers(services: Services, deps: HfSearchDeps = {}): HandlerMap {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return defineHandlers({
    'llm:searchModelFiles': async (request) => {
      void services;
      if (request.step === 'search') {
        const outcome = await searchHfModels(fetchImpl, request.query);
        return { step: 'search', ...outcome };
      }
      const outcome = await listHfModelFiles(fetchImpl, request.modelId);
      return { step: 'files', ...outcome };
    },
  });
}
