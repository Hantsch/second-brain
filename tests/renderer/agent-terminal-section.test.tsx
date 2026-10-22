// @vitest-environment jsdom
/* The Agent tab's Terminal section: what blocks it is said in the section, a launch
   sends exactly the chosen intent, and the outcome stays visible as text. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@renderer/i18n';
import { api } from '@renderer/lib/api';
import { AgentTerminalSection } from '@renderer/screens/settings/agent/AgentTerminalSection';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import type { AgentCliStatus, AgentSetupState } from '@shared/types';

vi.mock('@renderer/lib/api', () => ({
  api: {
    agent: { cliStatus: vi.fn(), setupStatus: vi.fn(), launchTerminal: vi.fn() },
    vault: { status: vi.fn() },
    modules: { list: vi.fn() },
  },
}));

const EMPTY_PLAN = { write: [], optIn: [], leave: [], dirs: [] };
const HELP_CURRENT = { status: 'current', installedVersion: 1, shippedVersion: 1 } as const;

function setup(status: 'current' | 'missing'): AgentSetupState {
  return {
    files: [{ path: 'CLAUDE.md', status, installedVersion: 1, shippedVersion: 1 }],
    action: status === 'missing' ? 'install' : 'none',
    plan: EMPTY_PLAN,
    help: HELP_CURRENT,
  };
}

function module(slug: string, title: string) {
  return { slug, title };
}

function arrange(cli: AgentCliStatus, setupState = setup('current')) {
  vi.mocked(api.agent.cliStatus).mockResolvedValue(cli);
  vi.mocked(api.agent.setupStatus).mockResolvedValue(setupState);
}

function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AgentTerminalSection />
    </QueryClientProvider>,
  );
}

const BUTTONS = ['Open Claude in the vault', 'Work the jobs', 'Curate a module'];

beforeEach(() => {
  setLanguage('en');
  vi.clearAllMocks();
  vi.mocked(api.vault.status).mockResolvedValue({
    root: 'v',
    ready: true,
    indexing: false,
  } as never); // only `ready`/`indexing` are read
  vi.mocked(api.modules.list).mockResolvedValue([
    module(HELP_MODULE_SLUG, 'Gaston help'),
    module('cooking', 'Cooking'),
  ] as never); // only `slug`/`title` are read
});

afterEach(cleanup);

describe('agent terminal section', () => {
  it('with the cli absent or unknown all three buttons are disabled and the section says why', async () => {
    arrange({ state: 'absent' });
    const first = show();
    expect(await screen.findByText(/Claude Code was not found/)).toBeTruthy();
    for (const name of BUTTONS) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    first.unmount();

    arrange({ state: 'unknown', reason: 'timeout' });
    show();
    expect(await screen.findByText(/Whether Claude Code is installed is unknown/)).toBeTruthy();
    for (const name of BUTTONS) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('missing setup files block the buttons and name the next step', async () => {
    arrange({ state: 'installed', path: 'claude' }, setup('missing'));
    show();
    expect(await screen.findByText(/Setup files are missing/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Work the jobs' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('a ready section sends the chosen intent and never offers the help module', async () => {
    arrange({ state: 'installed', path: 'claude' });
    vi.mocked(api.agent.launchTerminal).mockResolvedValue({ ok: true, terminal: 'powershell' });
    show();
    const open = await screen.findByRole('button', { name: BUTTONS[0] });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));

    const picker = screen.getByLabelText('Module to curate') as HTMLSelectElement;
    expect(within(picker).queryByText('Gaston help')).toBeNull();
    expect(within(picker).getByText('Cooking')).toBeTruthy();
    const curate = screen.getByRole('button', { name: BUTTONS[2] }) as HTMLButtonElement;
    expect(curate.disabled).toBe(true);

    fireEvent.click(open);
    await waitFor(() =>
      expect(api.agent.launchTerminal).toHaveBeenLastCalledWith({ kind: 'open' }),
    );
    expect((await screen.findByRole('status')).textContent).toBe('Opened in PowerShell.');

    fireEvent.click(screen.getByRole('button', { name: BUTTONS[1] }));
    await waitFor(() =>
      expect(api.agent.launchTerminal).toHaveBeenLastCalledWith({ kind: 'jobs' }),
    );

    fireEvent.change(picker, { target: { value: 'cooking' } });
    expect(curate.disabled).toBe(false);
    fireEvent.click(curate);
    await waitFor(() =>
      expect(api.agent.launchTerminal).toHaveBeenLastCalledWith({
        kind: 'curate',
        module: 'cooking',
      }),
    );
    expect(api.agent.launchTerminal).toHaveBeenCalledTimes(3);
  });

  it('a failed launch shows the reason in the section', async () => {
    arrange({ state: 'installed', path: 'claude' });
    vi.mocked(api.agent.launchTerminal).mockResolvedValue({
      ok: false,
      reason: 'no-terminal',
      detail: 'ENOENT',
    });
    const view = show();
    const open = await screen.findByRole('button', { name: BUTTONS[0] });
    await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(open);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('ENOENT');
    expect(view.container.contains(alert)).toBe(true);
  });

  it('without a module the curate action says there is nothing to pick', async () => {
    arrange({ state: 'installed', path: 'claude' });
    vi.mocked(api.modules.list).mockResolvedValue([
      module(HELP_MODULE_SLUG, 'Gaston help'),
    ] as never);
    show();
    expect(await screen.findByText('There is no module to curate yet.')).toBeTruthy();
    expect((screen.getByRole('button', { name: BUTTONS[2] }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
