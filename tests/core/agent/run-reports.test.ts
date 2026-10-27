/* The newest run report as the vault shows it: read with its skill, time, pages, proposals and
   jobs, or marked unreadable with its path — never a crash, never the file's content. */

import { describe, expect, it } from 'vitest';
import { readLastRun } from '@core/agent/run-reports';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { AGENT_DIRS } from '@shared/types';

const DIR = AGENT_DIRS.runs;

function report(fields: Record<string, string | undefined> = {}): string {
  const base: Record<string, string | undefined> = {
    gaston: 'run-report',
    version: '1',
    skill: 'gaston-curate',
    started: '2026-10-27T09:12:00Z',
    finished: '2026-10-27T09:20:00Z',
    pages: '[]',
    proposals: '[]',
    jobsDone: '[]',
    jobsFailed: '[]',
    jobsSkipped: '[]',
    ...fields,
  };
  const lines = Object.entries(base)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

describe('run reports', () => {
  it('a vault without reports has no last run', async () => {
    expect(await readLastRun(new MemoryVaultStore())).toEqual({ state: 'none' });
    const other = new MemoryVaultStore({ files: { [`${DIR}/notes.txt`]: 'not a report' } });
    expect(await readLastRun(other)).toEqual({ state: 'none' });
  });

  it('the newest report is read with its skill, time, pages, proposals and jobs', async () => {
    const store = new MemoryVaultStore({
      files: {
        [`${DIR}/20261026T080000Z-gaston-jobs.md`]: report({ skill: 'gaston-jobs' }),
        [`${DIR}/20261027T091200Z-gaston-curate.md`]: report({
          argument: 'website-relaunch',
          pages: '[projects/website-relaunch/project.md, notes/plan.md]',
          proposals: '[20261027-091500-plan.md]',
          jobsDone: '[job-1]',
          jobsFailed: '[job-2]',
        }),
        [`${DIR}/20261025T070000Z-gaston-propose.md`]: report({ skill: 'gaston-propose' }),
      },
    });

    expect(await readLastRun(store)).toEqual({
      state: 'read',
      path: `${DIR}/20261027T091200Z-gaston-curate.md`,
      report: {
        skill: 'gaston-curate',
        argument: 'website-relaunch',
        started: '2026-10-27T09:12:00Z',
        finished: '2026-10-27T09:20:00Z',
        pages: ['projects/website-relaunch/project.md', 'notes/plan.md'],
        proposals: ['20261027-091500-plan.md'],
        jobsDone: ['job-1'],
        jobsFailed: ['job-2'],
        jobsSkipped: [],
      },
    });
  });

  it('absent lists read as empty and an absent argument as null', async () => {
    const store = new MemoryVaultStore({
      files: {
        [`${DIR}/20261027T091200Z-gaston-curate.md`]: report({
          pages: undefined,
          proposals: undefined,
          jobsDone: undefined,
          jobsFailed: undefined,
          jobsSkipped: undefined,
        }),
      },
    });

    expect(await readLastRun(store)).toMatchObject({
      state: 'read',
      report: {
        argument: null,
        pages: [],
        proposals: [],
        jobsDone: [],
        jobsFailed: [],
        jobsSkipped: [],
      },
    });
  });

  it.each([
    ['broken frontmatter', '---\nskill: [unclosed\n---\nbody\n'],
    ['no frontmatter', 'Just some text.\n'],
    ['a wrong gaston value', report({ gaston: 'proposal' })],
    ['a missing skill', report({ skill: undefined })],
    ['an empty skill', report({ skill: '""' })],
    ['a start time that is no date', report({ started: 'yesterday' })],
    ['a list that is not a list', report({ pages: 'notes/plan.md' })],
  ])(
    'an unreadable newest report is shown as unreadable with its path (%s)',
    async (_name, text) => {
      const path = `${DIR}/20261027T091200Z-gaston-curate.md`;
      const store = new MemoryVaultStore({
        files: { [`${DIR}/20261026T080000Z-gaston-jobs.md`]: report(), [path]: text },
      });

      const last = await readLastRun(store);

      expect(last).toMatchObject({ state: 'unreadable', path });
      if (last.state !== 'unreadable') return;
      expect(last.reason.length).toBeGreaterThan(0);
      expect(last.reason.length).toBeLessThanOrEqual(200);
      expect(last.reason).not.toContain('unclosed');
    },
  );

  it('a report from a newer Gaston says so', async () => {
    const store = new MemoryVaultStore({
      files: { [`${DIR}/20261027T091200Z-gaston-curate.md`]: report({ version: '2' }) },
    });

    expect(await readLastRun(store)).toMatchObject({
      state: 'unreadable',
      reason: 'Written by a newer Gaston',
    });
  });
});
