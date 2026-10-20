/**
 * The accepted document of a condensation proposal (story 038, D3).
 *
 * There is deliberately no assembly here. `condenseArea()` (`./run`) already
 * composes the **whole** file — it parses the artifact on disk, spreads it
 * (`...current`) into the new `CondensedArtifact` and hands the result to
 * `composeCondensedArtifact()`. That spread is what carries the human-owned
 * `directives` section, unknown frontmatter fields (`extraFrontmatter`) and
 * foreign `##` sections (`extraSections`) through the rewrite untouched; the
 * run only replaces `title`, `condensed_at`, `sources` and the three machine
 * sections. Rebuilding the document a second time at accept time would mean a
 * second place that has to know that rule — and a second place it can quietly
 * stop being true.
 *
 * So this module is a seam, not a step — but not one the IPC handler itself
 * calls: the wire `CondenseProposal` (`.after`) and the core
 * `CondenseAreaProposal` (`.content`) are different types on purpose (see
 * `condense.ts`'s own header comment), so `condense:accept` writes
 * `proposal.after` directly rather than constructing a `CondenseAreaProposal`
 * just to hand it to this function. What this module pins instead is the
 * contract itself — "the file to write is the proposal's content, unchanged"
 * — for the accept-path tests that exercise `run.ts`'s own proposal shape.
 * If that contract ever needs to change, it changes here, and every test that
 * pins it comes along.
 */

import type { CondenseAreaProposal } from './run';

/**
 * The file content to write when the human accepts `proposal` — the proposal's
 * own content, unchanged. Pure; writes nothing (the hash-guarded write is
 * `writeCondensedArea()` in `./write`).
 */
export function buildAcceptedDocument(proposal: CondenseAreaProposal): string {
  return proposal.content;
}
