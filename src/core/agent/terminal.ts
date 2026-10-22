import { AGENT_SKILLS } from '../../shared/types/agent-setup';
import type { TerminalIntent, TerminalLaunchPlan } from '../../shared/types/agent-terminal';
import { slugify } from '../vault/slug';

export class InvalidTerminalModuleError extends Error {
  constructor() {
    super('Module name is not a slug.');
    this.name = 'InvalidTerminalModuleError';
  }
}

/**
 * The prompt is wrapped in single quotes on the command line, so it may only contain
 * skill names and a slug; the slug check is what makes that quoting safe.
 */
export function firstPrompt(intent: TerminalIntent): string | null {
  switch (intent.kind) {
    case 'open':
      return null;
    case 'jobs':
      return `/${AGENT_SKILLS.jobs}`;
    case 'curate':
      if (slugify(intent.module) !== intent.module) throw new InvalidTerminalModuleError();
      return `/${AGENT_SKILLS.curate} ${intent.module}`;
  }
}

export function claudeLine(prompt: string | null): string {
  return prompt === null ? 'claude' : `claude '${prompt}'`;
}

/**
 * Windows Terminal first, plain PowerShell via `cmd start` as fallback. The vault path
 * only goes into `cwd` and the wt `-d` element, never into a command line that is
 * parsed by a shell (wt treats `;` as its command separator, hence the escape).
 */
export function buildLaunchPlans(intent: TerminalIntent, vaultRoot: string): TerminalLaunchPlan[] {
  const line = claudeLine(firstPrompt(intent));
  return [
    {
      terminal: 'windows-terminal',
      command: 'wt.exe',
      args: ['-d', vaultRoot.replaceAll(';', '\\;'), 'powershell.exe', '-NoExit', '-Command', line],
      cwd: vaultRoot,
      windowsVerbatimArguments: false,
    },
    {
      terminal: 'powershell',
      command: 'cmd.exe',
      // cmd /s strips the outer quote pair; the empty "" is start's window title.
      args: ['/d', '/s', '/c', `"start "" powershell.exe -NoExit -Command "${line}""`],
      cwd: vaultRoot,
      windowsVerbatimArguments: true,
    },
  ];
}
