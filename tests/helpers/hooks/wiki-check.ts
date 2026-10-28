/* Drives the installed wiki-check script through Windows PowerShell exactly as Claude Code starts
 * it, with the hook input on stdin: exit 2 reports, exit 0 stays silent. Each test file owns its
 * vault, set up in beforeAll and removed in afterAll. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSetupFile } from '@core/agent/setup-marker';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { serialize } from '@core/vault/frontmatter';
import { pageFrontmatter } from '@core/wiki/pages';
import { registeredHook, runHook, type HookCommand } from '../hook';
import { createTempVault, type TempVault } from '../vault';

export const CHECK_PATH = '.claude/hooks/gaston-wiki-check.ps1';
export const TIMEOUT = 120_000;

function checkTemplate() {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === CHECK_PATH);
  if (found === undefined) throw new Error(`no template at ${CHECK_PATH}`);
  return found;
}

export const validPage = (module: string, overrides: Record<string, unknown> = {}) =>
  serialize(
    {
      ...pageFrontmatter({ type: 'concept', title: 'Habits', module, day: '2026-10-22' }),
      ...overrides,
    },
    '# Habits\n',
  );

export const missingTitle = (module: string) => {
  const fields = pageFrontmatter({ type: 'concept', title: 'x', module, day: '2026-10-22' });
  delete fields['title'];
  return serialize(fields, '# Habits\n');
};

export function createWikiCheck() {
  let vault: TempVault;
  let postHook: HookCommand;
  let stopHook: HookCommand;
  const tempDirs: string[] = [];
  let counter = 0;

  async function setup() {
    vault = await createTempVault();
    await vault.write(CHECK_PATH, renderSetupFile(checkTemplate()));
    postHook = registeredHook(SETTINGS_TEMPLATE.body, 'PostToolUse', vault.root);
    stopHook = registeredHook(SETTINGS_TEMPLATE.body, 'Stop', vault.root);
  }

  async function cleanup() {
    await vault.cleanup();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  }

  /** Raw stdin to the post-write hook, for input no session would send. */
  const runPost = (stdin: string) => runHook(postHook, stdin);
  const writeVault = (path: string, content: string) => vault.write(path, content);

  /** One agent session: its own ledger folder, session id and module, so cases stay independent. */
  async function session() {
    counter += 1;
    const temp = await mkdtemp(join(tmpdir(), 'sb-ledger-'));
    tempDirs.push(temp);
    const env = { TEMP: temp, TMP: temp };
    const sessionId = `session-${counter}`;
    const module = `m${counter}`;
    const send = (hook: HookCommand, event: string, filePath: string, stopActive = false) =>
      runHook(
        hook,
        JSON.stringify({
          hook_event_name: event,
          session_id: sessionId,
          tool_name: 'Write',
          tool_input: { file_path: filePath },
          cwd: vault.root,
          stop_hook_active: stopActive,
        }),
        env,
      );
    return {
      module,
      path: (rest: string) => `modules/${module}/wiki/${rest}`,
      /** Writes the file as the agent would, then reports it to the hook. */
      async write(path: string, content: string) {
        await vault.write(path, content);
        return send(postHook, 'PostToolUse', vault.absolute(path));
      },
      post: (path: string) => send(postHook, 'PostToolUse', vault.absolute(path)),
      stop: (stopActive = false) => send(stopHook, 'Stop', '', stopActive),
    };
  }

  return { setup, cleanup, session, runPost, writeVault };
}
