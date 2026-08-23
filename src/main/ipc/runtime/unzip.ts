/* Unpacking a downloaded ZIP engine archive (033, D6): extraction, finding the
 * binary in whatever layout the release used, and the POSIX exec bit. The last
 * two are format-independent and serve `untar.ts` (macOS' and Linux' gzipped
 * tarballs) just as well — only the extraction itself is ZIP-specific.
 *
 * `extract-zip` is yauzl-based, pure JavaScript, and reads the archive from
 * disk entry by entry into write streams — no native module, and no
 * in-memory buffering of an archive that is hundreds of megabytes. Above all
 * **no shell string**: 019c's guardrail forbids constructing a command line
 * for `tar`/`unzip`/`Expand-Archive`, and this file is the reason none is
 * needed. Nothing here ever touches `child_process`.
 *
 * Every filesystem effect goes through an injected seam (`ExtractZipFn`,
 * `UnzipFs`), so the install's tests cover the staging discipline without a
 * real archive or a real disk.
 */

import * as path from 'node:path';
import extractZip from 'extract-zip';

/** Extract `zipPath` into `targetDir`. The seam the install injects — the real
    one below, a fake in tests. */
export type ExtractZipFn = (zipPath: string, targetDir: string) => Promise<void>;

/** The real extraction. `extract-zip` requires an absolute `dir`, and creates
    it (and every entry's parent) itself. */
export const nodeExtractZip: ExtractZipFn = (zipPath, targetDir) =>
  extractZip(zipPath, { dir: path.resolve(targetDir) });

/** One directory entry, reduced to what locating a binary needs. */
export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

/** The two filesystem operations this module needs. Kept separate from the
    installer's larger `EngineFs` so this module stays independently usable —
    the installer's seam simply includes these two. */
export interface UnzipFs {
  /** Entries of `dir`. A directory that doesn't exist yields an empty list
      rather than throwing: "nothing here" is a valid answer while walking. */
  list(dir: string): Promise<readonly DirEntry[]>;
  chmod(target: string, mode: number): Promise<void>;
}

/** `rwxr-xr-x` — owner writable, everyone able to execute. What a release
    archive's executable bit should have been, restored explicitly because ZIP
    does not carry POSIX permissions reliably. A tarball does, but re-applying
    the mode there is harmless and keeps one code path for both formats. */
export const EXECUTABLE_MODE = 0o755;

/** How deep to look for the binary below the extraction root. llama.cpp's
    archives put the binaries either at the root (Windows) or under
    `build/bin/` (Linux, macOS); three levels covers both with room to spare
    without walking a whole tree. */
const MAX_BINARY_SEARCH_DEPTH = 3;

/**
 * Finds `binaryName` in the extracted tree, breadth-first, so the shallowest
 * match wins. Returns `null` when the archive contained no such file — which
 * the installer treats as a failed install rather than promoting a directory
 * with no engine in it.
 *
 * Breadth-first, not a fixed expected path, because the layout differs per
 * release archive and hardcoding one would turn a bumped release tag into a
 * silent install of an unusable directory.
 */
export async function locateExtractedBinary(
  fs: UnzipFs,
  root: string,
  binaryName: string,
  maxDepth: number = MAX_BINARY_SEARCH_DEPTH,
): Promise<string | null> {
  let level = [root];
  for (let depth = 0; depth <= maxDepth && level.length > 0; depth += 1) {
    const next: string[] = [];
    for (const dir of level) {
      const entries = await fs.list(dir);
      for (const entry of entries) {
        if (!entry.isDirectory && entry.name === binaryName) return path.join(dir, entry.name);
        if (entry.isDirectory) next.push(path.join(dir, entry.name));
      }
    }
    level = next;
  }
  return null;
}

/**
 * Gives the extracted binary its exec bit on POSIX. A no-op on Windows, where
 * executability is not a file mode — calling `chmod` there would be a lie in
 * the trace and, on some filesystems, an error.
 *
 * Deliberately not swallowing failures: a binary that cannot be made
 * executable is not an installed engine, so the caller aborts the install and
 * cleans up rather than promoting something the user can never start.
 */
export async function applyExecutableBit(
  fs: UnzipFs,
  binaryPath: string,
  platform: string,
): Promise<void> {
  if (platform === 'win32') return;
  await fs.chmod(binaryPath, EXECUTABLE_MODE);
}
