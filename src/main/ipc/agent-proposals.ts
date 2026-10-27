/* The agent's proposals over IPC: `agent:proposals` lists what waits in the vault,
   `agent:proposalAccept` / `agent:proposalReject` resolve one by id.

   Only the id travels. It becomes a vault path in core, so its shape is checked here
   before `@core/agent` sees it; target and content are re-read from disk there.
   Core refusals (`GardenerError`) and stale hashes (`VaultConflictError`) already carry
   the matching IPC code and cross as such. (story 088) */

import { acceptProposal, rejectProposal } from '@core/agent/proposal-resolve';
import { listProposals } from '@core/agent/proposals';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { captureIndexOrNull } from './capture-deps';
import { docLanguage, wikiStore } from './wiki-bridge';
import type { Services } from '../services';

const PROPOSAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

function requireId(value: unknown): string {
  const id = (value as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !PROPOSAL_ID.test(id)) {
    throw fail('invalid', 'id: not a proposal id');
  }
  return id;
}

/** The live index when there is one, so no per-call in-memory index is rebuilt. */
function filingOptions(services: Services) {
  const index = captureIndexOrNull(services);
  return { ...(index ? { index } : {}), docLanguage: docLanguage(services) };
}

export function agentProposalHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'agent:proposals': async () => listProposals(wikiStore(services), filingOptions(services)),
    'agent:proposalAccept': async (request) =>
      acceptProposal(wikiStore(services), requireId(request), undefined, filingOptions(services)),
    'agent:proposalReject': async (request) => {
      await rejectProposal(wikiStore(services), requireId(request));
    },
  });
}
