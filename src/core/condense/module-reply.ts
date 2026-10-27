/**
 * Composing a module overview proposal from a reply that is already parsed. The
 * in-app run (`condenseModule()`) and an agent's condensation result both come
 * through here, so the attribution check and the artifact an agent result turns
 * into are the very ones an in-app run applies — not a second copy (story 092).
 *
 * The caller decides the inventory: the in-app run passes what it put into the
 * prompt, the agent path the pages it handed over. Whatever is passed is exactly
 * the set a citation may name and the set `sources:` / `source_hashes:` record.
 */

import type { DocLanguage } from '@shared/types';
import type { IndexedDoc } from '@core/index/types';
import { isoStamp } from '@core/ingest/raw';
import { phrases } from '@core/wiki/text';
import { sha256 } from '@core/vault/hash';
import type { DateLike } from '@core/vault/paths';
import { composeArtifact, emptyArtifact, MODULE_SECTIONS, parseArtifact } from './artifact';
import type { CondensedModuleArtifact } from './artifact';
import { attributionProblems, readReplySections } from './attribution';
import type { CondenseInput } from './inputs';
import { preambleWithoutNotice, promptClampNotice } from './notice';
import { moduleOverviewPath } from './paths';
import { sourceHashesOf } from './sources';
import type {
  CondenseModuleAttributionFailure,
  CondenseModuleFailed,
  CondenseModuleProposal,
} from './run-module';

/** The `type:` of the file this run writes: a module overview is a wiki page. */
export const MODULE_OVERVIEW_TYPE = 'overview';

export interface ModuleReplyInput {
  /** The reply, already parsed; its shape is still unchecked. */
  reply: Record<string, unknown>;
  /** The pages that count as read — the only ones a section may cite. */
  inventory: readonly CondenseInput[];
  docs: readonly IndexedDoc[];
  slug: string;
  /** The overview on disk as it was read, or `undefined` when there is none. */
  existing: string | undefined;
  docLanguage: DocLanguage;
  now: DateLike;
  /** Characters the prompt clamp cut; stated in the preamble when non-zero. */
  clampedChars: number;
}

export type ModuleReplyResult =
  CondenseModuleProposal | CondenseModuleAttributionFailure | CondenseModuleFailed;

/** The module's own title (`module.md`), else its slug. */
export function moduleTitleOf(docs: readonly IndexedDoc[], slug: string): string {
  const file = docs.find((doc) => doc.path === `modules/${slug}/module.md`);
  return file !== undefined && file.title.length > 0 ? file.title : slug;
}

/** The overview on disk as an artifact, or an empty one when there is none yet. */
export function currentModuleArtifact(existing: string | undefined): CondensedModuleArtifact {
  return existing === undefined
    ? emptyArtifact(MODULE_SECTIONS)
    : parseArtifact(existing, MODULE_SECTIONS);
}

/** The proposal a reply makes, or why it cannot make one. Writes nothing. */
export function proposalFromModuleReply(input: ModuleReplyInput): ModuleReplyResult {
  const { reply, inventory, slug, docLanguage, now } = input;
  const paths = inventory.map((entry) => entry.path);
  const current = currentModuleArtifact(input.existing);
  const moduleTitle = moduleTitleOf(input.docs, slug);

  const read = readReplySections(reply, MODULE_SECTIONS);
  if ('missing' in read) {
    return { kind: 'failed', slug, reason: `The reply has no usable "${read.missing}" section.` };
  }

  const problems = attributionProblems(read.sections, MODULE_SECTIONS, paths);
  if (problems.length > 0) return { kind: 'attribution-failure', slug, problems };

  const condensedAt = isoStamp(now);
  const sourceHashes = sourceHashesOf(inventory);
  const notice = promptClampNotice(input.clampedChars, docLanguage);
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
    baseHash: input.existing === undefined ? null : sha256(input.existing),
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
