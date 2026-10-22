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
import { isoStamp } from '@core/ingest/raw';
import { phrases } from '@core/wiki/text';
import { sha256 } from '@core/vault/hash';
import type { DateLike } from '@core/vault/paths';
import { composeArtifact, emptyArtifact, MODULE_SECTIONS, parseArtifact } from './artifact';
import type { CondensedModuleArtifact, CondensedModuleSectionKind } from './artifact';
import { attributionProblems, readReplySections } from './attribution';
import type { AttributionProblem } from './attribution';
import { moduleInputs } from './inputs-module';
import { preambleWithoutNotice, promptClampNotice } from './notice';
import { moduleOverviewPath } from './paths';
import { sourceHashesOf } from './sources';

/** The one task kind this run needs. Named in the `no-model` result. */
export const CONDENSE_MODULE_TASK: TaskKind = 'condense-module';

/** The `type:` of the file this run writes: a module overview is a wiki page. */
export const MODULE_OVERVIEW_TYPE = 'overview';

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

/** The module's own title (`module.md`), else its slug. */
function moduleTitleOf(docs: readonly IndexedDoc[], slug: string): string {
  const file = docs.find((doc) => doc.path === `modules/${slug}/module.md`);
  return file !== undefined && file.title.length > 0 ? file.title : slug;
}

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
  const paths = inventory.map((input) => input.path);

  const current: CondensedModuleArtifact =
    deps.existing === undefined
      ? emptyArtifact(MODULE_SECTIONS)
      : parseArtifact(deps.existing, MODULE_SECTIONS);
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

  const read = readReplySections(reply, MODULE_SECTIONS);
  if ('missing' in read) {
    return { kind: 'failed', slug, reason: `The reply has no usable "${read.missing}" section.` };
  }

  const problems = attributionProblems(read.sections, MODULE_SECTIONS, paths);
  if (problems.length > 0) return { kind: 'attribution-failure', slug, problems };

  const condensedAt = isoStamp(now);
  const sourceHashes = sourceHashesOf(inventory);
  const notice = promptClampNotice(promptItemsClampedChars(pages), docLanguage);
  const base = carriedOver(current);
  const kept = preambleWithoutNotice(base.preamble);
  const artifact: CondensedModuleArtifact = {
    ...base,
    // An overview that already has a title keeps it: the human may have renamed it.
    title:
      current.title.length > 0
        ? current.title
        : `${moduleTitle} — ${phrases(docLanguage).synthesis}`,
    condensedAt,
    sources: paths,
    sourceHashes,
    sections: read.sections,
    preamble: [notice, kept].filter((part) => part.length > 0).join('\n\n'),
  };

  return {
    kind: 'proposal',
    slug,
    path: moduleOverviewPath(slug),
    content: composeArtifact(artifact, MODULE_SECTIONS, docLanguage, MODULE_OVERVIEW_TYPE),
    condensedAt,
    baseHash: deps.existing === undefined ? null : sha256(deps.existing),
    sources: paths,
    sourceHashes,
  };
}

/**
 * What of the overview on disk a proposal carries forward. An overview without
 * `condensed_at` was never condensed: it is the legacy bullet-list page (or the
 * creation stub) this run replaces whole, so its preamble and foreign sections —
 * the old `## Seiten` list among them — are not hand-added text to keep. Its
 * unknown frontmatter keys and its directives belong to the human and survive.
 * Once `condensed_at` is set, `./artifact`'s lossless carry-through applies in
 * full. Module level only: area and project runs never take this step, so their
 * hand-added sections are kept unconditionally. (story 082)
 */
function carriedOver(current: CondensedModuleArtifact): CondensedModuleArtifact {
  if (current.condensedAt.length > 0) return current;
  return { ...current, preamble: '', extraSections: [] };
}

/** An error's message, without ever quoting vault content back (Guardrail 6). */
function reasonOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error.';
}
