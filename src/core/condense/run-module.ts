/**
 * The condensation run of one module's overview.
 *
 * `condenseProject()` in `./run-project` one level over, and deliberately its
 * mirror: same guard order, same result union, same "propose, never write". The
 * inputs are simpler — every wiki page of the module, read whole — and there is
 * **no heuristic fallback**: a concatenation of page excerpts presented as a
 * synthesis would assert knowledge nobody checked. Every way this run can fail to
 * produce a trustworthy artifact is its own typed result, and none of them
 * carries artifact content:
 *
 * - `no-model`   — nothing is routed to `condense-module`. Reads no input.
 * - `no-inputs`  — the module has no page besides its stub. No gateway call.
 * - `attribution-failure` — Guardrail 3, enforced in code by `./attribution`: a
 *   section citing a page that was not read, or claiming without a citation,
 *   fails the **whole** run.
 * - `failed`     — the gateway threw or the reply did not parse.
 *
 * Nothing here writes; the overview on disk stays byte-identical through every
 * refusal. A proposal carries no `partialInputs`: that note speaks of day entries,
 * and a module has none. What a prompt clamp cut is stated in the artifact
 * preamble instead, written from the run's own count, never asked of the model.
 */

import type { DocLanguage, TaskKind } from '@shared/types';
import {
  CONDENSE_MODULE_SCHEMA,
  condenseModulePrompt,
  isAbortError,
  parseJsonLoose,
  promptItemsClampedChars,
} from '@core/llm';
import type { CondenseModuleSourceItem, LlmGateway } from '@core/llm';
import type { IndexedDoc } from '@core/index/types';
import type { DateLike } from '@core/vault/paths';
import type { CondensedModuleSectionKind } from './artifact';
import type { AttributionProblem } from './attribution';
import { moduleInputs } from './inputs-module';
import { currentModuleArtifact, moduleTitleOf, proposalFromModuleReply } from './module-reply';

export { MODULE_OVERVIEW_TYPE } from './module-reply';

/** The one task kind this run needs. Named in the `no-model` result. */
export const CONDENSE_MODULE_TASK: TaskKind = 'condense-module';

export interface CondenseModuleDeps {
  /** The indexed docs — the same `readonly IndexedDoc[]` the selector takes. */
  docs: readonly IndexedDoc[];
  gateway: LlmGateway;
  /**
   * The existing `modules/<slug>/wiki/overview.md`, whole file, or `undefined` when
   * there is none. The caller reads it; this module has no filesystem.
   */
  existing?: string;
  /** Language the artifact is written in — the document language, not the UI one. */
  docLanguage?: DocLanguage;
  /** "Now" for `condensed_at`. Tests pass a fixed date. */
  now?: DateLike;
  signal?: AbortSignal;
}

/** A section whose citations did not survive the subset check, module level. */
export type CondenseModuleAttributionProblem = AttributionProblem<CondensedModuleSectionKind>;

export interface CondenseModuleProposal {
  kind: 'proposal';
  slug: string;
  /** `modules/<slug>/wiki/overview.md` — where the write puts `content`. */
  path: string;
  /** The whole file, frontmatter included, ready to be written unchanged. */
  content: string;
  /** ISO-8601 with offset; the same value stands in `content`'s frontmatter. */
  condensedAt: string;
  /**
   * sha256 of the overview as it was read, or `null` when none existed. The write
   * passes it as `expectedHash`, so a file that moved on in between gets a
   * `conflict` instead of an overwrite.
   */
  baseHash: string | null;
  /** Every page the run read — the same list as the artifact's `sources:`. */
  sources: readonly string[];
  /** The `source_hashes:` map that stands in `content`. */
  sourceHashes: Record<string, string>;
}

export interface CondenseModuleNoModel {
  kind: 'no-model';
  slug: string;
  /** Always `condense-module`: which routing entry is missing. */
  task: TaskKind;
}

export interface CondenseModuleNoInputs {
  kind: 'no-inputs';
  slug: string;
}

export interface CondenseModuleAttributionFailure {
  kind: 'attribution-failure';
  slug: string;
  problems: readonly CondenseModuleAttributionProblem[];
}

export interface CondenseModuleFailed {
  kind: 'failed';
  slug: string;
  /** Why the run could not complete. Never carries vault content (Guardrail 6). */
  reason: string;
}

export type CondenseModuleResult =
  | CondenseModuleProposal
  | CondenseModuleNoModel
  | CondenseModuleNoInputs
  | CondenseModuleAttributionFailure
  | CondenseModuleFailed;

/**
 * Condenses one module's pages into a proposed `modules/<slug>/wiki/overview.md`,
 * or says why it cannot. Writes nothing, ever.
 */
export async function condenseModule(
  deps: CondenseModuleDeps,
  slug: string,
): Promise<CondenseModuleResult> {
  // The guard comes before every read: without a model the run does not start at
  // all, and says which routing entry is missing (Guardrail 1).
  if (!deps.gateway.isAvailable(CONDENSE_MODULE_TASK)) {
    return { kind: 'no-model', slug, task: CONDENSE_MODULE_TASK };
  }

  const docLanguage = deps.docLanguage ?? 'de';
  const now = deps.now ?? new Date();
  /* One inventory serves the prompt, the citation check and the recorded hashes —
     the same list a later freshness check asks, so the three cannot disagree. */
  const inventory = moduleInputs(deps.docs, slug);
  if (inventory.length === 0) return { kind: 'no-inputs', slug };

  const byPath = new Map(deps.docs.map((doc) => [doc.path, doc]));
  const pages: CondenseModuleSourceItem[] = inventory.map((input) => ({
    path: input.path,
    text: byPath.get(input.path)?.body ?? '',
  }));

  const current = currentModuleArtifact(deps.existing);
  const moduleTitle = moduleTitleOf(deps.docs, slug);

  let reply: Record<string, unknown>;
  try {
    const result = await deps.gateway.complete({
      task: CONDENSE_MODULE_TASK,
      messages: condenseModulePrompt({ title: moduleTitle, slug, current, pages }, docLanguage),
      schema: CONDENSE_MODULE_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    reply = parseJsonLoose<Record<string, unknown>>(result.text);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { kind: 'failed', slug, reason: reasonOf(error) };
  }

  return proposalFromModuleReply({
    reply,
    inventory,
    docs: deps.docs,
    slug,
    existing: deps.existing,
    docLanguage,
    now,
    clampedChars: promptItemsClampedChars(pages),
  });
}

/** An error's message, without ever quoting vault content back (Guardrail 6). */
function reasonOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error.';
}
