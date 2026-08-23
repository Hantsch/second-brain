/* llama.cpp's model-file pull and status (033, D7) — through a fake `fetch`
 * and a fake filesystem, never the real network or disk.
 *
 * Checked, in the order the acceptance criteria name them:
 *   - a download reports progress through `event:pull-progress`'s existing
 *     shape (raw bytes, not megabytes) and ends with exactly one `done: true`;
 *   - a download that would not fit on disk is refused before the first byte,
 *     naming the actual free-disk MB in the thrown error's `detail`;
 *   - a cancelled download leaves no partial `.gguf` (or `.gguf.part`) file
 *     behind, and reports `'absent'`-shaped cleanup the same way D6's engine
 *     fetch does;
 *   - `status` reports the three `LocalRuntimeStatus` values from binary
 *     presence plus an injected server-reachability probe.
 */

import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { createLlamaCppPullPart } from '../../../../src/main/ipc/runtime/llamacpp-pull';
import type { LlamaCppPullDeps } from '../../../../src/main/ipc/runtime/llamacpp-pull';
import { createLlamaCppInstallPart } from '../../../../src/main/ipc/runtime/llamacpp-install';
import type { LlamaCppInstallDeps } from '../../../../src/main/ipc/runtime/llamacpp-install';
import { detectLlamaCppStatus } from '../../../../src/main/ipc/runtime/llamacpp-status';
import type { EngineFs } from '../../../../src/main/ipc/runtime/engine-fs';
import { engineBinaryPath, ggufModelDir } from '../../../../src/main/ipc/runtime/paths';
import type { FetchFn, WriteSink } from '../../../../src/main/ipc/ollama-install';
import type { Services } from '../../../../src/main/services';
import type { HfPullFile } from '../../../../src/shared/types';
import type { IpcEvents } from '../../../../src/shared/ipc';

/* The registry this handler map is built through imports `ipcMain`; the pull
   never touches it directly, but the module graph does. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  app: { getPath: () => '/never-used' },
  shell: { openPath: async () => '' },
}));

const USER_DATA = path.join('/data');
const MODEL_DIR = ggufModelDir(USER_DATA);
const MB = 1024 * 1024;

const HF_FILE: HfPullFile = {
  repoId: 'unsloth/qwen2.5-1.5b-gguf',
  path: 'Q4_K_M/qwen2.5-1.5b.Q4_K_M.gguf',
  downloadUrl:
    'https://huggingface.co/unsloth/qwen2.5-1.5b-gguf/resolve/main/qwen2.5-1.5b.Q4_K_M.gguf',
  sizeBytes: 4 * MB,
};
const FILE_NAME = 'qwen2.5-1.5b.Q4_K_M.gguf';
const FINAL_PATH = path.join(MODEL_DIR, FILE_NAME);
const PARTIAL_PATH = `${FINAL_PATH}.part`;

type PullEvent = IpcEvents['event:pull-progress'];

function fakeServices(): { services: Services; events: PullEvent[] } {
  const events: PullEvent[] = [];
  const services = {
    sendEvent: (name: string, payload: unknown) => {
      if (name === 'event:pull-progress') events.push(payload as PullEvent);
    },
  } as unknown as Services;
  return { services, events };
}

/** A minimal in-memory `EngineFs` — only the operations a model pull touches:
    write a sink, make the model directory, rename the finished file into
    place, remove a partial one, and answer `exists`/`writable`. */
function fakeEngineFs(seed: { writable?: boolean } = {}): {
  fs: EngineFs;
  files: () => string[];
  dirs: () => string[];
  fileBytes: (target: string) => number | undefined;
  closedBeforeRemoved: (target: string) => boolean | undefined;
} {
  const files = new Map<string, number>();
  const dirs = new Set<string>();
  const closed = new Set<string>();
  const closedOnRemove = new Map<string, boolean>();

  const fs: EngineFs = {
    createSink: (target): WriteSink => {
      files.set(target, 0);
      return {
        write: async (chunk) => {
          files.set(target, (files.get(target) ?? 0) + chunk.byteLength);
        },
        close: async () => {
          closed.add(target);
        },
      };
    },
    mkdir: async (dir) => {
      dirs.add(dir);
    },
    rename: async (from, to) => {
      if (!files.has(from)) throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
      files.set(to, files.get(from) ?? 0);
      files.delete(from);
    },
    removeDir: async (target) => {
      if (files.has(target)) closedOnRemove.set(target, closed.has(target));
      files.delete(target);
    },
    exists: async (target) => files.has(target) || dirs.has(target),
    writable: async () => seed.writable ?? true,
    list: async () => [],
    chmod: async () => undefined,
  };

  return {
    fs,
    files: () => [...files.keys()],
    dirs: () => [...dirs],
    fileBytes: (target) => files.get(target),
    closedBeforeRemoved: (target) => closedOnRemove.get(target),
  };
}

interface ResponseSpec {
  status?: number;
  chunks: number[];
  /** Keep the read pending after the last chunk, so a cancel can land mid-stream. */
  hold?: boolean;
  contentLength?: string;
}

/** A fake `fetch` reacting to `AbortSignal` the way a real streamed response
    does: the pending read rejects, it does not just stop. */
function scriptedFetch(spec: ResponseSpec): { fetchImpl: FetchFn; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchFn = async (url, init) => {
    calls.push(url);
    let index = 0;
    let rejectRead: ((error: unknown) => void) | null = null;
    const abortError = (): Error =>
      Object.assign(new Error('aborted'), { name: 'AbortError' as const });
    init?.signal?.addEventListener('abort', () => {
      rejectRead?.(abortError());
      rejectRead = null;
    });
    const reader = {
      read: (): Promise<{ done: boolean; value?: Uint8Array }> => {
        if (init?.signal?.aborted) return Promise.reject(abortError());
        if (index < spec.chunks.length) {
          const value = new Uint8Array(spec.chunks[index] ?? 0);
          index += 1;
          return Promise.resolve({ done: false, value });
        }
        if (spec.hold) return new Promise((_resolve, reject) => (rejectRead = reject));
        return Promise.resolve({ done: true });
      },
    };
    const status = spec.status ?? 200;
    return {
      ok: status < 400,
      status,
      headers: {
        get: (name: string) => (name === 'content-length' ? (spec.contentLength ?? null) : null),
      },
      body: { getReader: () => reader },
    } as unknown as Response;
  };
  return { fetchImpl, calls };
}

/** Lets the background pull settle before asserting. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function harness(fetchSpec: ResponseSpec, deps: Partial<LlamaCppPullDeps> = {}) {
  const { services, events } = fakeServices();
  const fs = fakeEngineFs();
  const fetch = scriptedFetch(fetchSpec);
  const part = createLlamaCppPullPart(services, {
    userDataDir: USER_DATA,
    freeDiskMbFn: async () => 100_000,
    fetchImpl: fetch.fetchImpl,
    fs: fs.fs,
    ...deps,
  });
  return { part, events, fs, fetch };
}

describe('llamacpp pull — happy path', () => {
  it('reports progress in bytes and ends with exactly one done event', async () => {
    const { part, events, fs, fetch } = harness({ chunks: [2 * MB, 2 * MB] });

    const { pullId } = await part.pull('unused', HF_FILE);
    await tick();

    expect(fetch.calls).toEqual([HF_FILE.downloadUrl]);
    expect(events.every((event) => event.pullId === pullId)).toBe(true);
    expect(events.every((event) => event.modelId === FILE_NAME)).toBe(true);
    expect(events.filter((event) => event.done)).toHaveLength(1);

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBeUndefined();
    expect(final?.completed).toBe(4 * MB);
    expect(final?.total).toBe(4 * MB);

    // Promoted to its final name; the partial name is gone.
    expect(fs.files()).toContain(FINAL_PATH);
    expect(fs.files()).not.toContain(PARTIAL_PATH);
    expect(fs.fileBytes(FINAL_PATH)).toBe(4 * MB);
  });

  it('sharpens the total to the response’s own Content-Length once it arrives', async () => {
    const { part, events } = harness({ chunks: [1 * MB], contentLength: String(5 * MB) });

    await part.pull('unused', HF_FILE);
    await tick();

    expect(events.at(-1)?.total).toBe(5 * MB);
  });
});

describe('llamacpp pull — refused for disk space', () => {
  it('refuses before the first byte and names the actual free-disk MB', async () => {
    const { part, fetch } = harness(
      { chunks: [] },
      { freeDiskMbFn: async () => 100 }, // far below the file size + safety margin
    );

    await expect(part.pull('unused', HF_FILE)).rejects.toMatchObject({
      code: 'invalid',
      detail: { blockedReason: 'insufficient-disk', freeDiskMb: 100 },
    });
    expect(fetch.calls).toEqual([]); // no download ever started
  });

  it('refuses without a Hugging Face file reference', async () => {
    const { part, fetch } = harness({ chunks: [] });

    await expect(part.pull('unused', undefined)).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch.calls).toEqual([]);
  });
});

describe('llamacpp pull — cancel', () => {
  it('deletes the partial file and leaves no `.gguf` behind', async () => {
    const { part, events, fs } = harness({ chunks: [2 * MB], hold: true });

    const { pullId } = await part.pull('unused', HF_FILE);
    await tick();
    // Genuinely mid-stream: bytes reported, the reader parked in a pending read.
    expect(events.filter((event) => !event.done)).toHaveLength(1);
    expect(fs.files()).toContain(PARTIAL_PATH);

    await part.cancelPull(pullId);
    await tick();

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('cancelled');
    expect(fs.files()).not.toContain(PARTIAL_PATH);
    expect(fs.files()).not.toContain(FINAL_PATH);
    // The sink was closed before the partial file was removed.
    expect(fs.closedBeforeRemoved(PARTIAL_PATH)).toBe(true);

    const seen = events.length;
    await tick();
    expect(events.length).toBe(seen); // nothing follows `done: true`
  });

  it('changes nothing for an unknown pull id', async () => {
    const { part } = harness({ chunks: [] });
    await expect(part.cancelPull('not-a-real-id')).resolves.toBeUndefined();
  });
});

describe('llamacpp pull — stream failure', () => {
  it('reports a closed code, leaving no partial file behind', async () => {
    const { part, events, fs } = harness({ status: 503, chunks: [] });

    await part.pull('unused', HF_FILE);
    await tick();

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('io');
    expect(fs.files()).not.toContain(PARTIAL_PATH);
    expect(fs.files()).not.toContain(FINAL_PATH);
  });
});

describe('llamacpp status — the three values', () => {
  function statusPart(deps: LlamaCppInstallDeps = {}) {
    const { services } = fakeServices();
    return createLlamaCppInstallPart(services, {
      platform: 'linux',
      userDataDir: USER_DATA,
      gpuFactsFn: async () => null,
      ...deps,
    });
  }

  it('reports absent when the binary is not on disk', async () => {
    const fs = fakeEngineFs();
    const part = statusPart({ fs: fs.fs, statusFetchImpl: async () => ({ ok: true }) as Response });
    expect(await part.status()).toBe('absent');
  });

  it('reports installed-stopped when the binary exists but no probe was wired', async () => {
    const fs = fakeEngineFs();
    await fs.fs
      .createSink(engineBinaryPath(path.join(USER_DATA, 'runtimes/llamacpp'), 'linux'))
      .close();
    const part = statusPart({ fs: fs.fs });
    expect(await part.status()).toBe('installed-stopped');
  });

  it('reports installed-stopped when the binary exists but the server does not answer', async () => {
    const fs = fakeEngineFs();
    await fs.fs
      .createSink(engineBinaryPath(path.join(USER_DATA, 'runtimes/llamacpp'), 'linux'))
      .close();
    const part = statusPart({
      fs: fs.fs,
      statusFetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(await part.status()).toBe('installed-stopped');
  });

  it('reports running when the binary exists and the server answers', async () => {
    const fs = fakeEngineFs();
    await fs.fs
      .createSink(engineBinaryPath(path.join(USER_DATA, 'runtimes/llamacpp'), 'linux'))
      .close();
    const calls: string[] = [];
    const part = statusPart({
      fs: fs.fs,
      statusFetchImpl: async (url) => {
        calls.push(url);
        return { ok: true } as Response;
      },
    });
    expect(await part.status()).toBe('running');
    expect(calls[0]).toBe('http://127.0.0.1:8080/v1/models');
  });
});

describe('detectLlamaCppStatus — the pure decision', () => {
  it('never probes when the binary is absent', async () => {
    const probe = vi.fn(async () => true);
    expect(await detectLlamaCppStatus(false, probe)).toBe('absent');
    expect(probe).not.toHaveBeenCalled();
  });

  it('answers installed-stopped when no probe is given at all', async () => {
    expect(await detectLlamaCppStatus(true)).toBe('installed-stopped');
  });
});
