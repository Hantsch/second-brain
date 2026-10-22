import path from 'node:path';
import type { AgentCliStatus } from '../../shared/types';

export interface CliLookupDeps {
  pathValue: string;
  pathExt?: string;
  platform: NodeJS.Platform;
  stat: (p: string) => Promise<{ isFile(): boolean; mode: number }>;
  timeoutMs?: number;
}

const DEFAULT_PATH_EXT = '.COM;.EXE;.BAT;.CMD';
const DEFAULT_TIMEOUT_MS = 3000;
const NOT_HERE = new Set(['ENOENT', 'ENOTDIR']);

/**
 * Looks for `claude` along PATH by stat-ing candidate files only — it never starts a
 * process, so a broken or hostile install cannot hang or run anything. (story 083)
 */
export async function findClaudeCli(deps: CliLookupDeps): Promise<AgentCliStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AgentCliStatus>((resolve) => {
    timer = setTimeout(
      () => resolve({ state: 'unknown', reason: 'timeout' }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([lookup(deps), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function lookup(deps: CliLookupDeps): Promise<AgentCliStatus> {
  const win = deps.platform === 'win32';
  const p = win ? path.win32 : path.posix;
  const extensions = (deps.pathExt?.trim() || DEFAULT_PATH_EXT)
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);
  const names = win ? extensions.map((e) => `claude${e}`) : ['claude'];
  const dirs = deps.pathValue
    .split(win ? ';' : ':')
    .map((d) =>
      win
        ? d
            .trim()
            .replace(/^"(.*)"$/, '$1')
            .trim()
        : d.trim(),
    )
    .filter(Boolean);

  let failureCode: string | undefined;
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = p.join(dir, name);
      try {
        const info = await deps.stat(candidate);
        if (info.isFile() && (win || (info.mode & 0o111) !== 0)) {
          return { state: 'installed', path: candidate };
        }
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        if (typeof code === 'string' && NOT_HERE.has(code)) continue;
        failureCode ??= typeof code === 'string' ? code : 'UNKNOWN';
      }
    }
  }
  return failureCode
    ? { state: 'unknown', reason: 'lookup-error', code: failureCode }
    : { state: 'absent' };
}
