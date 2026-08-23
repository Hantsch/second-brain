/* The llama.cpp engine fetch itself (033, D6): archives in, an installed
 * engine out. `llamacpp-install.ts` owns the channels, the plan and the cancel
 * map; this module owns the one run and the invariant the story turns on —
 * **a cancelled or failed run leaves nothing a later `status` calls installed.**
 *
 * Four rules carry that, and they are the reason this run is not just a loop
 * over `fetch`:
 *
 * - **Everything half-written lives in a staging root** that is a sibling of
 *   the target directory (`paths.ts` explains the layout). `status` only looks
 *   at the target directory, so mid-run there is nothing there for it to see.
 * - **Only a full success promotes.** The extracted tree is renamed into the
 *   target directory as the very last step, after the binary has been found and
 *   made executable — a rename, so the target directory never holds half an
 *   engine.
 * - **Cancel and failure remove the staging root *before* the closing event**,
 *   not in a `finally` after it: the renderer may call `llm:localRuntimeStatus`
 *   the moment it sees `done: true`, and that call has to already find nothing.
 * - **Cancellation is checked between the steps**, not only inside the fetch:
 *   an abort arriving while an archive is being extracted must not be followed
 *   by a promote.
 *
 * The Windows CUDA build's `cudart-*` companion is fetched in the same run and
 * counted into the same progress, so the user sees one bar rather than two.
 * Extraction reports no progress: `event:install-progress` counts downloaded
 * megabytes, and giving that number a second meaning would be worse than a bar
 * that sits at full for a moment.
 *
 * No shell string anywhere (019c's guardrail) — extraction goes through the
 * pure-JS extractors in `unzip.ts` (Windows' ZIPs) and `untar.ts` (macOS' and
 * Linux' gzipped tarballs), picked per archive from the descriptor's
 * `archiveFormat`. Nothing here touches `child_process`.
 */

import * as path from 'node:path';
import { archiveFormatOf } from '@core/llm';
import type { ArchiveFormat, EngineAssetDescriptor } from '@core/llm';
import { LLAMACPP_RELEASE_TAG } from '@core/llm';
import type { EngineBuildId } from '@shared/types';
import type { FetchFn } from '../ollama-install';
import { contentLengthMb, wholeMb } from '../ollama-install';
import { fail, toIpcError } from '../registry';
import type { EngineFs } from './engine-fs';
import {
  engineBinaryName,
  engineStagingRoot,
  stagingArchivesDir,
  stagingDisplacedDir,
  stagingUnpackDir,
} from './paths';
import type { ExtractTarFn } from './untar';
import type { ExtractZipFn } from './unzip';
import { applyExecutableBit, locateExtractedBinary } from './unzip';

/** Download base for the release tag pinned in `descriptors.ts`. The URL lives
    here and not in that table for the same reason `ollama-install.ts` keeps its
    URLs out of `runtime-plan.ts`: core stays pure and never knows a URL — the
    asset *file names* it does know are just data. Redirects are followed, so
    the repository's rename history does not matter. */
const RELEASE_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMACPP_RELEASE_TAG}`;

/** What one run needs to know about this machine — resolved once by
    `llamacpp-install.ts`, never re-derived here. */
export interface EngineFetchInput {
  platform: string;
  build: EngineBuildId;
  userDataDir: string;
  targetDir: string;
  asset: EngineAssetDescriptor;
}

export interface EngineFetchIo {
  fetchImpl: FetchFn;
  fs: EngineFs;
  /** One extractor per archive format — which one runs is decided per
      archive, not per platform, so a ZIP companion next to a tarball main
      archive would still unpack correctly. */
  extractZip: ExtractZipFn;
  extractTar: ExtractTarFn;
  /** Staging-directory token — a UUID in production, fixed in tests. */
  token: () => string;
}

/** The progress callback, in `event:install-progress`'s own terms. */
export type SendProgress = (
  downloadedMb: number,
  totalMb: number,
  done: boolean,
  error?: string,
) => void;

/** One archive to fetch: the main one plus, on the Windows CUDA build, its
    `cudart-*` companion — both counted into one progress, each unpacked by
    the extractor its own format needs. */
interface PlannedArchive {
  name: string;
  sizeMb: number;
  format: ArchiveFormat;
}

function plannedArchives(asset: EngineAssetDescriptor): PlannedArchive[] {
  const main = asset.assetName;
  // A descriptor with no asset name is a table entry that names no download —
  // reported, never guessed at from the platform.
  if (main === undefined) throw fail('invalid', 'für diese Plattform ist kein Archiv bekannt');
  return [
    { name: main, sizeMb: asset.sizeMb, format: archiveFormatOf(asset) },
    ...(asset.extraArchives ?? []).map((extra) => ({
      name: extra.name,
      sizeMb: extra.sizeMb,
      format: archiveFormatOf(extra),
    })),
  ];
}

/** Called between the steps of a run; an abort there ends the run exactly like
    an abort inside the fetch does. */
function ensureNotCancelled(controller: AbortController): void {
  if (controller.signal.aborted) throw fail('cancelled', 'abgebrochen');
}

/** Streams one archive to `target`. Throws on any failure — the caller owns
    cleanup, since everything written lives under its staging root. */
async function streamArchive(
  url: string,
  target: string,
  controller: AbortController,
  io: EngineFetchIo,
  onSizeMb: (mb: number) => void,
  onBytes: (bytes: number) => void,
): Promise<void> {
  const response = await io.fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
  if (!response.ok) throw fail('io', `Download fehlgeschlagen: HTTP ${response.status}`);
  // The host's own figure beats the descriptor's estimate for this archive, so
  // the combined total sharpens as each archive starts.
  const measured = contentLengthMb(response);
  if (measured !== null) onSizeMb(measured);
  const body = response.body;
  if (!body) throw fail('io', 'die Antwort enthielt keinen Inhalt');

  const sink = io.fs.createSink(target);
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await sink.write(value);
      onBytes(value.byteLength);
    }
  } catch (error) {
    /* Closed before the staging root is removed: deleting a file whose write
       handle is still open leaves it present on Windows — the same ordering
       `ollama-install.ts` enforces for its single installer file. */
    await sink.close().catch(() => undefined);
    throw error;
  }
  await sink.close();
}

/**
 * The extracted tree goes live. An engine already installed (a reinstall) is
 * moved *aside* into the staging root first rather than deleted, so a failing
 * rename can put it back and a succeeding one lets the old one die with the
 * staging root — there is no moment in which neither engine exists.
 */
async function promote(
  engineFs: EngineFs,
  engineDir: string,
  targetDir: string,
  stagingRoot: string,
): Promise<void> {
  const displaced = stagingDisplacedDir(stagingRoot);
  const hadPrevious = await engineFs.exists(targetDir);
  if (hadPrevious) await engineFs.rename(targetDir, displaced);
  try {
    await engineFs.rename(engineDir, targetDir);
  } catch (error) {
    if (hadPrevious) await engineFs.rename(displaced, targetDir).catch(() => undefined);
    throw error;
  }
}

/**
 * Downloads, extracts and promotes — the whole install. Resolves once the run
 * has ended one way or another; never rejects, exactly like
 * `ollama-install.ts`'s `runDownload`: every outcome is reported through `send`,
 * and the staging root is gone before that closing event goes out.
 */
export async function runEngineFetch(
  input: EngineFetchInput,
  controller: AbortController,
  io: EngineFetchIo,
  send: SendProgress,
): Promise<void> {
  const stagingRoot = engineStagingRoot(input.userDataDir, input.asset.targetSubdir, io.token());
  const unpackDir = stagingUnpackDir(stagingRoot);
  /* Per-archive expected sizes, sharpened to the real `Content-Length` as each
     archive starts; their sum is the one total the progress reports against. */
  let sizes: number[] = [];
  const totalMb = (): number => sizes.reduce((sum, size) => sum + size, 0);
  let downloadedBytes = 0;
  let lastReportedMb = -1;

  try {
    // Inside the `try`: an unknown platform/build combination has to end as a
    // reported failure, not as an unhandled rejection of this background run.
    const archives = plannedArchives(input.asset);
    sizes = archives.map((archive) => archive.sizeMb);
    await io.fs.mkdir(stagingArchivesDir(stagingRoot));
    await io.fs.mkdir(unpackDir);
    // The target's parent has to exist for the promoting rename below.
    await io.fs.mkdir(path.dirname(input.targetDir));

    const staged: { path: string; format: ArchiveFormat }[] = [];
    for (const [index, archive] of archives.entries()) {
      const target = path.join(stagingArchivesDir(stagingRoot), archive.name);
      await streamArchive(
        `${RELEASE_BASE}/${archive.name}`,
        target,
        controller,
        io,
        (mb) => {
          sizes[index] = mb;
        },
        (bytes) => {
          downloadedBytes += bytes;
          const downloadedMb = wholeMb(downloadedBytes);
          // One event per whole megabyte crossed, across all archives — a chunk
          // is far smaller than a megabyte, so this still reports several times
          // a second without spamming the renderer.
          if (downloadedMb !== lastReportedMb) {
            lastReportedMb = downloadedMb;
            send(downloadedMb, totalMb(), false);
          }
        },
      );
      staged.push({ path: target, format: archive.format });
    }

    // Both archives extract into the same directory: the CUDA companion's
    // runtime DLLs belong next to the binary, not in a folder of their own.
    for (const archive of staged) {
      ensureNotCancelled(controller);
      const extract = archive.format === 'tar.gz' ? io.extractTar : io.extractZip;
      await extract(archive.path, unpackDir);
    }

    ensureNotCancelled(controller);
    const binary = await locateExtractedBinary(io.fs, unpackDir, engineBinaryName(input.platform));
    if (binary === null) throw fail('io', 'im Archiv war keine startbare Engine enthalten');
    await applyExecutableBit(io.fs, binary, input.platform);

    ensureNotCancelled(controller);
    // The directory the binary was found in is what goes live, so the target
    // directory is flat whatever nesting the archive used.
    await promote(io.fs, path.dirname(binary), input.targetDir, stagingRoot);
    await io.fs.removeDir(stagingRoot).catch(() => undefined);
    send(wholeMb(downloadedBytes), totalMb(), true);
  } catch (error) {
    /* Before the closing event, never after: a `status` call triggered by
       `done: true` must already find no staging root and nothing this run
       created in the target directory. */
    await io.fs.removeDir(stagingRoot).catch(() => undefined);
    send(0, totalMb(), true, toIpcError(error).code);
  }
}
