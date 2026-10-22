import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Services } from '../../../src/main/services';
import { createTempVault } from '../../helpers/vault';
import type { TempVault } from '../../helpers/vault';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const HASH = 'a'.repeat(64);

async function handlersFor(vault: TempVault) {
  const { agentSetupHandlers } = await import('../../../src/main/ipc/agent-setup');
  const services = { requireStore: () => vault.store } as unknown as Services;
  const handlers = agentSetupHandlers(services);
  return {
    apply: handlers['agent:setupApply'] as (request: unknown) => Promise<unknown>,
  };
}

describe('agent setup channels in main', () => {
  let vault: TempVault;

  beforeEach(async () => {
    vault = await createTempVault();
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  it('a malformed apply request is refused before anything is written', async () => {
    const { apply } = await handlersFor(vault);
    const tooMany = Array.from({ length: 65 }, () => ({ path: 'CLAUDE.md', expectedHash: '' }));
    const malformed: unknown[] = [
      { confirmed: tooMany },
      { confirmed: [{ path: '../x', expectedHash: '' }] },
      { confirmed: [{ path: '/etc/passwd', expectedHash: '' }] },
      { confirmed: [{ path: 'C:\\Windows\\x', expectedHash: '' }] },
      { confirmed: [{ path: 'CLAUDE.md', expectedHash: 'nothex' }] },
      { confirmed: [{ path: 'CLAUDE.md', expectedHash: HASH.toUpperCase() }] },
      { confirmed: [{ path: 'CLAUDE.md' }] },
      { confirmed: [null] },
      { confirmed: 'CLAUDE.md' },
      {},
      null,
    ];

    for (const request of malformed) {
      await expect(apply(request)).rejects.toMatchObject({ code: 'invalid' });
    }

    expect(await vault.exists('CLAUDE.md')).toBe(false);
    expect(await vault.exists('.claude/gaston-manifest.json')).toBe(false);
  });

  it('an applied help module is refreshed into the index with its log, and the renderer is woken', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const refreshIndexState = vi.fn().mockResolvedValue(undefined);
    const sendEvent = vi.fn();
    const { agentSetupHandlers } = await import('../../../src/main/ipc/agent-setup');
    const { readSetupState } = await import('../../../src/core/agent/setup-status');
    const services = {
      requireStore: () => vault.store,
      index: () => ({ refresh }),
      refreshIndexState,
      sendEvent,
    } as unknown as Services;
    const handlers = agentSetupHandlers(services);

    const state = await readSetupState(vault.store);
    const confirmed = state.plan.write.map(({ path, expectedHash }) => ({ path, expectedHash }));
    await handlers['agent:setupApply']?.({ confirmed });

    const helpPages = confirmed
      .map((c) => c.path)
      .filter((p) => p.startsWith('modules/gaston-help/'));
    expect(helpPages.length).toBeGreaterThan(0);
    const [refreshed] = refresh.mock.calls[0] as [string[]];
    expect(refreshed).toEqual(
      expect.arrayContaining([...helpPages, 'modules/gaston-help/wiki/log.md']),
    );
    expect(refreshed.every((p) => p.startsWith('modules/gaston-help/'))).toBe(true);
    expect(sendEvent).toHaveBeenCalledWith('event:vault-changed', {
      paths: refreshed,
      external: false,
    });
  });
});
