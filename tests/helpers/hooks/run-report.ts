/* Drives the installed run-report PowerShell script exactly as Claude Code starts it, with the hook
 * input on stdin, and reads the result with Gaston's reader. Each session owns its vault and temp
 * folder so cases and their runs stay apart. */

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { parseRunReport } from '@core/agent/run-reports';
import { renderSetupFile } from '@core/agent/setup-marker';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { AGENT_DIRS } from '@shared/types';
import { registeredHook, runHook, type HookCommand } from '../hook';
import { createTempVault, type TempVault } from '../vault';

export const SCRIPT_PATH = '.claude/hooks/gaston-run-report.ps1';

function reportTemplate() {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === SCRIPT_PATH);
  if (found === undefined) throw new Error(`no template at ${SCRIPT_PATH}`);
  return found;
}

export function createRunReportSessions() {
  const cleanups: (() => Promise<void>)[] = [];
  let counter = 0;

  /** One agent session in its own vault and temp folder, so cases and their runs stay apart. */
  async function session() {
    counter += 1;
    const vault: TempVault = await createTempVault();
    const temp = await mkdtemp(join(tmpdir(), 'sb-run-ledger-'));
    cleanups.push(
      () => vault.cleanup(),
      () => rm(temp, { recursive: true, force: true }),
    );
    await vault.write(SCRIPT_PATH, renderSetupFile(reportTemplate()));
    const hook = (event: 'UserPromptSubmit' | 'PostToolUse' | 'Stop') =>
      registeredHook(SETTINGS_TEMPLATE.body, event, vault.root, SCRIPT_PATH);
    const hooks = {
      UserPromptSubmit: hook('UserPromptSubmit'),
      PostToolUse: hook('PostToolUse'),
      Stop: hook('Stop'),
    };
    const send = async (event: keyof typeof hooks, fields: Record<string, unknown>) => {
      const result = await runHook(
        hooks[event] satisfies HookCommand,
        JSON.stringify({
          hook_event_name: event,
          session_id: `session-${counter}`,
          cwd: vault.root,
          ...fields,
        }),
        { TEMP: temp, TMP: temp },
      );
      // A recorder never blocks the agent, and UserPromptSubmit stdout would become its context.
      expect({ code: result.code, stdout: result.stdout, stderr: result.stderr }).toEqual({
        code: 0,
        stdout: '',
        stderr: '',
      });
    };
    const runsDir = join(vault.root, AGENT_DIRS.runs);
    return {
      vault,
      prompt: (prompt: string) => send('UserPromptSubmit', { prompt }),
      skill: (toolInput: Record<string, unknown>) =>
        send('PostToolUse', { tool_name: 'Skill', tool_input: toolInput, tool_response: {} }),
      stop: (active = false) => send('Stop', { stop_hook_active: active }),
      page: (module: string, rest: string) =>
        vault.write(`modules/${module}/wiki/${rest}`, '---\ntype: concept\n---\n# Page\n'),
      async reports(): Promise<string[]> {
        return (await readdir(runsDir).catch(() => [] as string[])).sort();
      },
      async report(name: string) {
        const content = await readFile(join(runsDir, name), 'utf8');
        const parsed = parseRunReport(content);
        if ('error' in parsed) throw new Error(`unreadable report: ${parsed.error}`);
        return { content, parsed };
      },
    };
  }

  async function cleanup() {
    await Promise.all(cleanups.map((fn) => fn()));
  }

  return { session, cleanup };
}
