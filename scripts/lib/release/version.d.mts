/* Type declaration for version.mjs — the scripts folder is not in
   tsconfig.node.json's include. The signatures must match the implementation
   exactly; no any. */

export type Bump = 'major' | 'minor' | 'patch';

export declare function isValidVersion(v: string): boolean;

export declare function isPrerelease(v: string): boolean;

export declare function deriveBump(categories: string[], bullets: string[]): Bump;

export declare function nextVersion(
  current: string,
  bump: Bump,
  options?: { explicit?: boolean },
): string;

export declare function applyVersion(
  pkgText: string,
  lockText: string,
  version: string,
): { pkgText: string; lockText: string };
