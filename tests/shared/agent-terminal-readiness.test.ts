import { describe, expect, it } from 'vitest';
import { setupIsComplete, terminalReadiness } from '@shared/agent/terminal-readiness';

describe('setup completeness', () => {
  it('only a missing file makes the setup incomplete', () => {
    expect(setupIsComplete([])).toBe(true);
    expect(
      setupIsComplete([{ status: 'current' }, { status: 'outdated' }, { status: 'modified' }]),
    ).toBe(true);
    expect(setupIsComplete([{ status: 'current' }, { status: 'missing' }])).toBe(false);
  });
});

describe('terminal readiness', () => {
  it('the terminal is ready only with the cli installed and no managed setup file missing', () => {
    const ok = { vaultOpen: true, cli: 'installed', setupComplete: true } as const;
    expect(terminalReadiness(ok)).toEqual({ ready: true });
    expect(terminalReadiness({ ...ok, vaultOpen: false })).toEqual({
      ready: false,
      reason: 'no-vault',
    });
    expect(terminalReadiness({ ...ok, cli: 'absent' })).toEqual({
      ready: false,
      reason: 'cli-absent',
    });
    expect(terminalReadiness({ ...ok, cli: 'unknown' })).toEqual({
      ready: false,
      reason: 'cli-unknown',
    });
    expect(terminalReadiness({ ...ok, setupComplete: false })).toEqual({
      ready: false,
      reason: 'setup-missing',
    });

    // Order: no-vault beats cli problems, cli problems beat missing setup.
    const allBad = { vaultOpen: false, cli: 'absent', setupComplete: false } as const;
    expect(terminalReadiness(allBad)).toEqual({ ready: false, reason: 'no-vault' });
    expect(terminalReadiness({ ...allBad, vaultOpen: true })).toEqual({
      ready: false,
      reason: 'cli-absent',
    });
    expect(terminalReadiness({ ...allBad, vaultOpen: true, cli: 'unknown' })).toEqual({
      ready: false,
      reason: 'cli-unknown',
    });
  });
});
