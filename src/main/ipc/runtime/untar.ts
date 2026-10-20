/* Unpacking a downloaded `.tar.gz` engine archive — `unzip.ts`'s counterpart
 * for the platforms llama.cpp does *not* ship ZIPs for. macOS and Linux
 * releases are gzipped tarballs, and `extract-zip` cannot open one, so
 * without this module the engine fetch was functional on Windows only.
 *
 * `tar` (node-tar) is pure JavaScript, streams the archive from disk entry by
 * entry, and needs no native module — the same three properties that made
 * `extract-zip` the right choice for the ZIP side. Above all **no shell
 * string**: 019c's guardrail forbids constructing a `tar -xzf ...` command
 * line, and this file is the reason none is needed. Nothing here touches
 * `child_process`.
 *
 * The extractor is injected as a seam (`ExtractTarFn`) exactly like the ZIP
 * one, so the install's tests cover the staging discipline without a real
 * archive. Finding the binary in the extracted tree and setting its exec bit
 * are format-independent and stay in `unzip.ts` — this module only unpacks.
 */

import * as path from 'node:path';
import { extract } from 'tar';

/** Extract `tarPath` into `targetDir`. Deliberately the same shape as
    `unzip.ts`'s `ExtractZipFn`, so the fetch can pick one or the other by the
    descriptor's `archiveFormat` and call it identically. */
export type ExtractTarFn = (tarPath: string, targetDir: string) => Promise<void>;

/**
 * The real extraction. `cwd` must exist — the fetch creates its unpack
 * directory before extracting into it — and every entry's own parent
 * directory is created by `tar` itself.
 *
 * Entry paths are not sanitised here because node-tar already refuses to
 * write outside `cwd` by default (absolute paths are stripped, `..` segments
 * are dropped); `preservePaths` stays off, which is what makes that true.
 */
export const nodeExtractTar: ExtractTarFn = (tarPath, targetDir) =>
  extract({ file: tarPath, cwd: path.resolve(targetDir) });
