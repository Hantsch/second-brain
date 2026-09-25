// @vitest-environment jsdom
/* IndexStatsCard (054, D6): the honest note for files the index only knows by
 * name. `IndexStats.oversized` (D5) lists vault paths for files > 2 MiB that
 * were never read — this card must say so and name them, or say nothing at
 * all when the list is empty. No filesystem, no network: the bridge is a
 * stub returning a fixed `IndexStats`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { IndexStats } from '@shared/ipc';
import { IndexStatsCard } from '@renderer/components/IndexStatsCard';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

function baseStats(overrides: Partial<IndexStats> = {}): IndexStats {
  return {
    docs: 42,
    todos: 5,
    projects: 3,
    modules: 2,
    pages: 7,
    words: 12345,
    builtAt: '2026-09-20T10:00:00.000Z',
    durationMs: 120,
    oversized: [],
    ...overrides,
  };
}

function renderCard(stats: IndexStats) {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'index:stats') return stats;
    throw new Error(`unexpected channel: ${channel}`);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IndexStatsCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
});

afterEach(() => {
  delete window.sb;
});

describe('IndexStatsCard: oversized files', () => {
  it('names files too large to index', async () => {
    renderCard(
      baseStats({
        oversized: ['sources/big-recording.mp3', 'sources/archive.zip'],
      }),
    );

    expect(
      await screen.findByText('2 files are larger than 2 MB and are indexed by name only.'),
    ).toBeTruthy();
    expect(screen.getByText('sources/big-recording.mp3')).toBeTruthy();
    expect(screen.getByText('sources/archive.zip')).toBeTruthy();
  });

  it('shows no note when nothing is oversized', async () => {
    renderCard(baseStats());

    await screen.findByText('Documents');
    expect(screen.queryByText(/are larger than 2 MB/)).toBeNull();
  });
});
