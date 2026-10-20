/* Type declaration for artifacts.mjs — the scripts folder is not in
   tsconfig.node.json's include. The signatures must match the implementation
   exactly; no any. */

/** Setup exe, its blockmap, portable exe, latest.yml — in that order. */
export declare function expectedAssets(version: string): string[];

/** Full paths of the expected assets; throws naming each missing file, or a mismatched latest.yml path. */
export declare function collectAssets(dir: string, version: string): string[];
