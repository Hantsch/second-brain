/* Tests for the Codex directory reader (story 001, deliverable D5).
 *
 * Two describe blocks, same split as `../claude/reader.test.ts`:
 * - against the real D3 fixtures on disk (`tests/fixtures/codex/`), via the
 *   real node adapter — proves the reader walks the actual three-level
 *   `YYYY/MM/DD` tree and reads real titles from `session_index.jsonl`;
 * - against the in-memory fake (`./fixtures.ts`), for `limit`/`since` and the
 *   missing-directory case, where synthetic, precisely dated sessions make the
 *   assertions exact instead of depending on file mtimes on disk.
 */
import { describe, expect, it } from 'vitest';
import { nodeClaudeFileSystem } from '@core/claude';
import { CodexSessionReader, codexSessionsDir } from '@core/codex';
import { fixturePath } from '../../fixtures';
import { fakeCodexFs, syntheticSession } from './fixtures';

const CODEX_SESSIONS_DIR = fixturePath('codex', 'sessions');

describe('codexSessionsDir', () => {
  it('falls back to `~/.codex/sessions` when the setting is empty', () => {
    const fs = nodeClaudeFileSystem();
    expect(codexSessionsDir(fs, '')).toBe(fs.join(fs.homeDir(), '.codex', 'sessions'));
    expect(codexSessionsDir(fs, null)).toBe(fs.join(fs.homeDir(), '.codex', 'sessions'));
    expect(codexSessionsDir(fs, '  /elsewhere  ')).toBe('/elsewhere');
  });
});

describe('CodexSessionReader (files on disk, D3 fixtures)', () => {
  it('reads the two well-formed sessions, newest first, with titles from session_index.jsonl', async () => {
    const reader = new CodexSessionReader({
      fs: nodeClaudeFileSystem(),
      sessionsDir: CODEX_SESSIONS_DIR,
    });
    const sessions = await reader.list();

    // The empty rollout file carries no records at all and is not a session.
    expect(sessions).toHaveLength(2);

    const [newest, oldest] = sessions;
    expect(newest?.id).toBe('11111111-2222-3333-4444-555555555555');
    expect(newest?.cwd).toBe('/home/user/projects/report-gen');
    expect(newest?.gitBranch).toBe('bugfix/csv-export');
    expect(newest?.title).toBe('CSV export drops last row');
    expect(newest?.subagents).toBeNull();

    expect(oldest?.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(oldest?.cwd).toBe('/home/user/projects/widget-app');
    expect(oldest?.title).toBe('Cart totals: add tax calculation');
    expect(oldest?.messageCount).toBeGreaterThanOrEqual(2);
    expect(oldest?.model).toBe('gpt-5-codex');
    expect(oldest?.contextTokens).toBe(4821);

    // `lastActivity` of the newest session is strictly after the oldest's.
    expect(newest!.lastActivity > oldest!.lastActivity).toBe(true);
  });

  it("derives session_index.jsonl from the sessions root's parent by default", async () => {
    // No `sessionIndexPath` given — the default guess (strip the trailing
    // `sessions` segment) must land on the real D3 fixture file.
    const reader = new CodexSessionReader({
      fs: nodeClaudeFileSystem(),
      sessionsDir: CODEX_SESSIONS_DIR,
    });
    const sessions = await reader.list();
    expect(sessions.every((session) => session.title !== null)).toBe(true);
  });
});

describe('CodexSessionReader (in-memory fake)', () => {
  it('returns an empty list when the sessions root does not exist', async () => {
    const fs = fakeCodexFs([]);
    const reader = new CodexSessionReader({ fs, sessionsDir: '/codex/sessions' });
    expect(await reader.list()).toEqual([]);
  });

  it('honours `limit`, reading only the newest selected files', async () => {
    const fs = fakeCodexFs([
      {
        path: '/codex/sessions/2026/08/01/rollout-1.jsonl',
        text: syntheticSession({
          sessionId: 's-1',
          cwd: '/home/user/one',
          startedAt: '2026-08-01T09:00:00.000Z',
          lastActivity: '2026-08-01T09:05:00.000Z',
        }),
        modified: '2026-08-01T09:05:00.000Z',
      },
      {
        path: '/codex/sessions/2026/08/02/rollout-2.jsonl',
        text: syntheticSession({
          sessionId: 's-2',
          cwd: '/home/user/two',
          startedAt: '2026-08-02T09:00:00.000Z',
          lastActivity: '2026-08-02T09:05:00.000Z',
        }),
        modified: '2026-08-02T09:05:00.000Z',
      },
      {
        path: '/codex/sessions/2026/08/03/rollout-3.jsonl',
        text: syntheticSession({
          sessionId: 's-3',
          cwd: '/home/user/three',
          startedAt: '2026-08-03T09:00:00.000Z',
          lastActivity: '2026-08-03T09:05:00.000Z',
        }),
        modified: '2026-08-03T09:05:00.000Z',
      },
    ]);
    const reader = new CodexSessionReader({ fs, sessionsDir: '/codex/sessions' });

    const sessions = await reader.list({ limit: 2 });
    expect(sessions.map((session) => session.id)).toEqual(['s-3', 's-2']);
    // The oldest file was never even read.
    expect(fs.reads.some((read) => read.path.endsWith('rollout-1.jsonl'))).toBe(false);
  });

  it('honours `since`, excluding older files from the walk entirely', async () => {
    const fs = fakeCodexFs([
      {
        path: '/codex/sessions/2026/08/01/rollout-old.jsonl',
        text: syntheticSession({
          sessionId: 's-old',
          cwd: '/home/user/old',
          startedAt: '2026-08-01T09:00:00.000Z',
          lastActivity: '2026-08-01T09:05:00.000Z',
        }),
        modified: '2026-07-01T09:00:00.000Z',
      },
      {
        path: '/codex/sessions/2026/08/10/rollout-new.jsonl',
        text: syntheticSession({
          sessionId: 's-new',
          cwd: '/home/user/new',
          startedAt: '2026-08-10T09:00:00.000Z',
          lastActivity: '2026-08-10T09:05:00.000Z',
        }),
        modified: '2026-08-10T09:05:00.000Z',
      },
    ]);
    const reader = new CodexSessionReader({ fs, sessionsDir: '/codex/sessions' });

    const sessions = await reader.list({ since: '2026-08-01T00:00:00.000Z' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('s-new');
    expect(fs.reads.some((read) => read.path.endsWith('rollout-old.jsonl'))).toBe(false);
  });

  it('leaves out an empty file — it carries no records, so it is not a session', async () => {
    const fs = fakeCodexFs([
      {
        path: '/codex/sessions/2026/08/01/rollout-real.jsonl',
        text: syntheticSession({
          sessionId: 's-real',
          cwd: '/home/user/real',
          startedAt: '2026-08-01T09:00:00.000Z',
          lastActivity: '2026-08-01T09:05:00.000Z',
        }),
        modified: '2026-08-01T09:05:00.000Z',
      },
      {
        path: '/codex/sessions/2026/08/01/rollout-empty.jsonl',
        text: '',
        modified: '2026-08-01T09:06:00.000Z',
      },
    ]);
    const reader = new CodexSessionReader({ fs, sessionsDir: '/codex/sessions' });

    const sessions = await reader.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('s-real');
  });

  it('reads titles from an explicit `sessionIndexPath`, falling back to null for unlisted sessions', async () => {
    const fs = fakeCodexFs([
      {
        path: '/codex/sessions/2026/08/01/rollout-a.jsonl',
        text: syntheticSession({
          sessionId: 's-a',
          cwd: '/home/user/a',
          startedAt: '2026-08-01T09:00:00.000Z',
          lastActivity: '2026-08-01T09:05:00.000Z',
        }),
        modified: '2026-08-01T09:05:00.000Z',
      },
      {
        path: '/codex/sessions/2026/08/02/rollout-b.jsonl',
        text: syntheticSession({
          sessionId: 's-b',
          cwd: '/home/user/b',
          startedAt: '2026-08-02T09:00:00.000Z',
          lastActivity: '2026-08-02T09:05:00.000Z',
        }),
        modified: '2026-08-02T09:05:00.000Z',
      },
      {
        path: '/elsewhere/index.jsonl',
        text: '{"session_id":"s-a","thread_name":"Session A"}\n',
        modified: '2026-08-01T09:05:00.000Z',
      },
    ]);
    const reader = new CodexSessionReader({
      fs,
      sessionsDir: '/codex/sessions',
      sessionIndexPath: '/elsewhere/index.jsonl',
    });

    const sessions = await reader.list();
    const byId = new Map(sessions.map((session) => [session.id, session]));
    expect(byId.get('s-a')?.title).toBe('Session A');
    expect(byId.get('s-b')?.title).toBeNull();
  });

  it('honours a missing session_index.jsonl by leaving titles null, not thrown', async () => {
    const fs = fakeCodexFs([
      {
        path: '/codex/sessions/2026/08/01/rollout-a.jsonl',
        text: syntheticSession({
          sessionId: 's-a',
          cwd: '/home/user/a',
          startedAt: '2026-08-01T09:00:00.000Z',
          lastActivity: '2026-08-01T09:05:00.000Z',
        }),
        modified: '2026-08-01T09:05:00.000Z',
      },
    ]);
    // Default `sessionIndexPath` derivation points at '/codex/session_index.jsonl',
    // which has no entry among `fs`'s files — must not throw.
    const reader = new CodexSessionReader({ fs, sessionsDir: '/codex/sessions' });

    const sessions = await reader.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.title).toBeNull();
  });
});
