/**
 * Which heading a filing action lands under.
 *
 * Two questions live here, and they belong together because they must agree:
 * the proposal asks "which sections may this target have?" — before any target
 * file has been read — and the write asks "which heading does this block
 * actually go under?", with the file in hand.
 *
 * Answering the second from the first alone is what grew a second "## Notizen"
 * beside a user's "## Notes": the proposal is built from the index, and the
 * index can be stale (deleted, half rebuilt, or simply older than the user's
 * last edit in Obsidian). So the heading is resolved **twice** on purpose. The
 * proposal's answer is a preview; `resolveSection` is the one the write uses,
 * and it looks at the body that was just read. The file's word beats the
 * setting (docs/VAULT-FORMAT.md).
 *
 * A file next to `actions.ts` rather than inside it: `actions.ts` imports
 * `filingBlock` from `filing.ts`, and `filing.ts` needs this resolver too — a
 * shared home below both keeps that from becoming an import cycle.
 */

import type { DocLanguage, FilingAction, FilingTarget } from '@shared/types';
import { sectionHeadingIn, sectionKindOf, sectionNameFor } from '@core/vault/section-names';
import type { SectionKind } from '@core/vault/section-names';

/** Which section kinds a target allows. The first one is its default. */
const TARGET_SECTIONS: Record<FilingTarget, readonly SectionKind[]> = {
  project: ['notes', 'state', 'todos'],
  area: ['notes', 'todos'],
  module: ['notes'],
  journal: ['day', 'facts'],
  'new-project': ['state'],
  inbox: [],
};

/**
 * The section a proposal names for a target: the wanted one if the target allows
 * it, otherwise the target's default. `null` for a target that writes no section
 * at all (`inbox`).
 *
 * A wanted heading is matched by **kind**, not by spelling — a model that answers
 * "Notes" for a German vault means the notes section, not a new one next to it.
 */
export function sectionFor(
  target: FilingTarget,
  wanted: string | null,
  docLanguage: DocLanguage = 'de',
): string | null {
  const allowed = TARGET_SECTIONS[target];
  const fallback = allowed[0];
  if (fallback === undefined) return null;
  const wantedKind = wanted === null ? null : sectionKindOf(wanted);
  const kind = wantedKind !== null && allowed.includes(wantedKind) ? wantedKind : fallback;
  return sectionNameFor(kind, docLanguage);
}

/**
 * The heading this action's block is appended under, resolved against the body of
 * the target file **as it was just read**.
 *
 * What carries over from the action is the *kind* of section it names, not its
 * spelling: if the file already has a heading of that kind — in either language,
 * matched folded — the block joins it, whatever the setting says. Only a file
 * without one gets the document language's word. A named section that is no known
 * kind falls back to `fallback`, exactly like no section at all: no screen lets
 * the user type a heading, so an unknown one can only be tampered or
 * model-invented input — and writing it literally would let that input grow a
 * heading of its own in the user's file.
 */
export function resolveSection(
  body: string,
  action: Pick<FilingAction, 'section'>,
  fallback: SectionKind,
  docLanguage: DocLanguage = 'de',
): string {
  const named = action.section?.trim() ?? '';
  const kind = named.length === 0 ? null : sectionKindOf(named);
  return sectionHeadingIn(body, kind ?? fallback, docLanguage);
}
