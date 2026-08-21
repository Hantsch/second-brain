/* The Ollama installer download (019c, D2) — through fake `fetch` and a fake
 * file system, never the real network or the real disk.
 *
 * Checked:
 *   - `llm:runtimeInstallPlan` reports the same plan `llm:downloadRuntime`
 *     acts on, without downloading anything.
 *   - `llm:downloadRuntime` reports increasing progress over
 *     `event:install-progress`, throttled to whole megabytes.
 *   - Cancelling mid-download removes the partial file and ends the run with
 *     `error: 'cancelled'` — the acceptance criterion this deliverable turns on.
 *   - A non-2xx response and a disk write failure both surface a closed
 *     reason code (never a raw error) and both clean up.
 *   - An unknown download id changes nothing.
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  DownloadFs,
  FetchFn,
  OllamaInstallDeps,
  WriteSink,
} from '../../../src/main/ipc/ollama-install';
import { ollamaInstallHandlers } from '../../../src/main/ipc/ollama-install';
import type { Services } from '../../../src/main/services';
import type { IpcEvents } from '../../../src/shared/ipc';

/* The registry this handler map is built through imports `ipcMain`; this
   download never touches it directly, but the module graph does. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  app: { getPath: () => '/tmp' },
}));

const WIN32_DEPS: Pick<OllamaInstallDeps, 'platform' | 'tempDir' | 'freeDiskMbFn' | 'writableFn'> =
  {
    platform: 'win32',
    tempDir: 'C:\\Temp',
    freeDiskMbFn: async () => 100_000,
    // Never the real disk in a unit test — every case that needs the
    // unwritable path injects its own `writableFn: async () => false`.
    writableFn: async () => true,
  };

/** Captures every `event:install-progress` payload sent through `services`. */
function fakeServices(): { services: Services; events: IpcEvents['event:install-progress'][] } {
  const events: IpcEvents['event:install-progress'][] = [];
  // Only `sendEvent` is exercised by this handler; a full `Services` instance
  // would need a vault, settings, and a key store this test has no use for.
  const services = {
    sendEvent: (name: string, payload: unknown) => {
      if (name === 'event:install-progress') {
        events.push(payload as IpcEvents['event:install-progress']);
      }
    },
  } as unknown as Services;
  return { services, events };
}

/** An in-memory `DownloadFs`: tracks bytes written per path and lets a test
    force a write to fail, without ever touching a real file. Also tracks
    whether each path's sink was actually closed, and — the point of this
    fake — whether it was closed *before* `remove` ran for that path: a
    no-op `close()` would hide exactly the bug this fake exists to catch
    (F1: deleting the partial file while its write stream is still open). */
function fakeDownloadFs(options: { failOnWrite?: boolean } = {}): {
  fs: DownloadFs;
  bytesWritten: (path: string) => number;
  existingFiles: () => string[];
  wasClosedBeforeRemove: (path: string) => boolean | undefined;
} {
  const files = new Map<string, number>();
  const closed = new Set<string>();
  const closedBeforeRemove = new Map<string, boolean>();
  const fs: DownloadFs = {
    createSink: (path: string): WriteSink => {
      files.set(path, 0);
      return {
        write: async (chunk) => {
          if (options.failOnWrite) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
          files.set(path, (files.get(path) ?? 0) + chunk.byteLength);
        },
        close: async () => {
          closed.add(path);
        },
      };
    },
    remove: async (path: string) => {
      // Recorded once per path, at the moment `remove` is actually called —
      // exactly what the acceptance criterion cares about.
      closedBeforeRemove.set(path, closed.has(path));
      files.delete(path);
    },
  };
  return {
    fs,
    bytesWritten: (path) => files.get(path) ?? 0,
    existingFiles: () => [...files.keys()],
    wasClosedBeforeRemove: (path) => closedBeforeRemove.get(path),
  };
}

/** A controllable fake `fetch`: the test decides exactly when each chunk
    arrives, when the body ends, and reacts to `AbortSignal` like a real
    streamed response would — rejecting the pending read instead of just
    stopping silently. */
function controlledFetch(responseInit: { status?: number; contentLength?: string } = {}): {
  fetchImpl: FetchFn;
  urls: string[];
  pushChunk: (bytes: number) => void;
  finish: () => void;
} {
  const urls: string[] = [];
  let resolveRead: ((result: { done: boolean; value?: Uint8Array }) => void) | null = null;
  let rejectRead: ((error: unknown) => void) | null = null;

  const reader = {
    read: () =>
      new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
        resolveRead = resolve;
        rejectRead = reject;
      }),
  };

  const fetchImpl: FetchFn = async (url, init) => {
    urls.push(url);
    init?.signal?.addEventListener('abort', () => {
      rejectRead?.(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      resolveRead = null;
      rejectRead = null;
    });
    const status = responseInit.status ?? 200;
    const headers = {
      get: (name: string) =>
        name === 'content-length' ? (responseInit.contentLength ?? null) : null,
    };
    return {
      ok: status < 400,
      status,
      headers,
      body: { getReader: () => reader },
    } as unknown as Response;
  };

  return {
    fetchImpl,
    urls,
    pushChunk: (bytes: number) => {
      resolveRead?.({ done: false, value: new Uint8Array(bytes) });
      resolveRead = null;
      rejectRead = null;
    },
    finish: () => {
      resolveRead?.({ done: true });
      resolveRead = null;
      rejectRead = null;
    },
  };
}

/** Lets pending microtasks (the `runDownload` loop) settle before asserting. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('llm:runtimeInstallPlan', () => {
  it('reports the same plan the download itself would act on, without fetching anything', async () => {
    const { services } = fakeServices();
    const handlers = ollamaInstallHandlers(services, WIN32_DEPS);
    const plan = await handlers['llm:runtimeInstallPlan']?.(undefined);

    expect(plan).toMatchObject({ canInstall: true, downloadMb: 300 });
    expect(plan?.installerPath).toContain('OllamaSetup.exe');
  });
});

describe('llm:downloadRuntime — happy path', () => {
  it('reports increasing progress, throttled to whole megabytes, then done', async () => {
    const { services, events } = fakeServices();
    const fetch = controlledFetch();
    const fakeFs = fakeDownloadFs();
    const handlers = ollamaInstallHandlers(services, {
      ...WIN32_DEPS,
      fetchImpl: fetch.fetchImpl,
      fs: fakeFs.fs,
    });

    const result = await handlers['llm:downloadRuntime']?.(undefined);
    expect(result?.downloadId).toBeTruthy();
    const plan = await handlers['llm:runtimeInstallPlan']?.(undefined);
    if (!plan) throw new Error('no plan');
    await tick(); // let `runDownload` reach its first pending `reader.read()`

    // Three chunks, each just over a megabyte — each should cross a new whole-MB boundary.
    fetch.pushChunk(1_100_000);
    await tick();
    fetch.pushChunk(1_100_000);
    await tick();
    fetch.pushChunk(1_100_000);
    await tick();
    fetch.finish();
    await tick();

    const progressed = events.filter((event) => !event.done);
    expect(progressed.map((event) => event.downloadedMb)).toEqual([1, 2, 3]);
    expect(progressed.every((event) => event.totalMb === 300)).toBe(true);

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBeUndefined();
    expect(fakeFs.existingFiles()).toContain(plan.installerPath);
  });

  it('prefers the real Content-Length over the hardcoded estimate', async () => {
    const { services, events } = fakeServices();
    // 5 MB, in bytes.
    const fetch = controlledFetch({ contentLength: String(5 * 1024 * 1024) });
    const handlers = ollamaInstallHandlers(services, {
      ...WIN32_DEPS,
      fetchImpl: fetch.fetchImpl,
      fs: fakeDownloadFs().fs,
    });

    await handlers['llm:downloadRuntime']?.(undefined);
    await tick(); // let `runDownload` reach its first pending `reader.read()`
    fetch.pushChunk(1_100_000);
    await tick();
    fetch.finish();
    await tick();

    expect(events[0]?.totalMb).toBe(5);
  });
});

describe('llm:downloadRuntime — cancel', () => {
  it('removes the partial file and ends the run as cancelled, with no further events', async () => {
    const { services, events } = fakeServices();
    const fetch = controlledFetch();
    const fakeFs = fakeDownloadFs();
    const handlers = ollamaInstallHandlers(services, {
      ...WIN32_DEPS,
      fetchImpl: fetch.fetchImpl,
      fs: fakeFs.fs,
    });

    const { downloadId } = (await handlers['llm:downloadRuntime']?.(undefined)) ?? {
      downloadId: '',
    };
    const plan = await handlers['llm:runtimeInstallPlan']?.(undefined);
    if (!plan) throw new Error('no plan');
    await tick(); // let `runDownload` reach its first pending `reader.read()`

    fetch.pushChunk(2 * 1024 * 1024); // 2 MB written before the cancel lands
    await tick();
    expect(fakeFs.bytesWritten(plan.installerPath)).toBe(2 * 1024 * 1024);

    await handlers['llm:cancelRuntimeDownload']?.({ downloadId });
    await tick();

    expect(fakeFs.existingFiles()).not.toContain(plan.installerPath);
    // F1: the sink must be closed before the partial file is removed —
    // otherwise the delete races an open handle (a no-op on Windows).
    expect(fakeFs.wasClosedBeforeRemove(plan.installerPath)).toBe(true);
    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('cancelled');

    const eventCountAfterCancel = events.length;
    await tick();
    expect(events.length).toBe(eventCountAfterCancel); // nothing more arrives after `done: true`
  });

  it('changes nothing for an unknown download id', async () => {
    const { services } = fakeServices();
    const handlers = ollamaInstallHandlers(services, WIN32_DEPS);
    await expect(
      handlers['llm:cancelRuntimeDownload']?.({ downloadId: 'not-a-real-id' }),
    ).resolves.toBeUndefined();
  });
});

describe('llm:downloadRuntime — failure', () => {
  it('surfaces a closed reason code for a non-2xx response, without creating a file', async () => {
    const { services, events } = fakeServices();
    const fetch = controlledFetch({ status: 503 });
    const fakeFs = fakeDownloadFs();
    const handlers = ollamaInstallHandlers(services, {
      ...WIN32_DEPS,
      fetchImpl: fetch.fetchImpl,
      fs: fakeFs.fs,
    });

    await handlers['llm:downloadRuntime']?.(undefined);
    await tick();

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(final?.error).toBe('io');
    expect(fakeFs.existingFiles()).toEqual([]);
  });

  it('cleans up and reports a closed code when writing to disk fails', async () => {
    const { services, events } = fakeServices();
    const fetch = controlledFetch();
    const fakeFs = fakeDownloadFs({ failOnWrite: true });
    const handlers = ollamaInstallHandlers(services, {
      ...WIN32_DEPS,
      fetchImpl: fetch.fetchImpl,
      fs: fakeFs.fs,
    });

    await handlers['llm:downloadRuntime']?.(undefined);
    const plan = await handlers['llm:runtimeInstallPlan']?.(undefined);
    if (!plan) throw new Error('no plan');
    await tick(); // let `runDownload` reach its first pending `reader.read()`
    fetch.pushChunk(1_000);
    await tick();

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(typeof final?.error).toBe('string');
    // Never the raw "disk full" message or an ENOSPC stack — only a closed code.
    expect(final?.error).not.toMatch(/disk full/i);
    expect(fakeFs.existingFiles()).toEqual([]);
    // F1: same ordering requirement on the failure path as on cancel.
    expect(fakeFs.wasClosedBeforeRemove(plan.installerPath)).toBe(true);
  });
});

describe('llm:downloadRuntime — blocked plan', () => {
  it('throws a closed "invalid" error instead of starting a download on an unsupported platform', async () => {
    const { services } = fakeServices();
    const handlers = ollamaInstallHandlers(services, {
      platform: 'linux',
      tempDir: '/tmp',
      freeDiskMbFn: async () => 100_000,
    });

    await expect(handlers['llm:downloadRuntime']?.(undefined)).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('throws when disk space is insufficient', async () => {
    const { services } = fakeServices();
    const handlers = ollamaInstallHandlers(services, {
      platform: 'win32',
      tempDir: 'C:\\Temp',
      freeDiskMbFn: async () => 1, // far below the installer size plus safety margin
      writableFn: async () => true,
    });

    await expect(handlers['llm:downloadRuntime']?.(undefined)).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('throws when the temp directory refuses a write-probe', async () => {
    const { services } = fakeServices();
    const handlers = ollamaInstallHandlers(services, {
      ...WIN32_DEPS,
      writableFn: async () => false, // e.g. a read-only mount or missing permission
    });

    const plan = await handlers['llm:runtimeInstallPlan']?.(undefined);
    expect(plan).toMatchObject({ canInstall: false, blockedReason: 'no-write-permission' });

    await expect(handlers['llm:downloadRuntime']?.(undefined)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});
