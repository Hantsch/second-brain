/* Where a runtime's engine and its model files live on disk (033, D6), as pure
 * path arithmetic — no `fs`, no Electron, no side effect. `<userData>` is passed
 * in rather than read from `app.getPath('userData')` here, so every path in this
 * module is testable with a fixed base and the one place that asks Electron for
 * the real base is the installer itself.
 *
 * The staging discipline this module encodes is what makes "a cancelled or
 * failed fetch leaves no partial engine" (AC 3) true by construction:
 *
 *   <userData>/runtimes/llamacpp                     the installed engine
 *   <userData>/runtimes/.llamacpp-staging-<token>/   everything half-written
 *       archives/                                    the downloaded archives
 *       engine/                                      the extracted tree
 *       previous/                                    the engine being replaced
 *
 * Three properties matter, and all three follow from the layout above:
 *
 * - **Nothing partial is ever inside the target directory.** The staging root
 *   is a *sibling* of the target, so `status` — which only ever looks at the
 *   target — cannot see a half-written engine even mid-download.
 * - **The staging root is a sibling, not a temp-dir path**, so promoting the
 *   extracted tree is a rename within one directory, hence within one volume:
 *   `fs.rename` across volumes fails with `EXDEV`, and a copy-then-delete
 *   fallback would give up atomicity exactly where it is needed.
 * - **A leftover staging root can never be mistaken for the engine.** It is
 *   dot-prefixed and carries a random token, so even a staging root abandoned
 *   by a hard kill of the app is neither the target path nor a name any lookup
 *   in this module produces.
 */

import * as path from 'node:path';

/** Model files (D7's half of the story) — named here because it is the same
    "a place the app owns, outside the vault" rule (AC 6) and `RuntimePlan`'s
    `modelDirHint` has to report it. */
export const GGUF_MODEL_SUBDIR = 'models/gguf';

/** `<userData>/<subdir>` for a `/`-separated descriptor subdir (`targetSubdir`
    from `core/llm/runtime/descriptors.ts`), rebuilt with the platform's own
    separator. */
export function engineTargetDir(userDataDir: string, targetSubdir: string): string {
  return path.join(userDataDir, ...targetSubdir.split('/'));
}

/** Where model files land — `<userData>/models/gguf`. */
export function ggufModelDir(userDataDir: string): string {
  return engineTargetDir(userDataDir, GGUF_MODEL_SUBDIR);
}

/**
 * The staging root for one install run: a dot-prefixed sibling of the target
 * directory carrying `token` (a UUID in production). Two concurrent runs
 * therefore never share a staging root, and no run can collide with the
 * installed engine — see the module comment for why both matter.
 */
export function engineStagingRoot(
  userDataDir: string,
  targetSubdir: string,
  token: string,
): string {
  const target = engineTargetDir(userDataDir, targetSubdir);
  return path.join(path.dirname(target), `.${path.basename(target)}-staging-${token}`);
}

/** Downloaded archives, inside the staging root — so removing that one
    directory removes the partial downloads too, and nothing has to remember a
    second cleanup path. */
export function stagingArchivesDir(stagingRoot: string): string {
  return path.join(stagingRoot, 'archives');
}

/** Where the archives are extracted to. Promoted into the target directory on
    success; deleted with the staging root on cancel or failure. */
export function stagingUnpackDir(stagingRoot: string): string {
  return path.join(stagingRoot, 'engine');
}

/** Where an already-installed engine is moved *aside* to just before the new
    one is renamed into place, instead of being deleted first: if that rename
    fails, the old engine can be moved back, and if it succeeds the old one goes
    away with the staging root. No window in which neither exists. */
export function stagingDisplacedDir(stagingRoot: string): string {
  return path.join(stagingRoot, 'previous');
}

/** The `llama-server` executable's file name for a platform. */
export function engineBinaryName(platform: string): string {
  return platform === 'win32' ? 'llama-server.exe' : 'llama-server';
}

/** The engine binary inside a directory that holds an engine — the installed
    target directory, or the extracted tree still in staging. Flat on purpose:
    the install promotes *the directory the binary was found in*, so after a
    successful install the binary always sits directly in the target directory,
    whatever nesting the release archive happened to use. */
export function engineBinaryPath(engineDir: string, platform: string): string {
  return path.join(engineDir, engineBinaryName(platform));
}
