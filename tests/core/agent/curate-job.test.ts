import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HandOverError } from '@core/agent/condense-source-job';
import { curateOutcome, fileCurateJob } from '@core/agent/curate-job';
import { createAgentJobFiles } from '@core/agent/job-files';
import { settleAgentJobs, type AgentJobDeps } from '@core/agent/settle-jobs';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { AGENT_DIRS, type AgentRunReport } from '@shared/types';
import { createTempVault, type TempVault } from '../../helpers/vault';

const CLOCK = new Date('2026-10-27T09:00:00.000Z');
const MODULE = 'identity-management';

let vault: TempVault;
let deps: AgentJobDeps;

function run(overrides: Partial<AgentRunReport> = {}): AgentRunReport {
  return {
    skill: 'gaston-curate',
    argument: MODULE,
    started: '2026-10-27T09:10:00.000Z',
    finished: '2026-10-27T09:20:00.000Z',
    pages: [],
    proposals: [],
    jobsDone: [],
    jobsFailed: [],
    jobsSkipped: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vault = await createTempVault({
    sample: true,
    files: { [`modules/${HELP_MODULE_SLUG}/module.md`]: '---\ntitle: Help\n---\n' },
  });
  deps = {
    vaultRoot: vault.root,
    store: vault.store,
    jobs: createAgentJobFiles(vault.root, () => CLOCK),
    now: () => CLOCK,
    docLanguage: 'en',
  };
});

afterEach(async () => {
  await vault.cleanup();
});

describe('handing a module to the agent for curation', () => {
  it('a second hand-over of the same module files no second job', async () => {
    const first = await fileCurateJob(deps, MODULE);
    const again = await fileCurateJob(deps, MODULE);

    expect(first.status).toBe('filed');
    expect(again).toMatchObject({ status: 'exists', job: { id: first.job.id } });
    const open = await deps.jobs.open();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ kind: 'curate-module', subject: MODULE });
    expect(open[0]?.body).toContain(`/gaston-curate ${MODULE}`);
  });

  it('the help module is never filed', async () => {
    await expect(fileCurateJob(deps, HELP_MODULE_SLUG)).rejects.toMatchObject({
      name: 'HandOverError',
      code: 'help-module',
    });
    expect(await deps.jobs.open()).toEqual([]);
  });

  it('an unknown module is refused without writing a job', async () => {
    const attempt = fileCurateJob(deps, 'no-such-module');

    await expect(attempt).rejects.toBeInstanceOf(HandOverError);
    await expect(attempt).rejects.toMatchObject({ code: 'unknown-module' });
    expect(await deps.jobs.open()).toEqual([]);
  });

  it('a done result settles the job without booking anything', async () => {
    const { job } = await fileCurateJob(deps, MODULE);
    await vault.write(
      `${AGENT_DIRS.results}/${job.id}.md`,
      `---\njob: ${job.id}\nstatus: done\n---\n`,
    );

    expect(await settleAgentJobs(deps)).toBe(true);

    expect(await deps.jobs.open()).toEqual([]);
    expect((await deps.jobs.finished()).find((entry) => entry.job.id === job.id)).toMatchObject({
      outcome: 'done',
    });
  });
});

describe('what a curation run did', () => {
  it("the outcome counts the module's pages and the run's proposals from the report", () => {
    const id = 'curate-module-20261027T090000-abcd1234';
    const reports = [
      run({
        finished: '2026-10-26T09:20:00.000Z',
        pages: [`modules/${MODULE}/wiki/old.md`],
        jobsDone: [id],
      }),
      run({
        pages: [
          `modules/${MODULE}/wiki/concepts/a.md`,
          `modules/${MODULE}/wiki/log.md`,
          'modules/other/wiki/concepts/b.md',
          `modules/${MODULE}/raw/c.md`,
        ],
        proposals: ['20261027T091500Z-merge.md'],
        jobsDone: [id],
      }),
    ];

    expect(curateOutcome(id, MODULE, reports)).toEqual({ pagesChanged: 2, proposalsWritten: 1 });
  });

  it('a done result without a report says the report is pending', () => {
    const id = 'curate-module-20261027T090000-abcd1234';

    expect(curateOutcome(id, MODULE, [])).toEqual({ reportPending: true });
    expect(curateOutcome(id, MODULE, [run({ jobsDone: ['another-job'] })])).toEqual({
      reportPending: true,
    });
  });
});
