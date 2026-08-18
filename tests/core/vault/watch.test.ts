/**
 * Zwei Ebenen: der Debounce wird mit falschen Zeitgebern exakt geprueft, der Watcher
 * selbst in einem echten temporaeren Ordner mit kurzem Debounce.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});
