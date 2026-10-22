/* Env-gated terminal spawn seam for the e2e suite (story 087).
 *
 * A real launch would open a window on the developer's desktop, so the e2e app swaps only the
 * `SpawnFn`: the plans, the fallback order and the result mapping stay the production code.
 * `SB_E2E_TERMINAL_FIXTURE` names a JSON file `{ "missing": string[] }`; unset means the real
 * spawn, untouched. The file is re-read on every spawn so a spec can change which programs
 * "exist" mid-flow. Every attempt is appended to `<fixture>.launches.json`. */

import { readFileSync, writeFileSync } from 'node:fs';
import type {
  TerminalProcess,
  TerminalSpawnFn,
  TerminalSpawnOptions,
} from '../agent-terminal-launcher';

const ENV_VAR = 'SB_E2E_TERMINAL_FIXTURE';

export interface TerminalLaunchRecord {
  file: string;
  args: readonly string[];
  cwd: string;
}

function missingPrograms(fixturePath: string): readonly string[] {
  try {
    const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as { missing?: unknown };
    return Array.isArray(parsed.missing)
      ? parsed.missing.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    // An unreadable fixture means "everything starts", never a crash in the launch path.
    return [];
  }
}

function appendLaunch(fixturePath: string, record: TerminalLaunchRecord): void {
  const file = `${fixturePath}.launches.json`;
  let launches: TerminalLaunchRecord[] = [];
  try {
    launches = JSON.parse(readFileSync(file, 'utf8')) as TerminalLaunchRecord[];
  } catch {
    // First launch: no record file yet.
  }
  writeFileSync(file, JSON.stringify([...launches, record]), 'utf8');
}

/** Emits its outcome asynchronously, like a real child, so the launcher's listeners exist first. */
function fakeProcess(missing: boolean): TerminalProcess {
  const listeners: { spawn: (() => void)[]; error: ((error: NodeJS.ErrnoException) => void)[] } = {
    spawn: [],
    error: [],
  };
  setImmediate(() => {
    if (missing) {
      const error: NodeJS.ErrnoException = new Error('spawn ENOENT');
      error.code = 'ENOENT';
      listeners.error.forEach((listener) => listener(error));
    } else {
      listeners.spawn.forEach((listener) => listener());
    }
  });
  return {
    unref: () => undefined,
    once: ((event: 'spawn' | 'error', listener: never) => {
      (listeners[event] as unknown[]).push(listener);
    }) as TerminalProcess['once'],
  };
}

/** The recording spawn when `SB_E2E_TERMINAL_FIXTURE` is set, otherwise `undefined`. */
export function terminalSpawnFixture(): TerminalSpawnFn | undefined {
  const fixturePath = process.env[ENV_VAR];
  if (fixturePath === undefined || fixturePath.trim().length === 0) return undefined;
  return (file: string, args: readonly string[], options: TerminalSpawnOptions) => {
    appendLaunch(fixturePath, { file, args, cwd: options.cwd });
    return fakeProcess(missingPrograms(fixturePath).includes(file));
  };
}
