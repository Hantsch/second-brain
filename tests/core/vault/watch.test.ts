/**
 * Zwei Ebenen: der Debounce wird mit falschen Zeitgebern exakt geprueft, der Watcher
 * selbst in einem echten temporaeren Ordner mit kurzem Debounce.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WATCH_DEBOUNCE_MS, createBatcher, isIgnoredPath, watchVault } from '@core/vault/watch';
import {
  WATCH_WRITE_POLL_MS,
  WATCH_WRITE_STABILITY_MS,
  createWriteStabilityGate,
} from '@core/vault/write-stability';

describe('createBatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('meldet erst nach 250 ms Ruhe und dann gebuendelt', () => {
    vi.useFakeTimers();
    const calls: string[][] = [];
    const batcher = createBatcher((paths) => calls.push(paths));

    batcher.add('inbox/b.md');
    vi.advanceTimersByTime(200);
    batcher.add('inbox/a.md');
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(calls).toEqual([['inbox/a.md', 'inbox/b.md']]);
  });

  it('meldet jeden Pfad nur einmal pro Bündel', () => {
    vi.useFakeTimers();
    const calls: string[][] = [];
    const batcher = createBatcher((paths) => calls.push(paths), 100);

    batcher.add('inbox/a.md');
    batcher.add('inbox/a.md');
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([['inbox/a.md']]);

    batcher.add('inbox/a.md');
    vi.advanceTimersByTime(100);
    expect(calls).toHaveLength(2);
  });

  it('schickt bei flush sofort und schluckt nach cancel', () => {
    vi.useFakeTimers();
    const calls: string[][] = [];
    const batcher = createBatcher((paths) => calls.push(paths));

    batcher.add('areas/x.md');
    batcher.flush();
    expect(calls).toEqual([['areas/x.md']]);

    batcher.add('areas/y.md');
    batcher.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(1);
  });

  it('flusht innerhalb der Maximalwartezeit bei anhaltendem Ereignisstrom', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const calls: string[][] = [];
    const flushTimes: number[] = [];
    const batcher = createBatcher(
      (paths) => {
        // eslint-disable-next-line no-restricted-syntax -- fake timers: Date.now() is the test's own clock here
        flushTimes.push(Date.now() - start);
        calls.push(paths);
      },
      250,
      2000,
    );

    const added: string[] = [];
    for (let elapsed = 0; elapsed < 5000; elapsed += 100) {
      const path = `inbox/${elapsed}.md`;
      added.push(path);
      batcher.add(path);
      vi.advanceTimersByTime(100);
    }
    batcher.flush();

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(flushTimes[0]).toBeLessThanOrEqual(2000);

    const reported = calls.flat();
    expect(reported.sort()).toEqual([...added].sort());
    expect(new Set(reported).size).toBe(reported.length);
  });

  it('ein einzelnes Ereignis flusht 250 ms danach, nicht erst bei der Maximalwartezeit', () => {
    vi.useFakeTimers();
    const calls: string[][] = [];
    const batcher = createBatcher((paths) => calls.push(paths), 250, 2000);

    batcher.add('inbox/a.md');
    vi.advanceTimersByTime(249);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(calls).toEqual([['inbox/a.md']]);

    vi.advanceTimersByTime(2000 - 250);
    expect(calls).toHaveLength(1);
  });
});

describe('isIgnoredPath', () => {
  it('laesst Vault-Inhalt durch und blendet Ableitungen aus', () => {
    expect(isIgnoredPath('inbox/a.md')).toBe(false);
    expect(isIgnoredPath('.secondbrain/settings.json')).toBe(false);
    expect(isIgnoredPath('.secondbrain/index/index.json')).toBe(true);
    expect(isIgnoredPath('.secondbrain\\trash\\20260810-1\\inbox\\a.md')).toBe(true);
    expect(isIgnoredPath('inbox/a.md.k3f.tmp')).toBe(true);
    expect(isIgnoredPath('C:/vault/node_modules/x/index.js')).toBe(true);
    expect(isIgnoredPath('C:\\vault\\.git\\HEAD')).toBe(true);
  });

  it('meldet Vorschlaege des Agenten, damit sie ohne Neustart erscheinen', () => {
    expect(isIgnoredPath('.secondbrain/agent/proposals/20261027-a.md')).toBe(false);
    expect(isIgnoredPath('.secondbrain/agent/resolved/20261027-a.md')).toBe(false);
  });
});

describe('watchVault', () => {
  const roots: string[] = [];

  afterEach(async () => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root !== undefined) await rm(root, { recursive: true, force: true });
    }
  });

  it('meldet mehrere Aenderungen als eine Liste und laesst sich schliessen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sb-watch-'));
    roots.push(root);
    await mkdir(join(root, 'inbox'), { recursive: true });
    await mkdir(join(root, '.secondbrain', 'index'), { recursive: true });

    const batches: string[][] = [];
    const watcher = watchVault(root, (paths) => batches.push(paths), {
      debounceMs: 80,
      writeStabilityMs: 50,
    });
    await watcher.whenReady();

    await writeFile(join(root, 'inbox', 'eins.md'), 'eins\n', 'utf8');
    await writeFile(join(root, 'inbox', 'zwei.md'), 'zwei\n', 'utf8');
    await writeFile(join(root, 'inbox', 'drei.md.tmp'), 'halb\n', 'utf8');
    await writeFile(join(root, '.secondbrain', 'index', 'index.json'), '{}\n', 'utf8');

    await vi.waitFor(
      () => {
        expect(batches.length).toBeGreaterThan(0);
        expect(batches.flat()).toContain('inbox/zwei.md');
      },
      { interval: 40, timeout: 10_000 },
    );

    const seen = batches.flat();
    expect(seen).toContain('inbox/eins.md');
    expect(seen).toContain('inbox/zwei.md');
    expect(seen.some((path) => path.endsWith('.tmp'))).toBe(false);
    expect(seen.some((path) => path.includes('.secondbrain'))).toBe(false);
    expect(seen.every((path) => !path.includes('\\'))).toBe(true);

    await watcher.dispose();
    const countAfterDispose = batches.length;
    await writeFile(join(root, 'inbox', 'vier.md'), 'vier\n', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(batches.length).toBe(countAfterDispose);
  });
});

describe('createWriteStabilityGate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a file written in chunks only once it is complete', async () => {
    vi.useFakeTimers();
    const path = 'inbox/chunked.md';
    const chunks = ['erster teil\n', 'zweiter teil\n', 'dritter teil\n'];
    let content = '';
    const reportsForFile: string[] = [];
    const contentsWhenReported: string[] = [];

    // No window argument: the product default is what is proven here.
    const gate = createWriteStabilityGate(
      (reported) => {
        reportsForFile.push(reported);
        contentsWhenReported.push(content);
      },
      () => Promise.resolve(content.length),
    );

    for (const chunk of chunks) {
      content += chunk;
      gate.touch(path);
      await vi.advanceTimersByTimeAsync(150);
    }
    await vi.advanceTimersByTimeAsync(WATCH_WRITE_STABILITY_MS + 2 * WATCH_WRITE_POLL_MS);

    expect(reportsForFile).toHaveLength(1);
    expect(contentsWhenReported[0]).toBe(chunks.join(''));
  });

  it('a file deleted while still being written is not reported', async () => {
    vi.useFakeTimers();
    let size: number | null = 12;
    const reported: string[] = [];
    const gate = createWriteStabilityGate(
      (path) => reported.push(path),
      () => Promise.resolve(size),
    );

    gate.touch('inbox/gone.md');
    await vi.advanceTimersByTimeAsync(150);
    size = null;
    await vi.advanceTimersByTimeAsync(WATCH_WRITE_STABILITY_MS + 2 * WATCH_WRITE_POLL_MS);
    expect(reported).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    // The deleted path left the pending set, so a recreated file is tracked afresh.
    size = 5;
    gate.touch('inbox/gone.md');
    await vi.advanceTimersByTimeAsync(WATCH_WRITE_STABILITY_MS + 2 * WATCH_WRITE_POLL_MS);
    expect(reported).toEqual(['inbox/gone.md']);
  });

  it('nothing is reported after cancel', async () => {
    vi.useFakeTimers();
    const reported: string[] = [];
    const heldStats: Array<(size: number) => void> = [];
    let slowStats = 0;
    const gate = createWriteStabilityGate(
      (path) => reported.push(path),
      (path) => {
        if (path !== 'inbox/slow.md') return Promise.resolve(10);
        slowStats += 1;
        // The poll that would complete the window stays in flight across cancel().
        if (slowStats < 4) return Promise.resolve(10);
        return new Promise((resolve) => heldStats.push(resolve));
      },
    );

    gate.touch('inbox/slow.md');
    await vi.advanceTimersByTimeAsync(3 * WATCH_WRITE_POLL_MS);
    gate.touch('inbox/fast.md');
    await vi.advanceTimersByTimeAsync(WATCH_WRITE_POLL_MS);
    expect(heldStats).toHaveLength(1);
    expect(reported).toEqual([]);

    gate.cancel();
    expect(vi.getTimerCount()).toBe(0);

    heldStats[0]?.(10);
    await vi.advanceTimersByTimeAsync(10 * WATCH_WRITE_STABILITY_MS);
    expect(reported).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
