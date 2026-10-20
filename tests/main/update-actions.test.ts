/* Staged update actions: download, cancel, install behind the restart guard,
   and the session-only dismiss. The backend is a fake; the restart guard is the
   real one over the real work queue and LLM stream registry. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateProgress, UpdateState } from '../../src/shared/types/update';
import type { Services } from '../../src/main/services';
import type { DownloadOutcome, UpdateBackend } from '../../src/main/update/backend';
import type { UpdateDistribution } from '../../src/shared/types/update';
import { llmStreams } from '../../src/main/ipc/llm-stream';
import { restartBlocker } from '../../src/main/update/restart-blocker';
import { createUpdateService } from '../../src/main/update/service';
import { loadUpdateRecord } from '../../src/main/update/store';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';

const OFFER = { version: '1.3.0', notes: 'Fixes.', releasedAt: null };
const services = { sendEvent: () => undefined } as unknown as Services;

let dir = '';
const openStreams: Array<{ end: () => void }> = [];

interface FakeBackend extends UpdateBackend {
  download: ReturnType<typeof vi.fn<UpdateBackend['download']>>;
  quitAndInstall: ReturnType<typeof vi.fn<() => void>>;
  progress(progress: UpdateProgress): void;
  finish(outcome: DownloadOutcome): void;
}

/** A download that runs until the test ends it; an abort ends it as cancelled, like the real one. */
function fakeBackend(): FakeBackend {
  let onProgress: (progress: UpdateProgress) => void = () => undefined;
  let finish: (outcome: DownloadOutcome) => void = () => undefined;
  return {
    // Starts `true` so the test proves the service is what switches it off.
    autoInstallOnAppQuit: true,
    download: vi.fn((signal: AbortSignal, report: (progress: UpdateProgress) => void) => {
      onProgress = report;
      return new Promise<DownloadOutcome>((resolve) => {
        finish = resolve;
        signal.addEventListener('abort', () => resolve({ kind: 'failed', reason: 'cancelled' }));
      });
    }),
    quitAndInstall: vi.fn(),
    progress: (progress) => onProgress(progress),
    finish: (outcome) => finish(outcome),
  };
}

async function offered(distribution: UpdateDistribution = 'installed') {
  const backend = fakeBackend();
  const states: UpdateState[] = [];
  const service = createUpdateService({
    dir,
    check: () => Promise.resolve({ kind: 'available', ...OFFER }),
    currentVersion: '1.2.0',
    distribution,
    isSupported: () => ({ supported: true, disabledReason: null }),
    onStateChange: (state) => states.push(state),
    backend,
    restartBlocker: () => restartBlocker(services),
  });
  await service.check({ manual: true });
  return { service, backend, states };
}

async function downloadStarted(backend: FakeBackend): Promise<void> {
  await vi.waitFor(() => expect(backend.download).toHaveBeenCalled());
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gaston-update-actions-'));
});

afterEach(async () => {
  getWorkQueue(services).clear();
  resetWorkQueue();
  for (const stream of openStreams.splice(0)) stream.end();
  await rm(dir, { recursive: true, force: true });
});

describe('update download', () => {
  it('download reports progress and ends in downloaded', async () => {
    const { service, backend, states } = await offered();
    expect((await service.getState()).phase).toBe('available');
    expect((await service.getState()).releaseUrl).toBe(
      'https://github.com/Hantsch/second-brain/releases/tag/v1.3.0',
    );

    const result = service.startDownload();
    await downloadStarted(backend);
    expect((await service.getState()).phase).toBe('downloading');
    backend.progress({ ratio: 0.5, bytesDone: 50, bytesTotal: 100 });
    expect(states.at(-1)).toMatchObject({
      phase: 'downloading',
      progress: { ratio: 0.5, bytesDone: 50, bytesTotal: 100 },
    });

    backend.finish({ kind: 'done' });
    const done = await result;
    expect(done.ok).toBe(true);
    expect(done.state).toMatchObject({ phase: 'downloaded', progress: null, downloadError: null });
    expect(states.at(-1)?.phase).toBe('downloaded');
  });

  it('cancel returns to available and installs nothing', async () => {
    const { service, backend } = await offered();
    const result = service.startDownload();
    await downloadStarted(backend);

    const cancelled = await service.cancelDownload();
    expect(cancelled.state).toMatchObject({
      phase: 'available',
      downloadError: 'update.error.download.cancelled',
      progress: null,
    });
    expect(await result).toMatchObject({ ok: false, error: 'update.error.download.cancelled' });

    const install = await service.installAndRestart();
    expect(install).toMatchObject({ ok: false, error: 'update.error.notReady' });
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
  });

  it('a failed download returns to available with its reason', async () => {
    const { service, backend } = await offered();
    const recordBefore = await loadUpdateRecord(dir);
    const result = service.startDownload();
    await downloadStarted(backend);
    backend.finish({ kind: 'failed', reason: 'checksum' });

    const failed = await result;
    expect(failed).toMatchObject({ ok: false, error: 'update.error.download.checksum' });
    expect(failed.state).toMatchObject({
      phase: 'available',
      downloadError: 'update.error.download.checksum',
      update: OFFER,
    });
    expect(await loadUpdateRecord(dir)).toEqual(recordBefore);

    // Still offerable: a second attempt starts and clears the old reason.
    const retry = service.startDownload();
    await vi.waitFor(() => expect(backend.download).toHaveBeenCalledTimes(2));
    expect((await service.getState()).downloadError).toBeNull();
    backend.finish({ kind: 'done' });
    expect((await retry).state.phase).toBe('downloaded');
  });

  it('a stale download reason is dropped when a different version is offered', async () => {
    const backend = fakeBackend();
    let offer = OFFER;
    const service = createUpdateService({
      dir,
      check: () => Promise.resolve({ kind: 'available', ...offer }),
      currentVersion: '1.2.0',
      distribution: 'installed',
      isSupported: () => ({ supported: true, disabledReason: null }),
      backend,
    });
    await service.check({ manual: true });
    const result = service.startDownload();
    await downloadStarted(backend);
    backend.finish({ kind: 'failed', reason: 'offline' });
    await result;

    // The same version re-checked keeps the reason; a newer one does not inherit it.
    expect((await service.check({ manual: true })).downloadError).toBe(
      'update.error.download.offline',
    );
    offer = { ...OFFER, version: '1.4.0' };
    const next = await service.check({ manual: true });
    expect(next.update?.version).toBe('1.4.0');
    expect(next.downloadError).toBeNull();
  });

  it('download is refused on the portable build', async () => {
    const { service, backend } = await offered('portable');
    const result = await service.startDownload();
    expect(result).toMatchObject({ ok: false, error: 'update.error.notInstallable' });
    expect(result.state.phase).toBe('available');
    expect(backend.download).not.toHaveBeenCalled();
  });
});

describe('update install', () => {
  it('install is refused before the download finished', async () => {
    const { service, backend } = await offered();
    expect(await service.installAndRestart()).toMatchObject({
      ok: false,
      error: 'update.error.notReady',
    });
    void service.startDownload();
    await downloadStarted(backend);
    expect(await service.installAndRestart()).toMatchObject({
      ok: false,
      error: 'update.error.notReady',
    });
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
    await service.cancelDownload();
  });

  it('install is refused while a task runs or an LLM streams and cancels neither', async () => {
    const { service, backend } = await offered();
    const ready = service.startDownload();
    await downloadStarted(backend);
    backend.finish({ kind: 'done' });
    await ready;

    getWorkQueue(services).enqueue(
      { kind: 'condense', lane: 'model', subject: { label: 'running', ref: null } },
      () => new Promise(() => undefined),
    );
    expect(await service.installAndRestart()).toMatchObject({
      ok: false,
      error: 'update.error.taskRunning',
      state: { phase: 'downloaded' },
    });
    expect(
      getWorkQueue(services)
        .list()
        .map((task) => task.state),
    ).toEqual(['running']);
    getWorkQueue(services).clear();
    resetWorkQueue();

    const stream = llmStreams(services).begin('t1', 'm1');
    openStreams.push(stream);
    expect(await service.installAndRestart()).toMatchObject({
      ok: false,
      error: 'update.error.llmStreaming',
    });
    expect(restartBlocker(services)).toBe('llmStreaming');
    expect(backend.quitAndInstall).not.toHaveBeenCalled();

    stream.end();
    expect(await service.installAndRestart()).toMatchObject({ ok: true });
    expect(backend.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('a downloaded update does not install itself on quit', async () => {
    const backend = fakeBackend();
    createUpdateService({
      dir,
      check: () => Promise.resolve({ kind: 'up-to-date' }),
      currentVersion: '1.2.0',
      distribution: 'installed',
      isSupported: () => ({ supported: true, disabledReason: null }),
      backend,
    });
    expect(backend.autoInstallOnAppQuit).toBe(false);

    // Something flipped it after construction: the download must switch it off again.
    const setup = await offered();
    setup.backend.autoInstallOnAppQuit = true;
    const result = setup.service.startDownload();
    await downloadStarted(setup.backend);
    expect(setup.backend.autoInstallOnAppQuit).toBe(false);
    setup.backend.finish({ kind: 'done' });
    expect((await result).state.phase).toBe('downloaded');
    expect(setup.backend.autoInstallOnAppQuit).toBe(false);
    expect(setup.backend.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe('update dismiss', () => {
  it('dismiss is session-only', async () => {
    const { service } = await offered();
    const result = await service.dismiss();
    expect(result).toMatchObject({ ok: true, state: { dismissed: true, phase: 'available' } });

    const restarted = await offered();
    expect((await restarted.service.getState()).dismissed).toBe(false);
  });
});
