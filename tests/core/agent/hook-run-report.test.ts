/* The run-report hook leaves one report per Gaston skill run in .secondbrain/agent/runs/. The
 * remaining cases live in hook-run-report.shell.test.ts. */

import { afterAll, describe, expect, it } from 'vitest';
import { AGENT_DIRS } from '@shared/types';
import { createRunReportSessions } from '../../helpers/hooks/run-report';

const TIMEOUT = 120_000;

// The hook runtime is Windows PowerShell (powershell.exe), and the CI runner is Windows.
describe.runIf(process.platform === 'win32')('run-report hook', { timeout: TIMEOUT }, () => {
  const { session, cleanup } = createRunReportSessions();

  afterAll(cleanup);

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
});
