// @vitest-environment jsdom
/* The About tab's notes of the running version: rendered as text-safe
   markdown, an honest empty state when there are none, links that leave the
   app through the system browser. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGELOG_URL, PROJECT_URL } from '@shared/release';
import type { UpdateState } from '@shared/types';
import { InstalledNotesPanel } from '@renderer/screens/settings/about/InstalledNotesPanel';
import { PendingUpdateBlock } from '@renderer/screens/settings/about/PendingUpdateBlock';
import { UpdatesPanel } from '@renderer/screens/settings/UpdatesPanel';
import { setLanguage } from '@renderer/i18n';
import { api } from '@renderer/lib/api';
import { qk } from '@renderer/lib/queries/keys';

vi.mock('@renderer/lib/api', () => ({
  api: {
    app: { releaseNotes: vi.fn() },
    shell: { openExternal: vi.fn() },
    update: {
      state: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      cancelDownload: vi.fn(),
      installAndRestart: vi.fn(),
    },
  },
}));

function show(markdown: string | null) {
  vi.mocked(api.app.releaseNotes).mockResolvedValue({ version: '1.4.0', markdown });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <InstalledNotesPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
  vi.clearAllMocks();
  vi.mocked(api.shell.openExternal).mockResolvedValue(undefined);
});

describe('about release notes', () => {
  it("renders the running version's notes as headings and list items", async () => {
    show('### Added\n\n- Faster search.');
    expect(await screen.findByRole('heading', { name: "What's new in 1.4.0" })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Added' })).toBeTruthy();
    expect(screen.getByRole('listitem').textContent).toBe('Faster search.');
  });

  it('a raw HTML line in the notes renders as text and adds no img element', async () => {
    const { container } = show('### Added\n\n<img src=x onerror=alert(1)>\n');
    await screen.findByRole('heading', { name: 'Added' });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('null notes show the empty state and keep the changelog link', async () => {
    show(null);
    expect(await screen.findByText('No release notes for this version')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Full changelog' })).toBeTruthy();
  });

  it('the links call shell.openExternal with the project and changelog URLs', async () => {
    show('- one');
    fireEvent.click(await screen.findByRole('button', { name: 'Project page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Full changelog' }));
    expect(api.shell.openExternal).toHaveBeenNthCalledWith(1, PROJECT_URL);
    expect(api.shell.openExternal).toHaveBeenNthCalledWith(2, CHANGELOG_URL);
  });
});

const baseState: UpdateState = {
  phase: 'idle',
  status: 'up-to-date',
  supported: true,
  disabledReason: null,
  distribution: 'installed',
  currentVersion: '1.0.0',
  update: null,
  error: null,
  lastCheckedAt: null,
  lastSuccessAt: null,
  progress: null,
  dismissed: false,
  downloadError: null,
  releaseUrl: null,
};

const offered: Partial<UpdateState> = {
  phase: 'available',
  status: 'available',
  update: { version: '2.0.0', notes: '### Added\n\n- Quiet updates.', releasedAt: null },
};

function showUpdate(state: Partial<UpdateState>) {
  vi.mocked(api.update.state).mockResolvedValue({ ...baseState, ...state });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UpdatesPanel />
      <PendingUpdateBlock />
    </QueryClientProvider>,
  );
  return client;
}

describe('about pending update', () => {
  it('a pending update shows its version, the not yet installed badge and its notes', async () => {
    showUpdate(offered);
    expect((await screen.findByTestId('about-pending-version')).textContent).toBe('2.0.0');
    expect(screen.getByText('Not yet installed')).toBeTruthy();
    expect(screen.getByText('Quiet updates.')).toBeTruthy();
  });

  it('an offer without notes says there are none', async () => {
    showUpdate({ ...offered, update: { version: '2.0.0', notes: ' ', releasedAt: null } });
    await screen.findByTestId('about-pending-version');
    expect(screen.getByText('No release notes for this version')).toBeTruthy();
  });

  it('the pending block is absent when up to date', async () => {
    showUpdate({});
    await screen.findByTestId('update-status');
    expect(screen.queryByTestId('about-pending-update')).toBeNull();
  });

  it('the pending block uses the shared update action', async () => {
    showUpdate(offered);
    await screen.findByTestId('about-pending-version');
    expect(screen.getByTestId('update-action')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download update' })).toBeTruthy();
  });
});

describe('about update check', () => {
  it('never checked renders the never-checked text and no time element', async () => {
    showUpdate({});
    expect(await screen.findByText('Never checked')).toBeTruthy();
    expect(document.querySelector('time')).toBeNull();
  });

  it('a recorded check renders as a relative time', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    showUpdate({ lastCheckedAt: threeDaysAgo });
    await screen.findByTestId('update-status');
    expect(document.querySelector('time')?.textContent).toBe('3 days ago');
    expect(screen.queryByText('Never checked')).toBeNull();
  });

  it('check now calls the manual check once and shows a failure reason', async () => {
    const failed: UpdateState = { ...baseState, status: 'error', error: 'network' };
    const client = showUpdate({});
    vi.mocked(api.update.check).mockImplementation(() => {
      // Main pushes the new state through an event; the test stands in for it.
      client.setQueryData(qk.update.state(), failed);
      return Promise.resolve(failed);
    });
    const button = await screen.findByRole('button', { name: 'Check now' });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId('about-update-outcome').textContent).toContain(
        'The release server could not be reached.',
      ),
    );
    expect(api.update.check).toHaveBeenCalledTimes(1);
  });
});
