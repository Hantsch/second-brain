/* Filling llama.cpp's model directory from a Hugging Face file (033, D7) —
 * the second half of the story's "reuse the pull progress shape" acceptance
 * criterion, alongside `llamacpp-status.ts`'s server probe.
 *
 * Ollama's pull (`ollama-pull.ts`) reads an NDJSON stream from a runtime
 * that is already managing the model; there is no runtime to ask here — the
 * file comes straight off Hugging Face, so this is a plain streamed download
 * into `<userData>/models/gguf/`, closer in shape to `ollama-install.ts`'s
 * `runDownload` (and D6's `runEngineFetch`) than to `ollama-pull.ts`'s NDJSON
 * reader. What must stay identical regardless is `event:pull-progress`'s own
 * shape (`pullId`, `modelId`, `status`, `completed`, `total`, `done`,
 * `error?`) — `completed`/`total` here are raw bytes, exactly like Ollama's,
 * not the whole-megabyte counts `event:install-progress` uses.
 *
 * Three rules carry the acceptance criteria:
 *
 * - **The free-disk judgement runs before the first byte moves.** The same
 *   `planRuntimeDownload` (D1) the engine fetch uses, with `kind: 'model'`,
 *   so a file that would not fit is refused — never started — and the
 *   refusal carries the actual free-disk number rather than a vague message
 *   (mirrors D1's `insufficient-disk` `blockedReason` convention).
 * - **The file is never visible under its final name until it is whole.**
 *   Written to `<filename>.part` beside it and renamed into place only on a
 *   clean finish — a cancelled or failed download therefore never leaves a
 *   `.gguf` file a later listing could mistake for a complete model.
 * - **Cancel and failure both delete the partial file before the closing
 *   event.** Whichever way a pull stops short of success, `event:pull-
 *   progress`'s `done: true` must already find nothing left on disk.
 */

import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import { planRuntimeDownload } from '@core/llm';
import type { HfPullFile, RuntimeBlockedReason } from '@shared/types';
import type { FetchFn, WriteSink } from '../ollama-install';
import { fail, toIpcError } from '../registry';
import type { HandlerMap } from '../registry';
import { detectFreeDiskMb } from '../machine-scan';
import { createRuntimeRegistry, pullChannelHandlers } from './registry';
import type { RuntimeInstallerPart } from './types';
import type { EngineFs } from './engine-fs';
import { nodeEngineFs } from './engine-fs';
import { ggufModelDir } from './paths';
import type { Services } from '../../services';

/** Test seam: production reads the real platform, `userData`, the machine's
    free disk and the real filesystem; tests inject every one, so no test
    touches the network or the real disk. */
export interface LlamaCppPullDeps {
  platform?: string;
  userDataDir?: string;
  freeDiskMbFn?: (dir: string) => Promise<number | null>;
  fetchImpl?: FetchFn;
  fs?: EngineFs;
}

/** The tree entry's own path can nest inside a subdirectory
    (`Q4_K_M/model.gguf`); only the file name itself is meaningful once it
    lands flat in `models/gguf/`. */
function targetFileName(hfFile: HfPullFile): string {
  return path.basename(hfFile.path);
}

/** Bytes → whole megabytes, for the disk judgement only — the progress event
    itself reports raw bytes, matching `event:pull-progress`'s existing shape. */
function wholeMb(bytes: number): number {
  return Math.ceil(bytes / (1024 * 1024));
}

/**
 * Facts → judgement, via the same `planRuntimeDownload` the engine fetch
 * uses (`kind: 'model'`) — reusing D1's `insufficient-disk`/`no-write-
 * permission` vocabulary rather than inventing a second one for this fetch.
 */
async function judgeModelDownload(
  hfFile: HfPullFile,
  targetPath: string,
  modelDir: string,
  engineFs: EngineFs,
  deps: LlamaCppPullDeps,
): Promise<
  { ok: true } | { ok: false; blockedReason: RuntimeBlockedReason; freeDiskMb: number | null }
> {
  const platform = deps.platform ?? os.platform();
  const userDataDir = deps.userDataDir ?? app.getPath('userData');
  const freeDiskMb = await (deps.freeDiskMbFn ?? detectFreeDiskMb)(userDataDir);
  const downloadMb = hfFile.sizeBytes === null ? 0 : wholeMb(hfFile.sizeBytes);
  const plan = planRuntimeDownload({
    runtime: 'llamacpp',
    kind: 'model',
    platform,
    freeDiskMb,
    downloadMb,
    targetPath,
    writable: await engineFs.writable(modelDir),
    // A model file is meaningless on a platform with no engine at all, but
    // that is exactly what `'unsupported-platform'` from the engine's own
    // plan already covers — this judgement only ever needs to add the disk
    // and write checks on top of a platform the user has already reached
    // this screen from.
    assetAvailable: true,
  });
  if (plan.canDownload) return { ok: true };
  return { ok: false, blockedReason: plan.blockedReason ?? 'insufficient-disk', freeDiskMb };
}

/** The progress callback, in `event:pull-progress`'s own terms — raw bytes,
    not megabytes. */
type SendProgress = (completed: number, total: number, done: boolean, error?: string) => void;

/**
 * Downloads `hfFile` into `modelDir` under a `.part` name, promoting it to
 * its final name only on success. Resolves once the run has ended one way or
 * another; never rejects — every outcome is reported through `send`, exactly
 * like `ollama-install.ts`'s `runDownload`.
 */
async function runModelPull(
  hfFile: HfPullFile,
  modelDir: string,
  fileName: string,
  controller: AbortController,
  io: { fetchImpl: FetchFn; fs: EngineFs },
  send: SendProgress,
): Promise<void> {
  const finalPath = path.join(modelDir, fileName);
  const partialPath = `${finalPath}.part`;
  let totalBytes = hfFile.sizeBytes ?? 0;
  let sink: WriteSink | undefined;
  try {
    await io.fs.mkdir(modelDir);
    const response = await io.fetchImpl(hfFile.downloadUrl, {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw fail('io', `Modell-Download fehlgeschlagen: HTTP ${response.status}`);
    const header = response.headers.get('content-length');
    const headerBytes = header === null ? NaN : Number(header);
    // The host's own figure beats Hugging Face's tree-listing estimate once
    // the response actually arrives.
    if (Number.isFinite(headerBytes) && headerBytes > 0) totalBytes = headerBytes;

    const body = response.body;
    if (!body) throw fail('io', 'die Antwort enthielt keinen Inhalt');

    sink = io.fs.createSink(partialPath);
    const reader = body.getReader();
    let downloadedBytes = 0;
    let lastReportedMb = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await sink.write(value);
      downloadedBytes += value.byteLength;
      const mb = Math.floor(downloadedBytes / (1024 * 1024));
      // Throttled to one event per whole megabyte crossed — several a
      // second, never one per (far smaller) chunk.
      if (mb !== lastReportedMb) {
        lastReportedMb = mb;
        send(downloadedBytes, totalBytes || downloadedBytes, false);
      }
    }
    await sink.close();
    await io.fs.rename(partialPath, finalPath);
    send(downloadedBytes, totalBytes || downloadedBytes, true);
  } catch (error) {
    /* Sink closed, then the partial file removed, then the closing event —
       the same ordering `ollama-install.ts` and `llamacpp-fetch.ts` enforce,
       so a status/listing call triggered by `done: true` never finds a file
       whose handle is still open or whose bytes are incomplete. */
    if (sink) await sink.close().catch(() => undefined);
    await io.fs.removeDir(partialPath).catch(() => undefined);
    send(0, totalBytes, true, toIpcError(error).code);
  }
}

/** llama.cpp's half of `RuntimeInstaller` for the pull channels (033, D7). The
    `running` map is this closure's only link between `pull` and `cancelPull`,
    the same shape every other runtime part in this story already uses. */
export type LlamaCppPullPart = RuntimeInstallerPart<'pull' | 'cancelPull'>;

export function createLlamaCppPullPart(
  services: Services,
  deps: LlamaCppPullDeps = {},
): LlamaCppPullPart {
  const running = new Map<string, AbortController>();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const engineFs = deps.fs ?? nodeEngineFs;

  return {
    id: 'llamacpp',

    pull: async (_modelId, hfFile) => {
      if (!hfFile) {
        throw fail('invalid', 'kein Hugging-Face-Dateiverweis für den Modell-Download angegeben');
      }
      const userDataDir = deps.userDataDir ?? app.getPath('userData');
      const modelDir = ggufModelDir(userDataDir);
      const fileName = targetFileName(hfFile);
      const targetPath = path.join(modelDir, fileName);

      const judgement = await judgeModelDownload(hfFile, targetPath, modelDir, engineFs, deps);
      if (!judgement.ok) {
        throw fail(
          'invalid',
          'für diesen Modell-Download ist nicht genug freier Speicher vorhanden',
          {
            blockedReason: judgement.blockedReason,
            freeDiskMb: judgement.freeDiskMb,
          },
        );
      }

      const pullId = randomUUID();
      const controller = new AbortController();
      running.set(pullId, controller);

      let ended = false;
      const send: SendProgress = (completed, total, done, error) => {
        if (ended) return; // never anything after the closing event
        if (done) {
          ended = true;
          running.delete(pullId);
        }
        // The file name, not the caller's `modelId` (033, D7's shared shape
        // has no room for a second identifier, and the file name is the one
        // fact every listener — renderer or test — can already recognise).
        services.sendEvent('event:pull-progress', {
          pullId,
          modelId: fileName,
          status: error === undefined ? (done ? 'done' : 'downloading') : 'error',
          completed,
          total,
          done,
          ...(error === undefined ? {} : { error }),
        });
      };

      void runModelPull(hfFile, modelDir, fileName, controller, { fetchImpl, fs: engineFs }, send);
      return { pullId };
    },

    cancelPull: async (pullId) => {
      running.get(pullId)?.abort();
    },
  };
}

/** `llm:pullModel` / `llm:cancelPull` over a registry that knows llama.cpp and
    nothing else — this module's own seam, and the one its test drives.
    Production builds one registry across all runtimes in `register-all.ts`
    and hands it to the very same `pullChannelHandlers`. */
export function llamaCppPullHandlers(services: Services, deps: LlamaCppPullDeps = {}): HandlerMap {
  return pullChannelHandlers(createRuntimeRegistry([createLlamaCppPullPart(services, deps)]));
}
