/**
 * The two condensable levels (story 045): an area or a project. The five
 * `condense:*` channels take this discriminator instead of each level
 * duplicating its own set of channels.
 */
export type CondenseUnit = 'area' | 'project';

/**
 * The wire shape of a condensation proposal (story 038, D4).
 *
 * `@core/condense/run.ts`'s own `CondenseAreaProposal` (037) has `content` (the
 * proposed whole file) but not the existing file's text — the run only needs
 * the existing text to compute `baseHash`, never to hand it back. The renderer
 * (D5-D9) wants both sides of a diff, so this shape adapts at the IPC boundary
 * rather than widening the core type for a concern that is purely the shell's:
 * `before`/`after` instead of a bare `content`, so the diff view (`condense/diff.ts`)
 * has something to diff against without re-reading the file itself.
 */
export interface CondenseProposal {
  unit: CondenseUnit;
  slug: string;
  path: string;
  /** `null` when no artifact exists yet — mirrors `CondenseAreaProposal.baseHash`. */
  baseHash: string | null;
  /** The existing file's whole text, or '' when there is none yet (`baseHash === null`). */
  before: string;
  /** The proposed whole file text (037's `content`). */
  after: string;
  sources: string[];
  /** A human-readable truncation notice, or absent when nothing was left out. */
  partialInputs?: string;
}
