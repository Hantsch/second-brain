/* The llama.cpp engine fetch (033, D6) — through a fake `fetch`, a fake
 * filesystem and a fake extractor, never the real network, disk or archive.
 *
 * The acceptance criterion this deliverable turns on is negative: after a
 * cancelled or failed fetch there must be *nothing* a later status call reports
 * as installed. So most of what is checked here is what is gone:
 *
 *   - a single-archive build downloads, extracts, gets its exec bit and is
 *     renamed into place, with the staging root removed afterwards;
 *   - the archive goes to the extractor its format needs — the `.tar.gz`
 *     releases (macOS, Linux) to the tar extractor, the Windows ZIPs to the
 *     zip one, since handing a tarball to `extract-zip` is a download that
 *     can never install;
 *   - the machine's architecture picks the asset: an arm64 machine gets the
 *     arm64 archive, never the x64 one;
 *   - the Windows CUDA build's `cudart-*` companion is fetched in the same run,
 *     into the same extraction directory, counted into one progress;
 *   - a cancel mid-download leaves no staging root, no target directory, and a
 *     following `status` reports `absent`;
 *   - a failure mid-stream and a non-2xx response do the same, with a closed
 *     reason code and the write sink closed before anything is removed;
 *   - a reinstall never leaves the machine without an engine;
 *   - a plan blocked on disk space refuses before the first byte.
 */

import { describe, expect, it, vi } from 'vitest';
import { createLlamaCppInstallPart } from '../../../../src/main/ipc/runtime/llamacpp-install';
import type { LlamaCppInstallDeps } from '../../../../src/main/ipc/runtime/llamacpp-install';
import type { EngineFs } from '../../../../src/main/ipc/runtime/engine-fs';
import {
  engineBinaryPath,
  engineStagingRoot,
  engineTargetDir,
  ggufModelDir,
  stagingUnpackDir,
} from '../../../../src/main/ipc/runtime/paths';
import type { ExtractTarFn } from '../../../../src/main/ipc/runtime/untar';
import type { DirEntry, ExtractZipFn } from '../../../../src/main/ipc/runtime/unzip';
import type { FetchFn, WriteSink } from '../../../../src/main/ipc/ollama-install';
import type { Services } from '../../../../src/main/services';
import type { IpcEvents } from '../../../../src/shared/ipc';
import * as path from 'node:path';

/* The module graph reaches `ipcMain` (via the handler registry) and `app` /
   `shell`; nothing in this test uses any of them for real. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  app: { getPath: () => '/never-used' },
  shell: { openPath: async () => '' },
}));

const USER_DATA = path.join('/data');
const SUBDIR = 'runtimes/llamacpp';
const TOKEN = 'tkn';
const STAGING = engineStagingRoot(USER_DATA, SUBDIR, TOKEN);
const UNPACK = stagingUnpackDir(STAGING);
const TARGET = engineTargetDir(USER_DATA, SUBDIR);
const MB = 1024 * 1024;

/** No remembered GPU scan → D2 picks the CPU build, which exists on linux.
    Linux ships `.tar.gz`, so this fixture also covers the tar path. */
const LINUX_CPU: LlamaCppInstallDeps = {
  platform: 'linux',
  arch: 'x64',
  userDataDir: USER_DATA,
  freeDiskMbFn: async () => 100_000,
  gpuFactsFn: async () => null,
  stagingToken: () => TOKEN,
};

/** An NVIDIA card the scan is sure about → the CUDA build, the one with a
    companion archive. Windows ships ZIPs. */
const WIN32_CUDA: LlamaCppInstallDeps = {
  ...LINUX_CPU,
  platform: 'win32',
  gpuFactsFn: async () => ({ gpuName: 'NVIDIA GeForce RTX 4070', gpuDetection: 'detected' }),
};

/** An Apple Silicon Mac — the macOS build, and the second `.tar.gz` platform. */
const DARWIN_ARM64: LlamaCppInstallDeps = {
  ...LINUX_CPU,
  platform: 'darwin',
  arch: 'arm64',
  gpuFactsFn: async () => ({ gpuName: 'Apple M2 Pro', gpuDetection: 'detected' }),
};

function fakeServices(): { services: Services; events: IpcEvents['event:install-progress'][] } {
  const events: IpcEvents['event:install-progress'][] = [];
  const services = {
    sendEvent: (name: string, payload: unknown) => {
      if (name === 'event:install-progress') {
        events.push(payload as IpcEvents['event:install-progress']);
      }
    },
  } as unknown as Services;
  return { services, events };
}

function under(prefix: string, target: string): boolean {
  return target === prefix || target.startsWith(prefix + path.sep);
}

/** An in-memory `EngineFs`. Tracks directories, file sizes, `chmod` calls, and
    — the point of this fake — whether every sink under a directory was closed
    before that directory was removed. */
function fakeEngineFs(seed: { dirs?: string[]; files?: string[] } = {}): {
  fs: EngineFs;
  dirs: () => string[];
  files: () => string[];
  chmods: () => { target: string; mode: number }[];
  removedDirs: () => string[];
  allSinksClosedOnRemove: (dir: string) => boolean | undefined;
  /** What the fake extractor uses to put an entry on the fake disk. */
  touch: (file: string) => void;
} {
  const dirs = new Set<string>();
  const files = new Map<string, number>();
  const closed = new Set<string>();
  const chmods: { target: string; mode: number }[] = [];
  const removedDirs: string[] = [];
  const closedOnRemove = new Map<string, boolean>();

  const addDir = (dir: string): void => {
    for (let current = dir; ; current = path.dirname(current)) {
      dirs.add(current);
      if (path.dirname(current) === current) break;
    }
  };
  for (const dir of seed.dirs ?? []) addDir(dir);
  for (const file of seed.files ?? []) {
    addDir(path.dirname(file));
    files.set(file, 1);
  }

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
      addDir(dir);
    },
    rename: async (from, to) => {
      if (!dirs.has(from) && !files.has(from)) {
        throw Object.assign(new Error('no such entry'), { code: 'ENOENT' });
      }
      const rebase = (target: string): string => path.join(to, target.slice(from.length));
      for (const dir of [...dirs]) {
        if (!under(from, dir)) continue;
        dirs.delete(dir);
        addDir(rebase(dir));
      }
      for (const [file, size] of [...files]) {
        if (!under(from, file)) continue;
        files.delete(file);
        files.set(rebase(file), size);
      }
    },
    removeDir: async (dir) => {
      removedDirs.push(dir);
      const inside = [...files.keys()].filter((file) => under(dir, file));
      closedOnRemove.set(
        dir,
        inside.every((file) => closed.has(file)),
      );
      for (const file of inside) files.delete(file);
      for (const existing of [...dirs]) if (under(dir, existing)) dirs.delete(existing);
    },
    exists: async (target) => dirs.has(target) || files.has(target),
    writable: async () => true,
    list: async (dir): Promise<readonly DirEntry[]> => {
      const entries = new Map<string, boolean>();
      for (const existing of dirs) {
        if (path.dirname(existing) === dir) entries.set(path.basename(existing), true);
      }
      for (const file of files.keys()) {
        if (path.dirname(file) === dir) entries.set(path.basename(file), false);
      }
      return [...entries].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    chmod: async (target, mode) => {
      chmods.push({ target, mode });
    },
  };

  return {
    fs,
    dirs: () => [...dirs],
    files: () => [...files.keys()],
    chmods: () => chmods,
    removedDirs: () => removedDirs,
    allSinksClosedOnRemove: (dir) => closedOnRemove.get(dir),
    touch: (file) => {
      addDir(path.dirname(file));
      files.set(file, 1);
      // Extracted entries have no open handle, so they count as closed.
      closed.add(file);
    },
  };
}

interface ResponseSpec {
  status?: number;
  chunks: number[];
  /** Keep the read pending after the last chunk, so a cancel can land mid-stream. */
  hold?: boolean;
  /** Reject the read after the last chunk — a connection dropping mid-download. */
  failAfterChunks?: boolean;
  contentLength?: string;
}

/** A fake `fetch` scripted per URL, reacting to `AbortSignal` the way a real
    streamed response does: the pending read rejects, it does not just stop. */
function scriptedFetch(script: (url: string) => ResponseSpec): {
  fetchImpl: FetchFn;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl: FetchFn = async (url, init) => {
    urls.push(url);
    const spec = script(url);
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
        if (spec.failAfterChunks) return Promise.reject(new Error('socket hang up'));
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
  return { fetchImpl, urls };
}

/** One extraction, as the fake extractors record it. `via` is what makes the
    format dispatch observable: a `.tar.gz` unpacked `via: 'zip'` is exactly
    the bug that made macOS and Linux installs impossible. */
interface ExtractCall {
  archive: string;
  dir: string;
  via: 'zip' | 'tar';
}

/** Fake extractors, one per archive format, sharing a call log. Both put the
    entries the archive would have contained onto the fake disk, so the
    install's binary lookup has something to find. */
function fakeExtractors(
  disk: { touch: (file: string) => void },
  layout: (archiveName: string) => string[],
): { extractZip: ExtractZipFn; extractTar: ExtractTarFn; calls: ExtractCall[] } {
  const calls: ExtractCall[] = [];
  const record =
    (via: 'zip' | 'tar'): ExtractZipFn =>
    async (archivePath, targetDir) => {
      calls.push({ archive: path.basename(archivePath), dir: targetDir, via });
      for (const relative of layout(path.basename(archivePath))) {
        disk.touch(path.join(targetDir, ...relative.split('/')));
      }
    };
  return { extractZip: record('zip'), extractTar: record('tar'), calls };
}

/** Lets the background install run settle before asserting. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Everything one install run needs, wired together. */
function harness(
  deps: LlamaCppInstallDeps,
  options: {
    script: (url: string) => ResponseSpec;
    layout: (archiveName: string) => string[];
    seed?: { dirs?: string[]; files?: string[] };
  },
) {
  const { services, events } = fakeServices();
  const fs = fakeEngineFs(options.seed);
  const fetch = scriptedFetch(options.script);
  const extractor = fakeExtractors(fs, options.layout);
  const part = createLlamaCppInstallPart(services, {
    ...deps,
    fetchImpl: fetch.fetchImpl,
    fs: fs.fs,
    extractZip: extractor.extractZip,
    extractTar: extractor.extractTar,
  });
  return { part, events, fs, fetch, extractor };
}

const LINUX_LAYOUT = (): string[] => ['build/bin/llama-server', 'build/bin/libggml.so'];

describe('llamacpp plan', () => {
  it('names the engine directory, the model directory and the summed download size', async () => {
    const { part } = harness(WIN32_CUDA, { script: () => ({ chunks: [] }), layout: () => [] });
    const plan = await part.plan();

    // 239 MB main archive + 373 MB cudart companion, as one figure.
    expect(plan).toMatchObject({ canInstall: true, downloadMb: 612, installerPath: TARGET });
    expect(plan.modelDirHint).toBe(ggufModelDir(USER_DATA));
  });

  it('refuses a download when the plan is blocked on disk space, before any fetch', async () => {
    const { part, fetch } = harness(
      { ...LINUX_CPU, freeDiskMbFn: async () => 100 },
      { script: () => ({ chunks: [] }), layout: () => [] },
    );

    await expect(part.download()).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch.urls).toEqual([]);
  });

  it('reports the GPU-derived build, its reason, and every alternative this platform offers (033, D10)', async () => {
    const { part } = harness(WIN32_CUDA, { script: () => ({ chunks: [] }), layout: () => [] });
    const plan = await part.plan();

    expect(plan.build?.id).toBe('cuda');
    expect(plan.build?.reason).toEqual({
      kind: 'gpu',
      gpuName: 'NVIDIA GeForce RTX 4070',
      confident: true,
      requestedBuild: 'cuda',
      actualBuild: 'cuda',
    });
    expect(plan.build?.options).toEqual(expect.arrayContaining(['cuda', 'vulkan', 'cpu']));
  });

  it('re-plans against an overridden build instead of the GPU-derived one', async () => {
    const { part } = harness(WIN32_CUDA, { script: () => ({ chunks: [] }), layout: () => [] });

    const overridden = await part.plan('cpu');

    expect(overridden.build?.id).toBe('cpu');
    expect(overridden.downloadMb).toBe(17); // the CPU build's own size, not CUDA's 612
  });

  it('falls back to the GPU-derived build for an override this platform has no asset for', async () => {
    const { part } = harness(LINUX_CPU, { script: () => ({ chunks: [] }), layout: () => [] });

    // Linux has no CUDA asset (see descriptors.ts) — the override is ignored,
    // not silently turned into a plan for an asset that doesn't exist.
    const plan = await part.plan('cuda');

    expect(plan.build?.id).toBe('cpu');
  });
});

describe('llamacpp download — single archive', () => {
  it('extracts into staging, sets the exec bit, renames into place and clears staging', async () => {
    const { part, events, fs, fetch, extractor } = harness(LINUX_CPU, {
      script: () => ({ chunks: [1_100_000, 1_100_000] }),
      layout: LINUX_LAYOUT,
    });

    await part.download();
    await tick();

    expect(fetch.urls).toHaveLength(1);
    // Linux ships gzipped tarballs, and the tar extractor is what unpacks them.
    expect(fetch.urls[0]).toMatch(/^https:\/\/github\.com\/.*-ubuntu-x64\.tar\.gz$/);
    expect(extractor.calls).toEqual([
      { archive: path.basename(fetch.urls[0] ?? ''), dir: UNPACK, via: 'tar' },
    ]);

    const final = events.at(-1);
    expect(final).toMatchObject({ done: true, totalMb: 16 });
    expect(final?.error).toBeUndefined();

    // The directory the binary sat in went live, so the target is flat.
    expect(fs.files()).toContain(engineBinaryPath(TARGET, 'linux'));
    expect(await part.status()).toBe('installed-stopped');
    // Nothing of the staging root survives — neither the archives nor the tree.
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
    expect(fs.removedDirs()).toContain(STAGING);
  });

  it('gives the POSIX binary its exec bit, in staging, before the promote', async () => {
    const { part, fs } = harness(LINUX_CPU, {
      script: () => ({ chunks: [1_000] }),
      layout: LINUX_LAYOUT,
    });

    await part.download();
    await tick();

    expect(fs.chmods()).toEqual([
      { target: path.join(UNPACK, 'build', 'bin', 'llama-server'), mode: 0o755 },
    ]);
  });
});

describe('llamacpp download — companion archive', () => {
  it('fetches both archives as one progress, into one extraction directory', async () => {
    const { part, events, fs, fetch, extractor } = harness(WIN32_CUDA, {
      script: () => ({ chunks: [1_100_000, 1_100_000] }),
      layout: (zip) => (zip.startsWith('cudart') ? ['cudart64_12.dll'] : ['llama-server.exe']),
    });

    await part.download();
    await tick();

    expect(fetch.urls).toHaveLength(2);
    expect(fetch.urls.some((url) => url.includes('cudart'))).toBe(true);
    // Both into the same directory: the CUDA runtime DLLs belong next to the
    // binary — and both are ZIPs, so both go through the zip extractor.
    expect(extractor.calls.map((call) => call.dir)).toEqual([UNPACK, UNPACK]);
    expect(extractor.calls.map((call) => call.via)).toEqual(['zip', 'zip']);

    const progressed = events.filter((event) => !event.done);
    // Four chunks over two archives, counted into one continuous byte total.
    expect(progressed.map((event) => event.downloadedMb)).toEqual([1, 2, 3, 4]);
    expect(progressed.every((event) => event.totalMb === 612)).toBe(true);
    expect(events.at(-1)).toMatchObject({ done: true });
    expect(events.filter((event) => event.done)).toHaveLength(1);

    expect(fs.files()).toContain(engineBinaryPath(TARGET, 'win32'));
    expect(fs.files()).toContain(path.join(TARGET, 'cudart64_12.dll'));
    // Windows has no exec bit to set.
    expect(fs.chmods()).toEqual([]);
  });
});

describe('llamacpp download — platform and architecture pick the asset', () => {
  it('installs the arm64 tarball on Apple Silicon, through the tar extractor', async () => {
    const { part, events, fs, fetch, extractor } = harness(DARWIN_ARM64, {
      script: () => ({ chunks: [1_000] }),
      layout: LINUX_LAYOUT,
    });

    await part.download();
    await tick();

    expect(fetch.urls).toHaveLength(1);
    expect(fetch.urls[0]).toMatch(/-bin-macos-arm64\.tar\.gz$/);
    // `extract-zip` cannot open a tarball — the format dispatch is the whole
    // reason a macOS install can work at all.
    expect(extractor.calls.map((call) => call.via)).toEqual(['tar']);

    expect(events.at(-1)).toMatchObject({ done: true });
    expect(events.at(-1)?.error).toBeUndefined();
    expect(fs.files()).toContain(engineBinaryPath(TARGET, 'darwin'));
    expect(fs.chmods()).toEqual([
      { target: path.join(UNPACK, 'build', 'bin', 'llama-server'), mode: 0o755 },
    ]);
    expect(await part.status()).toBe('installed-stopped');
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
  });

  it('installs the x64 tarball on an Intel Mac — the same build id, a different asset', async () => {
    const { part, fetch } = harness(
      { ...DARWIN_ARM64, arch: 'x64', gpuFactsFn: async () => null },
      { script: () => ({ chunks: [1_000] }), layout: LINUX_LAYOUT },
    );

    const plan = await part.plan();
    await part.download();
    await tick();

    expect(plan.build?.id).toBe('macos');
    expect(fetch.urls[0]).toMatch(/-bin-macos-x64\.tar\.gz$/);
    expect(fetch.urls[0]).not.toMatch(/arm64/);
  });

  it('gives Windows on ARM the native arm64 build, not the x64 one', async () => {
    const { part, events, fs, fetch, extractor } = harness(
      { ...WIN32_CUDA, arch: 'arm64' },
      { script: () => ({ chunks: [1_000] }), layout: () => ['llama-server.exe'] },
    );

    const plan = await part.plan();
    // No arm64 CUDA or vulkan asset exists — the NVIDIA card downgrades all
    // the way to cpu rather than the machine being handed an x64 archive.
    expect(plan.build?.id).toBe('cpu');
    expect(plan.build?.options).toEqual(['cpu']);
    expect(plan.downloadMb).toBe(11);

    await part.download();
    await tick();

    expect(fetch.urls[0]).toMatch(/-bin-win-cpu-arm64\.zip$/);
    expect(extractor.calls.map((call) => call.via)).toEqual(['zip']);
    expect(events.at(-1)).toMatchObject({ done: true });
    expect(fs.files()).toContain(engineBinaryPath(TARGET, 'win32'));
  });
});

describe('llamacpp download — cancel', () => {
  it('leaves no staging directory, no engine, and a status of absent', async () => {
    const { part, events, fs } = harness(LINUX_CPU, {
      script: () => ({ chunks: [2 * MB], hold: true }),
      layout: LINUX_LAYOUT,
    });

    const { downloadId } = await part.download();
    await tick();
    expect(fs.dirs().some((dir) => under(STAGING, dir))).toBe(true);

    await part.cancel(downloadId);
    await tick();

    const final = events.at(-1);
    expect(final).toMatchObject({ done: true, error: 'cancelled' });
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
    expect(fs.files().filter((file) => under(STAGING, file))).toEqual([]);
    expect(await part.status()).toBe('absent');
    // The partial archive's sink was closed before its directory was removed —
    // deleting a file whose handle is still open is a no-op on Windows.
    expect(fs.allSinksClosedOnRemove(STAGING)).toBe(true);

    const seen = events.length;
    await tick();
    expect(events.length).toBe(seen); // nothing follows `done: true`
  });

  it('changes nothing for an unknown download id', async () => {
    const { part } = harness(LINUX_CPU, { script: () => ({ chunks: [] }), layout: () => [] });
    await expect(part.cancel('not-a-real-id')).resolves.toBeUndefined();
  });
});

describe('llamacpp download — failure', () => {
  it('reports a closed code and leaves nothing behind when the stream breaks', async () => {
    const { part, events, fs } = harness(LINUX_CPU, {
      script: () => ({ chunks: [2 * MB], failAfterChunks: true }),
      layout: LINUX_LAYOUT,
    });

    await part.download();
    await tick();

    const final = events.at(-1);
    expect(final?.done).toBe(true);
    expect(typeof final?.error).toBe('string');
    // Never the raw network message — only a closed `IpcError` code.
    expect(final?.error).not.toMatch(/socket/i);
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
    expect(fs.files()).not.toContain(engineBinaryPath(TARGET, 'linux'));
    expect(await part.status()).toBe('absent');
    expect(fs.allSinksClosedOnRemove(STAGING)).toBe(true);
  });

  it('reports a closed code for a non-2xx response and creates no engine', async () => {
    const { part, events, fs } = harness(LINUX_CPU, {
      script: () => ({ status: 503, chunks: [] }),
      layout: LINUX_LAYOUT,
    });

    await part.download();
    await tick();

    expect(events.at(-1)).toMatchObject({ done: true, error: 'io' });
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
    expect(await part.status()).toBe('absent');
  });

  it('fails honestly when the archive held no engine binary', async () => {
    const { part, events, fs } = harness(LINUX_CPU, {
      script: () => ({ chunks: [1_000] }),
      layout: () => ['readme.txt'],
    });

    await part.download();
    await tick();

    expect(events.at(-1)).toMatchObject({ done: true, error: 'io' });
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
    expect(await part.status()).toBe('absent');
  });
});

describe('llamacpp download — reinstall', () => {
  it('replaces an installed engine without a moment in which none exists', async () => {
    const { part, fs } = harness(LINUX_CPU, {
      script: () => ({ chunks: [1_000] }),
      layout: LINUX_LAYOUT,
      seed: { files: [engineBinaryPath(TARGET, 'linux'), path.join(TARGET, 'old-marker')] },
    });

    expect(await part.status()).toBe('installed-stopped');
    await part.download();
    await tick();

    expect(await part.status()).toBe('installed-stopped');
    expect(fs.files()).toContain(path.join(TARGET, 'libggml.so'));
    // The engine that was replaced went away with the staging root.
    expect(fs.files()).not.toContain(path.join(TARGET, 'old-marker'));
    expect(fs.dirs().filter((dir) => under(STAGING, dir))).toEqual([]);
  });
});
