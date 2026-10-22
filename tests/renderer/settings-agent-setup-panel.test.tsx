// @vitest-environment jsdom
/* The Agent tab's setup panel: it lists every managed file with its status, and
   a failed read says why instead of leaving the panel blank. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@renderer/i18n';
import { api } from '@renderer/lib/api';
import { encodeIpcError } from '@renderer/lib/ipc-error';
import { AgentSetupPanel } from '@renderer/screens/settings/agent/AgentSetupPanel';
import type { AgentSetupState } from '@shared/types';

vi.mock('@renderer/lib/api', () => ({
  api: {
    agent: { setupStatus: vi.fn() },
    vault: { status: vi.fn() },
  },
}));

const EMPTY_PLAN = { write: [], optIn: [], leave: [], dirs: [] };

function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AgentSetupPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
  vi.clearAllMocks();
  vi.mocked(api.vault.status).mockResolvedValue({ ready: true, indexing: false } as never); // only `ready`/`indexing` are read
});

afterEach(cleanup);

describe('agent setup panel', () => {
  it('shows a skeleton until the state arrives', () => {
    vi.mocked(api.agent.setupStatus).mockReturnValue(new Promise(() => undefined));
    show();
    expect(screen.getByRole('status', { name: 'Reading the setup files' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a failed read says why, in the decoded message rather than the wire form', async () => {
    vi.mocked(api.agent.setupStatus).mockRejectedValue(
      encodeIpcError({ code: 'io', message: 'vault is locked' }),
    );
    show();
    const text = (await screen.findByRole('alert')).textContent ?? '';
    expect(text).toContain('vault is locked');
    expect(text).not.toContain('SB_IPC_ERROR');
  });

  it('a current setup lists its files and offers no action', async () => {
    const state: AgentSetupState = {
      files: [
        { path: 'CLAUDE.md', status: 'current', installedVersion: 2, shippedVersion: 2 },
        {
          path: '.claude/skills/mine/SKILL.md',
          status: 'yours',
          installedVersion: null,
          shippedVersion: null,
        },
      ],
      action: 'none',
      plan: EMPTY_PLAN,
    };
    vi.mocked(api.agent.setupStatus).mockResolvedValue(state);
    show();
    const row = (await screen.findByText('CLAUDE.md')).closest('li') as HTMLElement;
    expect(within(row).getByText('Current')).toBeTruthy();
    expect(within(row).getByText('v2 → v2')).toBeTruthy();
    expect(screen.getByText('Yours')).toBeTruthy();
    expect(screen.getByText('Setup is current.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an outdated file offers the update', async () => {
    vi.mocked(api.agent.setupStatus).mockResolvedValue({
      files: [{ path: 'CLAUDE.md', status: 'outdated', installedVersion: 1, shippedVersion: 2 }],
      action: 'update',
      plan: EMPTY_PLAN,
    });
    show();
    expect(await screen.findByRole('button', { name: 'Update' })).toBeTruthy();
    expect(screen.getByText('Outdated')).toBeTruthy();
  });
});
