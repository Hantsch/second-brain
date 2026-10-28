/* Drives the installed pre-tool guard script through Windows PowerShell exactly as Claude Code
 * starts it, with the hook input on stdin: exit 2 blocks, exit 0 allows. Each test file owns its
 * vault, set up in beforeAll and removed in afterAll. */

import { expect } from 'vitest';
import { renderSetupFile } from '@core/agent/setup-marker';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { registeredHook, runHook, type HookCommand } from '../hook';
import { createTempVault, type TempVault } from '../vault';

export const GUARD_PATH = '.claude/hooks/gaston-shell-guard.ps1';
/** Replaced by the temp vault's absolute Windows path when a case runs. */
export const ROOT = '<root>';
export const TIMEOUT = 120_000;

export const JOURNAL_FILE = 'journal/2026/10/2026-10-01.md';
export const HELP_DIR = `modules/${HELP_MODULE_SLUG}`;
export const HELP_PAGE = `${HELP_DIR}/wiki/concepts/agent.md`;

function guardTemplate() {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === GUARD_PATH);
  if (found === undefined) throw new Error(`no template at ${GUARD_PATH}`);
  return found;
}

export interface GuardCase {
  name: string;
  tool: string;
  input: Record<string, string>;
  /** Vault-relative working directory; the vault root when absent. */
  cwd?: string;
}

export const bash = (command: string, cwd?: string): GuardCase => ({
  name: `Bash ${command}${cwd === undefined ? '' : ` (in ${cwd})`}`,
  tool: 'Bash',
  input: { command },
  ...(cwd === undefined ? {} : { cwd }),
});
export const ps = (command: string, cwd?: string): GuardCase => ({
  ...bash(command, cwd),
  name: `PowerShell ${command}${cwd === undefined ? '' : ` (in ${cwd})`}`,
  tool: 'PowerShell',
});
export const tool = (name: string, input: Record<string, string>): GuardCase => ({
  name: `${name} ${JSON.stringify(input)}`,
  tool: name,
  input,
});

export function createShellGuard() {
  let vault: TempVault;
  let hook: HookCommand;

  async function setup() {
    vault = await createTempVault();
    await vault.write(JOURNAL_FILE, '# Private\n');
    await vault.write('raw/web/page.md', '# Source\n');
    await vault.write('modules/m/wiki/index.md', '# Index\n');
    await vault.write('.secondbrain/index/x.bodies/ab.json', '{}\n');
    await vault.write('.secondbrain/chats/s1.json', '{}\n');
    await vault.write('.secondbrain/agent/results/j1.md', '# Result\n');
    await vault.write('.secondbrain/agent/jobs/j1.md', '# Job\n');
    await vault.write(GUARD_PATH, renderSetupFile(guardTemplate()));
    // Started exactly as settings.json registers it, with the placeholder Claude Code resolves.
    hook = registeredHook(SETTINGS_TEMPLATE.body, 'PreToolUse', vault.root);
  }

  async function cleanup() {
    await vault.cleanup();
  }

  const runGuard = (stdin: string) => runHook(hook, stdin);
  const absolute = (relative: string) => vault.absolute(relative);

  function decide(c: GuardCase) {
    const toolInput = Object.fromEntries(
      Object.entries(c.input).map(([key, value]) => [key, value.replaceAll(ROOT, vault.root)]),
    );
    const cwd = c.cwd === undefined ? vault.root : vault.absolute(c.cwd);
    return runGuard(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: c.tool,
        tool_input: toolInput,
        cwd,
      }),
    );
  }

  async function expectBlocked(c: GuardCase) {
    const result = await decide(c);
    expect(result.code, c.name).toBe(2);
    expect(result.stderr.trim(), c.name).not.toBe('');
    // A crash inside the guard also exits 2; a case only counts when the guard decided.
    expect(result.stderr, c.name).not.toContain('guard error');
  }

  /** Blocked for the named reason, not merely by some earlier, unrelated check. */
  function expectBlockedWith(reason: string) {
    return async (c: GuardCase) => {
      const result = await decide(c);
      expect(result.code, c.name).toBe(2);
      expect(result.stderr, c.name).toContain(reason);
    };
  }

  async function expectAllowed(c: GuardCase) {
    const result = await decide(c);
    expect({ code: result.code, stdout: result.stdout, stderr: result.stderr }, c.name).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
  }

  return {
    setup,
    cleanup,
    runGuard,
    absolute,
    decide,
    expectBlocked,
    expectBlockedWith,
    expectAllowed,
  };
}
