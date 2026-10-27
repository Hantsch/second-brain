/* Handing a module's overview condensation to the agent, and turning its answer into the
   proposal an in-app run would make. The result is untrusted: it only becomes a proposal
   against the overview as it was handed over, citing only the pages that were handed over,
   and it goes through the same composition and attribution check as the in-app run
   (story 092). Reasons name paths and sections, never vault content (Guardrail 6). */

import {
  moduleInputs,
  proposalFromModuleReply,
  type AttributionProblem,
  type ModuleReplyResult,
} from '@core/condense';
import type { IndexedDoc } from '@core/index/types';
import { parseJsonLoose } from '@core/llm';
import { sha256 } from '@core/vault/hash';
import type { DateLike } from '@core/vault/paths';
import type { CondenseProposal, DocLanguage } from '@shared/types';

/** What a module condensation job records at hand-over. */
export interface CondenseModuleJobPayload {
  slug: string;
  /** The module's pages at hand-over: the only ones the result may cite. */
  inputs: string[];
  /** sha256 of `overview.md` at hand-over, `null` when there was none. */
  baseHash: string | null;
}

export interface CondenseModuleResultInput {
  job: CondenseModuleJobPayload;
  /** The body of the agent's result file. */
  resultBody: string;
  docs: readonly IndexedDoc[];
  /** `overview.md` as it is now, or `undefined` when there is none. */
  existing: string | undefined;
  docLanguage: DocLanguage;
  now: DateLike;
}

export type CondenseModuleCheck =
  { kind: 'proposal'; proposal: CondenseProposal } | { kind: 'failed'; reason: string };

/** A ```json fence on its own line; the block ends at the next closing fence. */
const JSON_FENCE = /^```json[ \t]*\r?\n([\s\S]*?)^```/im;

export function condenseModuleJobPayload(
  docs: readonly IndexedDoc[],
  slug: string,
  overviewText: string | undefined,
): CondenseModuleJobPayload {
  return {
    slug,
    inputs: moduleInputs(docs, slug).map((input) => input.path),
    baseHash: overviewText === undefined ? null : sha256(overviewText),
  };
}

function failed(reason: string): CondenseModuleCheck {
  return { kind: 'failed', reason };
}

function replyIn(resultBody: string): Record<string, unknown> | string {
  const block = JSON_FENCE.exec(resultBody);
  if (block === null) return 'The result has no fenced json block.';
  let parsed: unknown;
  try {
    parsed = parseJsonLoose(block[1] ?? '');
  } catch {
    return 'The json block of the result does not parse.';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'The json block of the result is not an object.';
  }
  return parsed as Record<string, unknown>;
}

function problemReason(problem: AttributionProblem): string {
  return problem.reason === 'no-source'
    ? `The "${problem.section}" section has text but cites no page.`
    : `The "${problem.section}" section cites paths that are not handed-over pages of the ` +
        `module: ${problem.sources.join(', ')}.`;
}

function asCheck(result: ModuleReplyResult, existing: string | undefined): CondenseModuleCheck {
  if (result.kind === 'failed') return failed(result.reason);
  if (result.kind === 'attribution-failure') {
    return failed(result.problems.map(problemReason).join(' '));
  }
  // The same mapping the in-app run's proposal gets; a module reports no truncation.
  return {
    kind: 'proposal',
    proposal: {
      unit: 'module',
      slug: result.slug,
      path: result.path,
      baseHash: result.baseHash,
      before: existing ?? '',
      after: result.content,
      sources: [...result.sources],
    },
  };
}

export function validateCondenseModuleResult(
  input: CondenseModuleResultInput,
): CondenseModuleCheck {
  const { job, existing } = input;
  // Checked first: a diff against an overview that moved on would undo the human's edit.
  const currentHash = existing === undefined ? null : sha256(existing);
  if (currentHash !== job.baseHash) {
    return failed('overview.md changed since it was handed to the agent.');
  }

  const reply = replyIn(input.resultBody);
  if (typeof reply === 'string') return failed(reply);

  /* Only pages that were handed over and still belong to the module count as read: a
     page added later was never shown to the agent, so citing it fails and it is not
     recorded in sources. The hashes are today's, the ones the accept will stand on. */
  const handedOver = new Set(job.inputs);
  const inventory = moduleInputs(input.docs, job.slug).filter((page) => handedOver.has(page.path));
  if (inventory.length === 0) {
    return failed('None of the handed-over pages is still a page of the module.');
  }

  const result = proposalFromModuleReply({
    reply,
    inventory,
    docs: input.docs,
    slug: job.slug,
    existing,
    docLanguage: input.docLanguage,
    now: input.now,
    clampedChars: 0,
  });
  return asCheck(result, existing);
}
