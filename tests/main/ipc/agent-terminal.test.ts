import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPlans } from '../../../src/core/agent/terminal';
import { readSetupState } from '../../../src/core/agent/setup-status';
import { applySetup } from '../../../src/core/agent/setup-apply';
import type { AgentCliStatus, TerminalLaunchResult } from '../../../src/shared/types';
import type { AgentTerminalDeps } from '../../../src/main/ipc/agent-terminal';
import type { Services } from '../../../src/main/services';
import { createFakeSpawn } from '../../fakes/terminal';
import { createTempVault } from '../../helpers/vault';
import type { TempVault } from '../../helpers/vault';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const INSTALLED: AgentCliStatus = { state: 'installed', path: 'C:\\bin\\claude.exe' };

interface Setup {
  vault: TempVault;
  /** Applies the managed setup so `setup-missing` does not block. */
  install?: boolean;
  open?: boolean;
  cli?: AgentCliStatus;
  platform?: NodeJS.Platform;
  missing?: string[];
}

async function launcherFor({
  vault,
  install = true,
  open = true,
  cli = INSTALLED,
  platform = 'win32',
  missing,
}: Setup) {
  if (install) {
    const state = await readSetupState(vault.store);
    await applySetup(vault.store, { confirmed: state.plan.write });
  }
  const { agentTerminalHandlers } = await import('../../../src/main/ipc/agent-terminal');
  const fake = createFakeSpawn(missing === undefined ? {} : { missing });
  const cliStatus = vi.fn(async () => cli);
  const deps: AgentTerminalDeps = { platform, spawn: fake.spawn, cliStatus };
  const services = {
    vaultRoot: () => (open ? vault.root : null),
    requireStore: () => vault.store,
  } as unknown as Services;
  const handlers = agentTerminalHandlers(services, deps);
  const launch = handlers['agent:launchTerminal'] as () => Promise<TerminalLaunchResult>;
  return { launch, fake, cliStatus };
}

describe('opening a terminal in the vault', () => {
  let vault: TempVault;

  beforeEach(async () => {
    vault = await createTempVault();
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  it('a launch with the cli absent or the setup missing is refused without spawning', async () => {
    const bare = await createTempVault();
    const cases: { setup: Setup; reason: string }[] = [
      { setup: { vault, cli: { state: 'absent' } }, reason: 'cli-absent' },
      { setup: { vault, cli: { state: 'unknown', reason: 'timeout' } }, reason: 'cli-unknown' },
      { setup: { vault: bare, install: false }, reason: 'setup-missing' },
      { setup: { vault, open: false }, reason: 'no-vault' },
    ];

    try {
      for (const { setup, reason } of cases) {
        const { launch, fake } = await launcherFor(setup);
        await expect(launch()).resolves.toEqual({ ok: false, reason });
        expect(fake.calls).toEqual([]);
      }
    } finally {
      await bare.cleanup();
    }
  });

  it('a launch outside windows is refused as an unsupported platform', async () => {
    const { launch, fake, cliStatus } = await launcherFor({ vault, platform: 'linux' });

    await expect(launch()).resolves.toEqual({
      ok: false,
      reason: 'unsupported-platform',
    });
    expect(fake.calls).toEqual([]);
    expect(cliStatus).not.toHaveBeenCalled();
  });

  it('a launch spawns only the terminal, once, with the inherited environment', async () => {
    const { launch, fake } = await launcherFor({ vault });
    await expect(launch()).resolves.toEqual({ ok: true, terminal: 'windows-terminal' });

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.file).toBe('wt.exe');
    expect(call?.options).toEqual({
      cwd: vault.root,
      stdio: 'ignore',
      windowsHide: false,
      windowsVerbatimArguments: false,
      shell: false,
    });
    expect(call?.options).not.toHaveProperty('env');
    expect(call?.options).not.toHaveProperty('detached');
    expect(fake.unref.count).toBe(1);
  });

  it('readiness is re-checked on every launch, not cached by the handler', async () => {
    const { launch, fake, cliStatus } = await launcherFor({ vault });

    await expect(launch()).resolves.toMatchObject({ ok: true });
    expect(fake.calls).toHaveLength(1);

    cliStatus.mockResolvedValue({ state: 'absent' });
    await expect(launch()).resolves.toEqual({ ok: false, reason: 'cli-absent' });
    expect(fake.calls).toHaveLength(1);

    cliStatus.mockResolvedValue(INSTALLED);
    await rm(join(vault.root, 'CLAUDE.md'));
    await expect(launch()).resolves.toEqual({
      ok: false,
      reason: 'setup-missing',
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('windows terminal missing falls back to powershell', async () => {
    const { launch, fake } = await launcherFor({ vault, missing: ['wt.exe'] });

    await expect(launch()).resolves.toEqual({ ok: true, terminal: 'powershell' });

    expect(fake.calls.map((call) => call.file)).toEqual(['wt.exe', 'cmd.exe']);
    expect(fake.calls[1]?.options.windowsVerbatimArguments).toBe(true);
    expect(fake.calls[1]?.options.windowsHide).toBe(true);
    expect(fake.unref.count).toBe(1);
  });

  it('with no terminal found the launch reports no-terminal with the errno code', async () => {
    const { launch, fake } = await launcherFor({ vault, missing: ['wt.exe', 'cmd.exe'] });

    await expect(launch()).resolves.toEqual({
      ok: false,
      reason: 'no-terminal',
      detail: 'ENOENT',
    });
    expect(fake.calls).toHaveLength(2);
    expect(fake.unref.count).toBe(0);
  });
});

describe('a vault path reaching the terminal program', () => {
  let parent: string;

  beforeEach(async () => {
    parent = await mkdtemp(join(tmpdir(), 'sb-term-'));
  });

  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });

  it('a vault path with spaces and non-ascii survives the real argv round-trip', async () => {
    const dir = join(parent, "Zoë's vault; a&b");
    await mkdir(dir);
    const real = await realpath(dir);
    const [plan] = buildLaunchPlans(real);
    if (plan === undefined) throw new Error('no plan');

    // The wt plan's argument vector, aimed at node instead of a terminal.
    const script =
      'process.stdout.write(JSON.stringify({ argv: process.argv.slice(1), cwd: process.cwd() }))';
    const child = spawn(process.execPath, ['-e', script, '--', ...plan.args], {
      cwd: plan.cwd,
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
      windowsVerbatimArguments: plan.windowsVerbatimArguments,
      shell: false,
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (out += chunk));
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', () => resolve());
    });

    const seen = JSON.parse(out) as { argv: string[]; cwd: string };
    expect(seen.cwd).toBe(real);
    expect(seen.argv).toEqual(plan.args);
    expect(seen.argv[seen.argv.indexOf('-d') + 1]).toBe(real.replaceAll(';', '\\;'));
  });
});
