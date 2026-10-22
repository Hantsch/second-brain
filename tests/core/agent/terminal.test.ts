import { describe, expect, it } from 'vitest';
import { buildLaunchPlans } from '../../../src/core/agent/terminal';
import type { TerminalLaunchPlan } from '../../../src/shared/types/agent-terminal';

const VAULT = 'C:\\Vaults\\main';

function plansPair(vaultRoot: string): [TerminalLaunchPlan, TerminalLaunchPlan] {
  const [wt, ps] = buildLaunchPlans(vaultRoot);
  if (!wt || !ps) throw new Error('expected two plans');
  return [wt, ps];
}

describe('terminal launch plans', () => {
  it('opening claude plans windows terminal then powershell, both in the vault folder with no first prompt', () => {
    const plans = buildLaunchPlans(VAULT);
    expect(plans).toEqual([
      {
        terminal: 'windows-terminal',
        command: 'wt.exe',
        args: ['-d', VAULT, 'powershell.exe', '-NoExit', '-Command', 'claude'],
        cwd: VAULT,
        windowsVerbatimArguments: false,
        windowsHide: false,
      },
      {
        terminal: 'powershell',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', '"start "" powershell.exe -NoExit -Command "claude""'],
        cwd: VAULT,
        windowsVerbatimArguments: true,
        windowsHide: true,
      },
    ]);
  });

  it('no plan carries a print, headless, permission-bypass or key flag', () => {
    const banned = [
      '-p',
      '--print',
      '--output-format',
      '--api-key',
      '--dangerously-skip-permissions',
      '--permission-mode',
    ];
    for (const plan of buildLaunchPlans(VAULT)) {
      const words = [plan.command, ...plan.args].join(' ').split(/\s+/);
      for (const flag of banned) expect(words).not.toContain(flag);
      expect([plan.command, ...plan.args].join(' ')).not.toContain('ANTHROPIC_');
    }
  });

  it('a vault path with spaces, quotes, semicolons and non-ascii appears only as the working directory and the escaped -d argument', () => {
    const odd = 'D:\\My Vault; it\'s "x" Größe';
    const escaped = odd.replaceAll(';', '\\;');
    const [wt, ps] = plansPair(odd);

    expect(wt.cwd).toBe(odd);
    expect(ps.cwd).toBe(odd);
    expect(wt.args.slice(0, 2)).toEqual(['-d', escaped]);
    expect(wt.args.filter((a) => a.includes('Größe'))).toEqual([escaped]);
    const psLine = ps.args.join(' ');
    expect(psLine).not.toContain('Größe');
    expect(psLine).not.toContain('Vault');
  });
});
