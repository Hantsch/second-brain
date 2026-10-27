/* Runs an installed Claude Code hook the way Claude Code does: the registered command with the
 * hook input on stdin, reading the exit code and what it wrote. */

import { spawn } from 'node:child_process';

export interface HookResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface HookCommand {
  command: string;
  args: string[];
}

/** The command registered for `event` in a rendered settings.json, with the vault substituted:
 * the first one, or the one running `script` when an event has several. */
export function registeredHook(
  settingsBody: string,
  event: 'PreToolUse' | 'PostToolUse' | 'Stop' | 'UserPromptSubmit',
  vaultRoot: string,
  script?: string,
): HookCommand {
  const settings = JSON.parse(settingsBody) as {
    hooks: Record<string, { hooks: HookCommand[] }[]>;
  };
  const hook = (settings.hooks[event] ?? [])
    .map((group) => group.hooks[0])
    .find((command) => script === undefined || command?.args.some((arg) => arg.endsWith(script)));
  if (hook === undefined) throw new Error(`no ${event} hook registered`);
  return {
    command: hook.command,
    args: hook.args.map((arg) => arg.replace(`\${CLAUDE_PROJECT_DIR}`, vaultRoot)),
  };
}

// Shared CPU with the rest of the suite: ~120 concurrent powershell.exe spawns starve unrelated
// timing-sensitive tests, so cap them. Queued spawns wait inside the test timeout (see describes).
const MAX_CONCURRENT_SPAWNS = 3;
let activeSpawns = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (activeSpawns < MAX_CONCURRENT_SPAWNS) {
    activeSpawns += 1;
    return;
  }
  // The releasing spawn hands its slot over directly, so the count stays unchanged.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next === undefined) activeSpawns -= 1;
  else next();
}

export async function runHook(
  hook: HookCommand,
  stdin: string,
  env?: Record<string, string>,
): Promise<HookResult> {
  await acquireSlot();
  try {
    return await spawnHook(hook, stdin, env);
  } finally {
    releaseSlot();
  }
}

function spawnHook(
  hook: HookCommand,
  stdin: string,
  env?: Record<string, string>,
): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(hook.command, hook.args, {
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}
