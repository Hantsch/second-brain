import type { TerminalLaunchPlan } from '../../shared/types/agent-terminal';

/* Plain `claude`, no first prompt: model and session settings are the user's to pick before
   anything runs. */
const CLAUDE_LINE = 'claude';

/**
 * Windows Terminal first, plain PowerShell via `cmd start` as fallback. The vault path
 * only goes into `cwd` and the wt `-d` element, never into a command line that is
 * parsed by a shell (wt treats `;` as its command separator, hence the escape).
 */
export function buildLaunchPlans(vaultRoot: string): TerminalLaunchPlan[] {
  return [
    {
      terminal: 'windows-terminal',
      command: 'wt.exe',
      args: [
        '-d',
        vaultRoot.replaceAll(';', '\\;'),
        'powershell.exe',
        '-NoExit',
        '-Command',
        CLAUDE_LINE,
      ],
      cwd: vaultRoot,
      windowsVerbatimArguments: false,
      windowsHide: false,
    },
    {
      terminal: 'powershell',
      command: 'cmd.exe',
      // cmd /s strips the outer quote pair; the empty "" is start's window title.
      args: ['/d', '/s', '/c', `"start "" powershell.exe -NoExit -Command "${CLAUDE_LINE}""`],
      cwd: vaultRoot,
      windowsVerbatimArguments: true,
      // Hides only the throwaway cmd console; `start` gives PowerShell a fresh, visible window.
      windowsHide: true,
    },
  ];
}
