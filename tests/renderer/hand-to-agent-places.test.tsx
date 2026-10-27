// @vitest-environment jsdom
/* Where a module or a gardener run can be handed to the agent: the module header, the
   gardener health card. The help module is never offered; a run with an audit is not
   offered either (main says so through `agentAudit`). */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import type { AgentJobView, GardenerReport, KnowledgeModule, VaultStatus } from '@shared/types';
import { setLanguage } from '@renderer/i18n';
import type { SbBridge } from '@renderer/lib/bridge';
import { AgentCommandsPanel } from '@renderer/screens/agent/AgentCommandsPanel';
import { HealthCard } from '@renderer/screens/garden/HealthCard';
import { ModuleActions } from '@renderer/screens/modules/ModuleActions';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

const READY: VaultStatus = {
  root: 'C:/vault',
  name: 'Demo-Vault',
  ready: true,
  indexing: false,
  indexRefreshFailedAt: null,
  indexedAt: '2026-08-10T09:00:00+02:00',
  docCount: 42,
};

function moduleOf(slug: string): KnowledgeModule {
  return {
    slug,
    title: slug,
    description: '',
    created: '2026-08-01',
    updated: '2026-08-01',
    counts: { sources: 0, entities: 0, concepts: 0 },
    findingCount: 0,
    lastIngest: null,
    tags: [],
  };
}

function curateJob(slug: string): AgentJobView {
  return {
    id: 'job-curate',
    kind: 'curate-module',
    subject: slug,
    label: slug,
    module: slug,
    state: 'with-agent',
    reason: null,
    createdAt: '2026-10-27T10:00:00.000Z',
    finishedAt: null,
  };
}

function report(agentAudit?: GardenerReport['agentAudit']): GardenerReport {
  return {
    ranAt: '2026-10-27T10:00:00.000Z',
    usedLlm: false,
    findings: [],
    health: 100,
    healthKnown: true,
    healthContributions: [],
    advice: [],
    ...(agentAudit === undefined ? {} : { agentAudit }),
  };
}

function install(handlers: Handlers) {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) return null;
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return calls;
}

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function actions(slug: string) {
  return withClient(
    <ModuleActions module={moduleOf(slug)} onRenamed={vi.fn()} onDeleted={vi.fn()} />,
  );
}

beforeEach(() => setLanguage('en'));

afterEach(() => {
  cleanup();
  delete window.sb;
});

describe('hand to agent: module header', () => {
  it('the help module offers no hand-over', async () => {
    const calls = install({ 'vault:status': () => READY, 'agent:jobs': () => [] });
    actions(HELP_MODULE_SLUG);

    await screen.findByRole('button', { name: 'Rename' });
    expect(screen.queryByTestId(`hand-module-${HELP_MODULE_SLUG}`)).toBeNull();
    expect(calls.some(({ channel }) => channel === 'agent:handOverModule')).toBe(false);
  });

  it('an open job shows the module as with the agent', async () => {
    install({ 'vault:status': () => READY, 'agent:jobs': () => [curateJob('auth0')] });
    actions('auth0');

    await waitFor(() => {
      const button = screen.getByTestId('hand-module-auth0') as HTMLButtonElement;
      expect(button.textContent).toBe('With the agent');
      expect(button.disabled).toBe(true);
    });
  });

  it('a click hands the module over once, with its slug', async () => {
    const calls = install({
      'vault:status': () => READY,
      'agent:jobs': () => [],
      'agent:handOverModule': ({ module }) => ({ outcome: 'filed', job: curateJob(module) }),
    });
    actions('auth0');

    const button = await screen.findByRole('button', { name: 'Hand to agent' });
    await userEvent.click(button);

    await waitFor(() =>
      expect(calls.filter(({ channel }) => channel === 'agent:handOverModule')).toEqual([
        { channel: 'agent:handOverModule', payload: { module: 'auth0' } },
      ]),
    );
  });
});

describe('hand to agent: gardener health card', () => {
  it('a run with an audit offers no hand-over', () => {
    install({});
    withClient(<HealthCard report={report({ offered: false, open: false })} />);

    expect(screen.queryByTestId('hand-gardener-run')).toBeNull();
  });

  it('a report main did not annotate offers no hand-over', () => {
    install({});
    withClient(<HealthCard report={report()} />);

    expect(screen.queryByTestId('hand-gardener-run')).toBeNull();
  });

  it('an offered run can be handed over, and an open job shows it as with the agent', async () => {
    const calls = install({});
    const { unmount } = withClient(<HealthCard report={report({ offered: true, open: false })} />);
    await userEvent.click(screen.getByTestId('hand-gardener-run'));
    await waitFor(() =>
      expect(calls.filter(({ channel }) => channel === 'agent:handOverGardenerRun')).toHaveLength(
        1,
      ),
    );
    unmount();

    withClient(<HealthCard report={report({ offered: true, open: true })} />);
    const button = screen.getByTestId('hand-gardener-run') as HTMLButtonElement;
    expect(button.textContent).toBe('With the agent');
    expect(button.disabled).toBe(true);
  });
});

describe('hand to agent: commands panel', () => {
  it('lists a button per module and none for the help module', async () => {
    install({
      'vault:status': () => READY,
      'agent:jobs': () => [],
      'modules:list': () => [moduleOf('auth0'), moduleOf(HELP_MODULE_SLUG), moduleOf('godot')],
    });
    withClient(<AgentCommandsPanel />);

    await screen.findByTestId('hand-module-auth0');
    expect(screen.getByTestId('hand-module-godot')).toBeTruthy();
    expect(screen.queryByTestId(`hand-module-${HELP_MODULE_SLUG}`)).toBeNull();
  });
});
