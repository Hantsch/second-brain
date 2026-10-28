/* Cases for the run-report hook that run the real script through Windows PowerShell. A run opens
 * when a Gaston skill starts, absorbs nested skills, is rewritten at every Stop and closes at the
 * next prompt. */

import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AGENT_DIRS } from '@shared/types';
import { registeredHook, runHook } from '../../helpers/hook';
import { createRunReportSessions, SCRIPT_PATH } from '../../helpers/hooks/run-report';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';

const TIMEOUT = 120_000;

// The hook runtime is Windows PowerShell (powershell.exe), and the CI runner is Windows.
describe.runIf(process.platform === 'win32')('run-report hook', { timeout: TIMEOUT }, () => {
  const { session, cleanup } = createRunReportSessions();

  afterAll(cleanup);

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
