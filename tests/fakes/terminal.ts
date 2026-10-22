/* A `TerminalSpawnFn` that records every call and starts nothing. Files listed in `missing`
   fail with ENOENT like a program that is not installed; everything else "starts". */

import type {
  TerminalProcess,
  TerminalSpawnFn,
  TerminalSpawnOptions,
} from '../../src/main/agent-terminal-launcher';

export interface RecordedSpawn {
  file: string;
  args: readonly string[];
  options: TerminalSpawnOptions;
}

export interface FakeSpawn {
  spawn: TerminalSpawnFn;
  calls: RecordedSpawn[];
  unref: { count: number };
}

export function createFakeSpawn({ missing = [] }: { missing?: string[] } = {}): FakeSpawn {
  const calls: RecordedSpawn[] = [];
  const unref = { count: 0 };
  const spawn: TerminalSpawnFn = (file, args, options) => {
    calls.push({ file, args, options });
    const failing = missing.includes(file);
    const process: TerminalProcess = {
      unref: () => {
        unref.count += 1;
      },
      once: ((event: 'spawn' | 'error', listener: (error: NodeJS.ErrnoException) => void) => {
        if (event === 'spawn' && !failing) queueMicrotask(() => listener(undefined as never));
        if (event === 'error' && failing) {
          const error: NodeJS.ErrnoException = new Error('spawn ENOENT');
          error.code = 'ENOENT';
          queueMicrotask(() => listener(error));
        }
      }) as TerminalProcess['once'],
    };
    return process;
  };
  return { spawn, calls, unref };
}
