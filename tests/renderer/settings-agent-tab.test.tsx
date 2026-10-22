// @vitest-environment jsdom
/* The Agent tab's CLI status: every state says what it knows, and a lookup that
   could not decide shows its reason instead of an empty section. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@renderer/i18n';
import { api } from '@renderer/lib/api';
import { AgentTab } from '@renderer/screens/settings/AgentTab';

vi.mock('@renderer/lib/api', () => ({
  api: {
    agent: { cliStatus: vi.fn(), setupStatus: vi.fn() },
    /* Not ready: the setup panel stays on its skeleton and these tests keep to the CLI panel. */
    vault: { status: vi.fn().mockResolvedValue({ ready: false, indexing: false }) },
    shell: { openExternal: vi.fn() },
  },
}));

/* The terminal section has buttons of its own; these tests assert the CLI panel's button count. */
vi.mock('@renderer/screens/settings/agent/AgentTerminalSection', () => ({
  AgentTerminalSection: () => null,
}));

function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AgentTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('agent tab cli status', () => {
  it('an unknown CLI status shows the reason instead of a blank section', async () => {
    vi.mocked(api.agent.cliStatus).mockResolvedValue({ state: 'unknown', reason: 'timeout' });
    const first = show();
    expect(await screen.findByText('Status unknown: the lookup timed out.')).toBeTruthy();
    expect(screen.queryByText(/is installed/)).toBeNull();
    expect(screen.queryByText(/was not found/)).toBeNull();
    first.unmount();

    vi.mocked(api.agent.cliStatus).mockResolvedValue({
      state: 'unknown',
      reason: 'lookup-error',
      code: 'EACCES',
    });
    show();
    expect(await screen.findByText('Status unknown: the lookup failed (EACCES).')).toBeTruthy();
    expect(screen.queryByText(/is installed/)).toBeNull();
    expect(screen.queryByText(/was not found/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a failed query reads as unknown, never blank', async () => {
    vi.mocked(api.agent.cliStatus).mockRejectedValue(new Error('boom'));
    show();
    expect(await screen.findByText('Status unknown: the lookup failed.')).toBeTruthy();
    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it('an installed CLI shows its path and no button', async () => {
    vi.mocked(api.agent.cliStatus).mockResolvedValue({
      state: 'installed',
      path: 'C:\\bin\\claude',
    });
    show();
    expect(await screen.findByText('Claude Code is installed.')).toBeTruthy();
    expect(screen.getByText('C:\\bin\\claude')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('an absent CLI offers only the installation guide', async () => {
    vi.mocked(api.agent.cliStatus).mockResolvedValue({ state: 'absent' });
    vi.mocked(api.shell.openExternal).mockResolvedValue(undefined);
    show();
    const button = await screen.findByRole('button', { name: 'Open installation guide' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    button.click();
    expect(api.shell.openExternal).toHaveBeenCalledWith('https://code.claude.com/docs/en/setup');
  });
});
