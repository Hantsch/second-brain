/* The run-report hook leaves one report per Gaston skill run in .secondbrain/agent/runs/. A run
 * opens when a Gaston skill starts, absorbs nested skills, is rewritten at every Stop and closes at
 * the next prompt. Every case runs the installed script through Windows PowerShell exactly as
 * Claude Code starts it, with the hook input on stdin, and reads the result with Gaston's reader. */

import { mkdtemp, readdir, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseRunReport } from '@core/agent/run-reports';
import { renderSetupFile } from '@core/agent/setup-marker';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { AGENT_DIRS } from '@shared/types';
import { registeredHook, runHook, type HookCommand } from '../../helpers/hook';
import { createTempVault, type TempVault } from '../../helpers/vault';

const SCRIPT_PATH = '.claude/hooks/gaston-run-report.ps1';
const TIMEOUT = 60_000;

function reportTemplate() {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === SCRIPT_PATH);
  if (found === undefined) throw new Error(`no template at ${SCRIPT_PATH}`);
  return found;
}

// The hook runtime is Windows PowerShell (powershell.exe), and the CI runner is Windows.
describe.runIf(process.platform === 'win32')('run-report hook', { timeout: TIMEOUT }, () => {
  const cleanups: (() => Promise<void>)[] = [];
  let counter = 0;

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

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

  it("a Gaston skill run ends with exactly one report that Gaston's reader parses", async () => {
    const s = await session();
    await s.page('travel', 'concepts/before.md');
    await s.prompt('/gaston-curate travel');
    await s.page('travel', 'concepts/habits.md');
    await s.vault.write('modules/travel/wiki/log.md', '# Log\n\n## [2026-10-27] curate\n');
    await s.vault.write(
      `${AGENT_DIRS.proposals}/20261027-091500-plan.md`,
      '---\nkind: plan\n---\n',
    );
    await s.vault.write(`${AGENT_DIRS.results}/job-a.json`, '{"status":"done","text":"ok"}');
    await s.vault.write(`${AGENT_DIRS.results}/job-b.json`, '{"status":"failed","reason":"x"}');
    await s.vault.write(`${AGENT_DIRS.results}/job-c.md`, '---\nstatus: skipped\n---\nno source\n');
    await s.stop();

    const names = await s.reports();
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^\d{8}T\d{6}Z-gaston-curate\.md$/);
    const { content, parsed } = await s.report(names[0]!);
    expect(parsed).toMatchObject({
      skill: 'gaston-curate',
      argument: 'travel',
      pages: ['modules/travel/wiki/concepts/habits.md'],
      proposals: ['20261027-091500-plan.md'],
      jobsDone: ['job-a'],
      jobsFailed: ['job-b'],
      jobsSkipped: ['job-c'],
    });
    expect(Date.parse(parsed.finished)).toBeGreaterThanOrEqual(Date.parse(parsed.started));
    expect(content).not.toContain('\r');
    expect(content.charCodeAt(0)).not.toBe(0xfeff);
    expect(content.toLowerCase()).not.toContain(s.vault.root.toLowerCase().replace(/\\/g, '/'));
    expect(content.toLowerCase()).not.toContain(s.vault.root.toLowerCase());
  });

  it("a stop-hook continuation rewrites the run's report instead of adding one", async () => {
    const s = await session();
    await s.prompt('/gaston-curate');
    await s.page('home', 'concepts/one.md');
    await s.stop();
    await s.page('home', 'concepts/two.md');
    await s.stop(true);

    const names = await s.reports();
    expect(names).toHaveLength(1);
    const { parsed } = await s.report(names[0]!);
    expect(parsed.argument).toBeNull();
    expect(parsed.pages).toEqual([
      'modules/home/wiki/concepts/one.md',
      'modules/home/wiki/concepts/two.md',
    ]);
  });

  it('a turn without a Gaston skill writes no report', async () => {
    const s = await session();
    await s.prompt('please look at /gaston-curate later');
    await s.page('home', 'concepts/one.md');
    await s.stop();
    await s.prompt('/gaston-curatex home');
    await s.stop();
    expect(await s.reports()).toEqual([]);

    // The next prompt closes a run: what follows belongs to no report.
    await s.prompt('/gaston-jobs');
    await s.stop();
    await s.prompt('thanks');
    await s.page('home', 'concepts/two.md');
    await s.stop();
    const names = await s.reports();
    expect(names).toHaveLength(1);
    expect((await s.report(names[0]!)).parsed.pages).toEqual([]);
  });

  it('a prompt whose argument is not a slug keeps no argument', async () => {
    const s = await session();
    await s.prompt('/gaston-curate Travel plans for June');
    await s.stop();
    const names = await s.reports();
    expect(names).toHaveLength(1);
    const { content, parsed } = await s.report(names[0]!);
    expect(parsed.argument).toBeNull();
    expect(content).not.toContain('Travel');
  });

  it('a slug argument that YAML would read as another type stays text', async () => {
    const s = await session();
    await s.prompt('/gaston-propose 2026');
    await s.stop();
    const names = await s.reports();
    expect((await s.report(names[0]!)).parsed.argument).toBe('2026');
  });

  it('a nested Gaston skill belongs to the open run', async () => {
    const s = await session();
    await s.prompt('/gaston-jobs');
    await s.skill({ skill: 'gaston-curate', args: 'home' });
    await s.page('home', 'concepts/one.md');
    await s.stop();
    const names = await s.reports();
    expect(names).toHaveLength(1);
    expect((await s.report(names[0]!)).parsed).toMatchObject({
      skill: 'gaston-jobs',
      argument: null,
      pages: ['modules/home/wiki/concepts/one.md'],
    });
  });

  it('a Gaston skill the agent starts on its own opens a run', async () => {
    const s = await session();
    await s.prompt('tidy up the website project');
    await s.skill({ skill: 'gaston-propose', args: 'website' });
    await s.vault.write(
      `${AGENT_DIRS.proposals}/20261027-100000-plan.md`,
      '---\nkind: plan\n---\n',
    );
    await s.stop();
    const names = await s.reports();
    expect(names).toHaveLength(1);
    expect((await s.report(names[0]!)).parsed).toMatchObject({
      skill: 'gaston-propose',
      argument: 'website',
      proposals: ['20261027-100000-plan.md'],
    });
  });

  it('the report folder keeps the newest 50 reports', async () => {
    const s = await session();
    const old = Array.from(
      { length: 50 },
      (_, i) => `20200101T0000${String(i).padStart(2, '0')}Z-gaston-jobs.md`,
    );
    // The lexically oldest name gets the newest write time, so pruning by write time would keep it.
    const base = Date.now() / 1000 - 86_400;
    for (const [i, name] of old.entries()) {
      await s.vault.write(`${AGENT_DIRS.runs}/${name}`, '---\n---\n');
      const when = base + (old.length - i);
      await utimes(join(s.vault.root, AGENT_DIRS.runs, name), when, when);
    }
    await s.prompt('/gaston-jobs');
    await s.stop();
    const names = await s.reports();
    expect(names).toHaveLength(50);
    expect(names).not.toContain(old[0]);
    expect(names).toContain(old[1]);
    expect(names.at(-1)).toMatch(/^\d{8}T\d{6}Z-gaston-jobs\.md$/);
    expect(names.at(-1)).not.toBe(old.at(-1));
  });

  it('malformed input stays silent', async () => {
    const s = await session();
    const result = await runHook(
      registeredHook(SETTINGS_TEMPLATE.body, 'Stop', s.vault.root, SCRIPT_PATH),
      'not json',
    );
    expect({ code: result.code, stdout: result.stdout, stderr: result.stderr }).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
  });
});
