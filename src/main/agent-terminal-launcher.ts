/* Starts a terminal from launch plans: the first plan whose program actually starts wins.

   Own narrow `SpawnFn`, deliberately not shared with the runtime spawners — each of those pins
   different options. No `env` (the terminal inherits the app's environment, like a double-click
   would) and no `detached` (the terminal is its own window; `unref` is enough to let go). */

import { spawn } from 'node:child_process';
import type { TerminalLaunchPlan, TerminalLaunchResult } from '@shared/types';

export interface TerminalSpawnOptions {
  readonly cwd: string;
  readonly stdio: 'ignore';
  readonly windowsHide: boolean;
  readonly windowsVerbatimArguments: boolean;
  readonly shell: false;
}

/** The slice of Node's `ChildProcess` the launcher touches. */
export interface TerminalProcess {
  unref(): void;
  once(event: 'spawn', listener: () => void): void;
  once(event: 'error', listener: (error: NodeJS.ErrnoException) => void): void;
}

export type TerminalSpawnFn = (
  file: string,
  args: readonly string[],
  options: TerminalSpawnOptions,
) => TerminalProcess;

export const nodeTerminalSpawn: TerminalSpawnFn = (file, args, options) =>
  spawn(file, args, options);

type Attempt = { started: true } | { started: false; code: string | undefined };

function attempt(plan: TerminalLaunchPlan, spawnFn: TerminalSpawnFn): Promise<Attempt> {
  return new Promise((resolve) => {
    let child: TerminalProcess;
    try {
      child = spawnFn(plan.command, plan.args, {
        cwd: plan.cwd,
        stdio: 'ignore',
        windowsHide: plan.windowsHide,
        windowsVerbatimArguments: plan.windowsVerbatimArguments,
        shell: false,
      });
    } catch (error) {
      // spawn throws synchronously for invalid arguments; that is a failed attempt, not a crash.
      resolve({ started: false, code: errorCode(error) });
      return;
    }
    // The error listener stays registered after `spawn` so a late error never goes unhandled.
    child.once('spawn', () => {
      child.unref();
      resolve({ started: true });
    });
    child.once('error', (error) => resolve({ started: false, code: errorCode(error) }));
  });
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

export async function launchTerminal(
  plans: readonly TerminalLaunchPlan[],
  spawnFn: TerminalSpawnFn,
): Promise<TerminalLaunchResult> {
  let code: string | undefined;
  for (const plan of plans) {
    const result = await attempt(plan, spawnFn);
    if (result.started) return { ok: true, terminal: plan.terminal };
    code = result.code;
  }
  return { ok: false, reason: 'no-terminal', ...(code === undefined ? {} : { detail: code }) };
}
