// @vitest-environment jsdom
/* The title-bar update control: one action per phase, refusals shown as a
   readable reason, portable builds never download. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateActionResult, UpdateState } from '@shared/types';
import { UpdateControl } from '@renderer/components/update/UpdateControl';
import { de } from '@renderer/i18n/de';
import { en } from '@renderer/i18n/en';
import { setLanguage } from '@renderer/i18n';
import { api } from '@renderer/lib/api';

vi.mock('@renderer/lib/api', () => ({
  api: {
    shell: { openExternal: vi.fn() },
    update: {
      state: vi.fn(),
      download: vi.fn(),
      cancelDownload: vi.fn(),
      installAndRestart: vi.fn(),
      dismiss: vi.fn(),
    },
  },
}));

const base: UpdateState = {
  phase: 'available',
  status: 'available',
  supported: true,
  disabledReason: null,
  distribution: 'installed',
  currentVersion: '1.0.0',
  update: { version: '1.2.3', notes: '', releasedAt: null },
  error: null,
  lastCheckedAt: null,
  lastSuccessAt: null,
  progress: null,
  dismissed: false,
  downloadError: null,
  releaseUrl: 'https://example.test/release',
};

function show(state: Partial<UpdateState>): void {
  vi.mocked(api.update.state).mockResolvedValue({ ...base, ...state });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <UpdateControl />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openDialog(): Promise<void> {
  fireEvent.click(await screen.findByTestId('update-control'));
}

beforeEach(() => {
  setLanguage('en');
  vi.clearAllMocks();
});
afterEach(() => setLanguage('en'));

describe('update control', () => {
  it('renders no control when idle or dismissed', async () => {
    show({ phase: 'idle', update: null });
    await waitFor(() => expect(api.update.state).toHaveBeenCalled());
    expect(screen.queryByTestId('update-control')).toBeNull();
  });

  it('renders no control when dismissed', async () => {
    show({ dismissed: true });
    await waitFor(() => expect(api.update.state).toHaveBeenCalled());
    expect(screen.queryByTestId('update-control')).toBeNull();
  });

  it('names the version', async () => {
    show({});
    expect((await screen.findByTestId('update-control')).textContent).toContain('1.2.3');
  });

  it.each([
    ['available', 'Download update'],
    ['downloaded', 'Restart and install'],
    ['downloading', 'Cancel'],
  ] as const)('offers one primary action in phase %s', async (phase, label) => {
    show({
      phase,
      progress: phase === 'downloading' ? { ratio: 0.4, bytesDone: 4, bytesTotal: 10 } : null,
    });
    await openDialog();
    const action = screen.getByTestId('update-action');
    expect(action.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
    if (phase === 'downloading') {
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    }
  });

  it('shows the reason of a refusal', async () => {
    const refused: UpdateActionResult = {
      ok: false,
      error: 'update.error.taskRunning',
      state: base,
    };
    vi.mocked(api.update.installAndRestart).mockResolvedValue(refused);
    show({ phase: 'downloaded' });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    expect((await screen.findByTestId('update-reason')).textContent).toBe(
      en['update.error.taskRunning'],
    );
  });

  it('maps a rejected call to the reason of its own action', async () => {
    vi.mocked(api.update.installAndRestart).mockRejectedValue(new Error('ipc'));
    show({ phase: 'downloaded' });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    expect((await screen.findByTestId('update-reason')).textContent).toBe(
      en['update.error.installFailed'],
    );
  });

  it('maps a rejected download to the download reason', async () => {
    vi.mocked(api.update.download).mockRejectedValue(new Error('ipc'));
    show({});
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
    expect((await screen.findByTestId('update-reason')).textContent).toBe(
      en['update.error.download.unknown'],
    );
  });

  it('shows a failed download as its reason', async () => {
    show({ downloadError: 'update.error.download.checksum' });
    await openDialog();
    expect(screen.getByTestId('update-reason').textContent).toBe(
      en['update.error.download.checksum'],
    );
  });

  it('opens the release page for a portable build and downloads nothing', async () => {
    vi.mocked(api.shell.openExternal).mockResolvedValue(undefined);
    show({ distribution: 'portable' });
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Open release page' }));
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://example.test/release');
    expect(api.update.download).not.toHaveBeenCalled();
  });

  it('dismisses with "Not now"', async () => {
    vi.mocked(api.update.dismiss).mockResolvedValue({ ok: true, state: base });
    show({});
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(api.update.dismiss).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('update error translations', () => {
  // Raw sources, because the renderer project has no Node types; vite inlines them.
  const sources = import.meta.glob('../../src/main/update/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const keys = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/'(update\.error\.[A-Za-z.]+[A-Za-z])'/g)) keys.add(m[1] ?? '');
  }
  // Download failures are built as `update.error.download.${failure}`.
  for (const failure of ['offline', 'checksum', 'cancelled', 'unknown']) {
    keys.add(`update.error.download.${failure}`);
  }

  it.each([...keys])('%s has a translation in both languages', (key) => {
    expect((de as Record<string, string>)[key]).toBeTruthy();
    expect((en as Record<string, string>)[key]).toBeTruthy();
  });
});
