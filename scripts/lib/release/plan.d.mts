/* Type declaration for plan.mjs — the scripts folder is not in
   tsconfig.node.json's include. The signatures must match the implementation
   exactly; no any. */

import type { Bump } from './version.mjs';

export type ReleaseRefusalKind =
  | 'nothing-pending'
  | 'tag-exists'
  | 'outside-ci'
  | 'bad-version'
  | 'bad-bump';

export declare class ReleaseRefused extends Error {
  kind: ReleaseRefusalKind;
  reason: string;
  constructor(kind: ReleaseRefusalKind, reason: string);
}

export interface ReleaseWrite {
  path: string;
  content: string;
}

/** argv-style command, never a shell string. */
export interface ReleaseCommand {
  cmd: string;
  args: string[];
}

export interface PlanInput {
  changelogText: string;
  pkgText: string;
  lockText: string;
  /** Existing tag names. */
  tags: string[];
  /** Explicit version without leading `v`; beats `bump`, which beats the derived bump. */
  requestedVersion?: string;
  bump?: Bump;
  dryRun: boolean;
  isCi: boolean;
  /** YYYY-MM-DD stamped on the promoted section. */
  today: string;
  /** Path the runner writes `notes` to before the gh call; defaults to the literal `<notes-file>`. */
  notesPath?: string;
  /** Asset paths for gh; defaults to the bare `expectedAssets(version)` file names. */
  assets?: string[];
}

export interface ReleasePlan {
  version: string;
  tag: string;
  notes: string;
  prerelease: boolean;
  writes: ReleaseWrite[];
  /** Empty in a dry run. */
  commands: ReleaseCommand[];
}

export declare function planRelease(input: PlanInput): ReleasePlan;
