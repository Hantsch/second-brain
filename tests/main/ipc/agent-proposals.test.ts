import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Services } from '../../../src/main/services';
import { createTempVault } from '../../helpers/vault';
import type { TempVault } from '../../helpers/vault';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const core = vi.hoisted(() => ({
  acceptProposal: vi.fn(),
  rejectProposal: vi.fn(),
}));

vi.mock('../../../src/core/agent/proposal-resolve', () => core);

async function handlersFor(vault: TempVault) {
  const { agentProposalHandlers } = await import('../../../src/main/ipc/agent-proposals');
  const services = {
    requireVaultRoot: () => vault.root,
    index: () => null,
    settings: { vault: () => null },
  } as unknown as Services;
  const handlers = agentProposalHandlers(services);
  return {
    list: handlers['agent:proposals'] as () => Promise<unknown>,
    accept: handlers['agent:proposalAccept'] as (request: unknown) => Promise<unknown>,
    reject: handlers['agent:proposalReject'] as (request: unknown) => Promise<unknown>,
  };
}

describe('agent proposal channels in main', () => {
  let vault: TempVault;

  beforeEach(async () => {
    vault = await createTempVault();
    core.acceptProposal.mockReset();
    core.rejectProposal.mockReset();
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  it('an accept with a path-like id is refused before core sees it', async () => {
    const { accept } = await handlersFor(vault);
    const ids: unknown[] = ['../x', 'a/b', 'a\\b', '', '.hidden', 'x'.repeat(121), 7, null];

    for (const id of ids) {
      await expect(accept({ id })).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(accept(null)).rejects.toMatchObject({ code: 'invalid' });

    expect(core.acceptProposal).not.toHaveBeenCalled();

    core.acceptProposal.mockResolvedValue({ undo: { via: 'gardener', token: 't' } });
    await expect(accept({ id: 'P-1.a_b' })).resolves.toEqual({
      undo: { via: 'gardener', token: 't' },
    });
    expect(core.acceptProposal).toHaveBeenCalledTimes(1);
    expect(core.acceptProposal).toHaveBeenCalledWith(
      expect.anything(),
      'P-1.a_b',
      undefined,
      expect.anything(),
    );
  });

  it('a reject with a path-like id is refused before core sees it', async () => {
    const { reject } = await handlersFor(vault);

    for (const id of ['../x', 'a/b', 'a\\b']) {
      await expect(reject({ id })).rejects.toMatchObject({ code: 'invalid' });
    }

    expect(core.rejectProposal).not.toHaveBeenCalled();
  });
});
