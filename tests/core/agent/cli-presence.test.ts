import { describe, expect, it } from 'vitest';
import { findClaudeCli } from '../../../src/core/agent/cli-presence';

type Entry = { file: boolean; mode: number };

function fakeStat(files: Record<string, Entry>, failing: Record<string, string> = {}) {
  return async (p: string) => {
    if (p in failing) throw Object.assign(new Error('fs failure'), { code: failing[p] });
    const entry = files[p];
    if (!entry) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { isFile: () => entry.file, mode: entry.mode };
  };
}

describe('findClaudeCli', () => {
  it('finds claude in a PATH directory and reports where', async () => {
    const hit = String.raw`C:\Users\me\bin\claude.cmd`;
    const win = await findClaudeCli({
      platform: 'win32',
      pathValue: String.raw`C:\Windows;"C:\Users\me\bin";C:\other`,
      pathExt: '.exe;.cmd',
      stat: fakeStat({ [hit]: { file: true, mode: 0 } }),
    });
    expect(win).toEqual({ state: 'installed', path: hit });

    const posix = await findClaudeCli({
      platform: 'linux',
      pathValue: '/usr/bin::/home/me/.local/bin',
      stat: fakeStat({ '/home/me/.local/bin/claude': { file: true, mode: 0o755 } }),
    });
    expect(posix).toEqual({ state: 'installed', path: '/home/me/.local/bin/claude' });
  });

  it('a non-executable claude file on posix is not a hit', async () => {
    const status = await findClaudeCli({
      platform: 'linux',
      pathValue: '/usr/bin',
      stat: fakeStat({ '/usr/bin/claude': { file: true, mode: 0o644 } }),
    });
    expect(status).toEqual({ state: 'absent' });
  });

  it('no PATH directory holding claude reports absent', async () => {
    const status = await findClaudeCli({
      platform: 'win32',
      pathValue: String.raw`C:\a;C:\b`,
      stat: fakeStat({}),
    });
    expect(status).toEqual({ state: 'absent' });
  });

  it('a lookup that exceeds its time limit reports unknown with timeout', async () => {
    const status = await findClaudeCli({
      platform: 'linux',
      pathValue: '/usr/bin',
      timeoutMs: 20,
      stat: () => new Promise(() => {}),
    });
    expect(status).toEqual({ state: 'unknown', reason: 'timeout' });
  });

  it('an unreadable PATH directory makes a miss unknown with its error code', async () => {
    const status = await findClaudeCli({
      platform: 'linux',
      pathValue: '/locked:/usr/bin',
      stat: fakeStat({}, { '/locked/claude': 'EACCES' }),
    });
    expect(status).toEqual({ state: 'unknown', reason: 'lookup-error', code: 'EACCES' });
  });
});
