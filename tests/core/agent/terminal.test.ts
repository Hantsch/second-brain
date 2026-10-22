import { describe, expect, it } from 'vitest';
import { InvalidTerminalModuleError, buildLaunchPlans } from '../../../src/core/agent/terminal';
import type { TerminalIntent, TerminalLaunchPlan } from '../../../src/shared/types/agent-terminal';
import { AGENT_SKILLS } from '../../../src/shared/types/agent-setup';

const VAULT = 'C:\\Vaults\\main';

function plansPair(
  intent: TerminalIntent,
  vaultRoot: string,
): [TerminalLaunchPlan, TerminalLaunchPlan] {
  const [wt, ps] = buildLaunchPlans(intent, vaultRoot);
  if (!wt || !ps) throw new Error('expected two plans');
  return [wt, ps];
}

describe('terminal launch plans', () => {
  it('opening claude plans windows terminal then powershell, both in the vault folder with no first prompt', () => {
    const plans = buildLaunchPlans({ kind: 'open' }, VAULT);
    expect(plans).toEqual([
      {
        terminal: 'windows-terminal',
        command: 'wt.exe',
        args: ['-d', VAULT, 'powershell.exe', '-NoExit', '-Command', 'claude'],
        cwd: VAULT,
        windowsVerbatimArguments: false,
      },
      {
        terminal: 'powershell',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', '"start "" powershell.exe -NoExit -Command "claude""'],
        cwd: VAULT,
        windowsVerbatimArguments: true,
      },
    ]);
  });

  it('working the jobs plans claude with the queue skill as the first prompt', () => {
    const [wt, ps] = plansPair({ kind: 'jobs' }, VAULT);
    const line = `claude '/${AGENT_SKILLS.jobs}'`;
    expect(wt.args.at(-1)).toBe(line);
    expect(ps.args.at(-1)).toBe(`"start "" powershell.exe -NoExit -Command "${line}""`);
  });

  it('curating a module plans claude with the curator skill and the module slug as the first prompt', () => {
    const [wt, ps] = plansPair({ kind: 'curate', module: 'ai-projects' }, VAULT);
    const line = `claude '/${AGENT_SKILLS.curate} ai-projects'`;
    expect(wt.args.at(-1)).toBe(line);
    expect(ps.args.at(-1)).toContain(line);
  });

  it('a module name that is not a slug is refused instead of quoted', () => {
    for (const module of ["x'; calc; '", 'Has Space', 'a"b', '$(whoami)', 'Größe', '', 'a;b']) {
      expect(() => buildLaunchPlans({ kind: 'curate', module }, VAULT)).toThrow(
        InvalidTerminalModuleError,
      );
    }
  });

  it('no plan carries a print, headless, permission-bypass or key flag', () => {
    const intents = [
      { kind: 'open' },
      { kind: 'jobs' },
      { kind: 'curate', module: 'ai-projects' },
    ] as const;
    const banned = [
      '-p',
      '--print',
      '--output-format',
      '--api-key',
      '--dangerously-skip-permissions',
      '--permission-mode',
    ];
    for (const intent of intents) {
      for (const plan of buildLaunchPlans(intent, VAULT)) {
        const words = [plan.command, ...plan.args].join(' ').split(/\s+/);
        for (const flag of banned) expect(words).not.toContain(flag);
        expect([plan.command, ...plan.args].join(' ')).not.toContain('ANTHROPIC_');
      }
    }
  });

  it('a vault path with spaces, quotes, semicolons and non-ascii appears only as the working directory and the escaped -d argument', () => {
    const odd = 'D:\\My Vault; it\'s "x" Größe';
    const escaped = odd.replaceAll(';', '\\;');
    const [wt, ps] = plansPair({ kind: 'jobs' }, odd);

    expect(wt.cwd).toBe(odd);
    expect(ps.cwd).toBe(odd);
    expect(wt.args.slice(0, 2)).toEqual(['-d', escaped]);
    expect(wt.args.filter((a) => a.includes('Größe'))).toEqual([escaped]);
    const psLine = ps.args.join(' ');
    expect(psLine).not.toContain('Größe');
    expect(psLine).not.toContain('Vault');
  });
});
