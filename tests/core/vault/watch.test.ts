/**
 * Zwei Ebenen: der Debounce wird mit falschen Zeitgebern exakt geprueft, der Watcher
 * selbst in einem echten temporaeren Ordner mit kurzem Debounce.
 */

import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WATCH_DEBOUNCE_MS, createBatcher, isIgnoredPath, watchVault } from '@core/vault/watch';

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
    const watcher = watchVault(root, (paths) => batches.push(paths), { debounceMs: 80 });
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
      { timeout: 8000, interval: 40 },
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
  }, 15000);

  it('reports a file written in chunks only once it is complete', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sb-watch-'));
    roots.push(root);
    await mkdir(join(root, 'inbox'), { recursive: true });
    await mkdir(join(root, '.secondbrain', 'index'), { recursive: true });

    const filePath = join(root, 'inbox', 'chunked.md');
    const chunks = ['erster teil\n', 'zweiter teil\n', 'dritter teil\n'];
    const reportsForFile: string[][] = [];
    const contentsWhenReported: string[] = [];

    const watcher = watchVault(
      root,
      (paths) => {
        if (paths.includes('inbox/chunked.md')) {
          reportsForFile.push(paths);
          void readFile(filePath, 'utf8').then((content) => {
            contentsWhenReported.push(content);
          });
        }
      },
      { debounceMs: 50, writeStabilityMs: 400 },
    );
    await watcher.whenReady();

    for (const chunk of chunks) {
      await appendFile(filePath, chunk, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await vi.waitFor(
      () => {
        expect(reportsForFile.length).toBeGreaterThan(0);
      },
      { timeout: 8000, interval: 40 },
    );

    expect(reportsForFile).toHaveLength(1);
    await vi.waitFor(
      () => {
        expect(contentsWhenReported).toHaveLength(1);
      },
      { timeout: 2000, interval: 20 },
    );
    expect(contentsWhenReported[0]).toBe(chunks.join(''));

    await watcher.dispose();
  }, 15000);
});
