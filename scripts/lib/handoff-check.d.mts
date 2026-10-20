/* Type declaration for handoff-check.mjs — the scripts folder is not in
   tsconfig.node.json's include, so an import from a test would otherwise
   have no type information. The signature must match the implementation
   exactly; no any. */

export declare function checkHandoffContents(
  paths: string[],
  options: { version: string },
): string[];

export declare function checkBundleContents(paths: string[]): string[];
