/* The wiki check is a report, not a guard: it tells the agent when a wiki page it wrote breaks the
 * schema's frontmatter, and when a module's wiki changed in a session without a new log entry.
 * Every case runs the installed script through Windows PowerShell exactly as Claude Code starts
 * it, with the hook input on stdin: exit 2 reports, exit 0 stays silent. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderSetupFile } from '@core/agent/setup-marker';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { serialize } from '@core/vault/frontmatter';
import { parseLog } from '@core/wiki/log-md';
import { pageFrontmatter } from '@core/wiki/pages';
import { registeredHook, runHook, type HookCommand } from '../../helpers/hook';
import { createTempVault, type TempVault } from '../../helpers/vault';

const CHECK_PATH = '.claude/hooks/gaston-wiki-check.ps1';
const TIMEOUT = 120_000;

function checkTemplate() {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === CHECK_PATH);
  if (found === undefined) throw new Error(`no template at ${CHECK_PATH}`);
  return found;
}

const validPage = (module: string, overrides: Record<string, unknown> = {}) =>
  serialize(
    {
      ...pageFrontmatter({ type: 'concept', title: 'Habits', module, day: '2026-10-22' }),
      ...overrides,
    },
    '# Habits\n',
  );

// The hook runtime is Windows PowerShell (powershell.exe), and the CI runner is Windows.
// 60 s: queued spawns (see runHook's concurrency cap) wait inside the test timeout.
describe.runIf(process.platform === 'win32')('post-write wiki check', { timeout: TIMEOUT }, () => {
  let vault: TempVault;
  let postHook: HookCommand;
  let stopHook: HookCommand;
  const tempDirs: string[] = [];
  let counter = 0;

  beforeAll(async () => {
    vault = await createTempVault();
    await vault.write(CHECK_PATH, renderSetupFile(checkTemplate()));
    postHook = registeredHook(SETTINGS_TEMPLATE.body, 'PostToolUse', vault.root);
    stopHook = registeredHook(SETTINGS_TEMPLATE.body, 'Stop', vault.root);
  });

  afterAll(async () => {
    await vault.cleanup();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

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

  const missingTitle = (module: string) => {
    const fields = pageFrontmatter({ type: 'concept', title: 'x', module, day: '2026-10-22' });
    delete fields['title'];
    return serialize(fields, '# Habits\n');
  };

  it.each([
    { name: 'no frontmatter', content: () => '# Habits\n' },
    {
      name: 'a frontmatter block that is never closed',
      content: () => '---\ntype: concept\ntitle: Habits\n',
    },
    { name: 'a missing title', content: missingTitle },
    { name: 'an unknown type', content: (module: string) => validPage(module, { type: 'banana' }) },
  ])(
    'a wiki page written without valid frontmatter is reported: $name',
    async ({ content }) => {
      const s = await session();
      const path = s.path('concepts/habits.md');
      const result = await s.write(path, content(s.module));
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(path);
      expect(result.stderr).toContain('invalid frontmatter');
    },
    TIMEOUT,
  );

  it(
    'a wiki page with the schema frontmatter passes',
    async () => {
      const s = await session();
      const page = await s.write(s.path('concepts/habits.md'), validPage(s.module));
      expect({ code: page.code, stderr: page.stderr }).toEqual({ code: 0, stderr: '' });
      // The catalog is structure, not a page: it carries no frontmatter.
      const index = await s.write(s.path('index.md'), '# Index\n');
      expect({ code: index.code, stderr: index.stderr }).toEqual({ code: 0, stderr: '' });
    },
    TIMEOUT,
  );

  it(
    'a file outside the wiki layer is ignored',
    async () => {
      const s = await session();
      const post = await s.write('projects/p.md', '# no frontmatter, no wiki\n');
      expect({ code: post.code, stderr: post.stderr }).toEqual({ code: 0, stderr: '' });
      const stop = await s.stop();
      expect({ code: stop.code, stderr: stop.stderr }).toEqual({ code: 0, stderr: '' });
    },
    TIMEOUT,
  );

  it(
    'a wiki change without a new log entry is reported when the session stops',
    async () => {
      const s = await session();
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      const stop = await s.stop();
      expect(stop.code).toBe(2);
      expect(stop.stderr).toContain(`modules/${s.module}/wiki`);
      expect(stop.stderr).toContain('concepts/habits.md');
    },
    TIMEOUT,
  );

  it(
    'a log entry from an earlier session does not count as new',
    async () => {
      const s = await session();
      await vault.write(s.path('log.md'), '# Log\n\n## [2026-10-01] ingest | earlier\n');
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      expect((await s.stop()).code).toBe(2);
    },
    TIMEOUT,
  );

  it(
    'a wiki change whose log.md was written through the tool stays silent',
    async () => {
      const s = await session();
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      const log = await s.write(s.path('log.md'), '# Log\n\n## [2026-10-22] ingest | habits\n');
      expect(log.code).toBe(0);
      const stop = await s.stop();
      expect({ code: stop.code, stderr: stop.stderr }).toEqual({ code: 0, stderr: '' });
    },
    TIMEOUT,
  );

  it(
    'a wiki change whose log.md grew by a heading on disk stays silent',
    async () => {
      const s = await session();
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      await vault.write(s.path('log.md'), '# Log\n\n## [2026-10-22] lint\n');
      const stop = await s.stop();
      expect({ code: stop.code, stderr: stop.stderr }).toEqual({ code: 0, stderr: '' });
    },
    TIMEOUT,
  );

  it(
    'the log check counts the headings parseLog reads',
    async () => {
      const cases: [line: string, counted: boolean][] = [
        ['## [2026-10-22] ingest | a', true],
        ['## [2026-10-22] lint', true],
        ['##[2026-10-22]query', true],
        ['## [2026-10-22] ingest | a   ', true],
        ['## [2026-10-22] note', false],
        ['## [2026-10-22]', false],
        ['## [2026-10-22] INGEST', false],
        ['### [2026-10-22] ingest', false],
        ['## [26-10-22] ingest', false],
      ];
      for (const [line, counted] of cases) {
        const s = await session();
        await s.write(s.path('concepts/habits.md'), validPage(s.module));
        await vault.write(
          s.path('log.md'),
          `# Log

${line}
`,
        );
        const stop = await s.stop();
        const parsed =
          parseLog(`${line}
`).length > 0;
        expect({ line, parsed }, line).toEqual({ line, parsed: counted });
        expect({ line, code: stop.code }, line).toEqual({ line, code: parsed ? 0 : 2 });
      }
    },
    TIMEOUT * 3,
  );

  it(
    'a repeated stop does not loop',
    async () => {
      const s = await session();
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      const stop = await s.stop(true);
      expect({ code: stop.code, stderr: stop.stderr }).toEqual({ code: 0, stderr: '' });
    },
    TIMEOUT,
  );

  it(
    'a report is made once: the next stop in the session is silent',
    async () => {
      const s = await session();
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      expect((await s.stop()).code).toBe(2);
      expect((await s.stop()).code).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'malformed input never reports',
    async () => {
      const result = await runHook(postHook, 'not json');
      expect({ code: result.code, stdout: result.stdout, stderr: result.stderr }).toEqual({
        code: 0,
        stdout: '',
        stderr: '',
      });
    },
    TIMEOUT,
  );
});
