import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentJobId, createAgentJobFiles } from '@core/agent/job-files';
import { AGENT_DIRS, type AgentJobFile } from '@shared/types';

let root: string;
let clock: Date;
const jobsDir = () => join(root, AGENT_DIRS.jobs);
const resultsDir = () => join(root, AGENT_DIRS.results);

function jobFor(subject: string, at: Date = clock): AgentJobFile {
  return {
    version: 1,
    id: agentJobId('condense-source', subject, at),
    kind: 'condense-source',
    createdAt: at.toISOString(),
    subject,
    fields: { module: 'cooking' },
    body: `Condense the source at ${subject}.\n`,
  };
}

async function writeResult(id: string, content: string): Promise<void> {
  await mkdir(resultsDir(), { recursive: true });
  await writeFile(join(resultsDir(), `${id}.md`), content, 'utf8');
}

async function names(dir: string): Promise<string[]> {
  return (await readdir(dir).catch(() => [])).sort();
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gaston-job-files-'));
  clock = new Date('2026-10-27T09:12:05.000Z');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('agent job files', () => {
  it('a job is one Markdown file named by kind, time and subject', async () => {
    const files = createAgentJobFiles(root, () => clock);
    const job = jobFor('raw/articles/bread.md');

    expect(await files.file(job)).toBe('filed');

    expect(job.id).toMatch(/^condense-source-20261027T091205-[0-9a-f]{8}$/);
    expect(await names(jobsDir())).toEqual([`${job.id}.md`]);
    const written = await readFile(join(jobsDir(), `${job.id}.md`), 'utf8');
    expect(written).toContain('gaston: agent-job');
    expect(written).toContain('Condense the source at raw/articles/bread.md.');
    expect(await files.open()).toEqual([job]);
  });

  it('filing the same open subject again writes no second job', async () => {
    const files = createAgentJobFiles(root, () => clock);
    await files.file(jobFor('raw/articles/bread.md'));

    const later = new Date(clock.getTime() + 60_000);
    expect(await files.file(jobFor('raw/articles/bread.md', later))).toBe('exists');
    expect(await files.file(jobFor('raw/articles/soup.md', later))).toBe('filed');

    expect((await files.open()).map((job) => job.subject)).toEqual([
      'raw/articles/bread.md',
      'raw/articles/soup.md',
    ]);
  });

  it('a finished job moves to done with its outcome and result, and a new hand-over is allowed', async () => {
    const files = createAgentJobFiles(root, () => clock);
    const job = jobFor('raw/articles/bread.md');
    await files.file(job);
    await writeResult(
      job.id,
      '---\njob: x\nstatus: done\nsourcePage: wiki/sources/bread.md\n---\n\nDone.\n',
    );

    expect(await files.result(job.id)).toEqual({
      status: 'done',
      fields: { sourcePage: 'wiki/sources/bread.md' },
      body: 'Done.\n',
    });
    expect(await files.finish(job.id, 'done', null)).toBe(true);

    expect(await files.open()).toEqual([]);
    expect(await names(resultsDir())).toEqual([]);
    expect(await names(join(jobsDir(), 'done'))).toEqual([`${job.id}.md`, `${job.id}.result.md`]);
    expect(await files.finished()).toEqual([
      { job, outcome: 'done', reason: null, finishedAt: clock.toISOString() },
    ]);

    const again = jobFor('raw/articles/bread.md', new Date(clock.getTime() + 1000));
    expect(await files.file(again)).toBe('filed');
  });

  it('an unparseable result counts as no result, a result without status is invalid with a reason', async () => {
    const files = createAgentJobFiles(root, () => clock);
    const job = jobFor('raw/articles/bread.md');
    await files.file(job);

    expect(await files.result(job.id)).toBeNull();
    await writeResult(job.id, '---\nstatus: [done\n---\n');
    expect(await files.result(job.id)).toBeNull();

    await writeResult(job.id, '---\njob: x\nsourcePage: wiki/sources/bread.md\n---\n');
    expect(await files.result(job.id)).toEqual({ invalid: expect.stringContaining('status') });

    await writeResult(job.id, '---\nstatus: failed\n---\n');
    expect(await files.result(job.id)).toEqual({ invalid: expect.stringContaining('reason') });

    await writeResult(job.id, '---\nstatus: skipped\nreason: Not a source.\n---\n');
    expect(await files.result(job.id)).toEqual({ status: 'skipped', reason: 'Not a source.' });
  });

  it('finished jobs older than 30 days are pruned', async () => {
    const files = createAgentJobFiles(root, () => clock);
    const old = jobFor('raw/articles/old.md');
    await files.file(old);
    await files.finish(old.id, 'failed', 'Could not read it.');

    clock = new Date('2026-11-20T09:00:00.000Z');
    const recent = jobFor('raw/articles/recent.md');
    await files.file(recent);
    await files.finish(recent.id, 'skipped', 'Already condensed.');

    clock = new Date('2026-11-27T09:00:00.000Z');
    await files.prune();

    const left = await files.finished();
    expect(left.map((entry) => entry.job.id)).toEqual([recent.id]);
    expect(left[0]?.reason).toBe('Already condensed.');
    expect(await names(join(jobsDir(), 'done'))).toEqual([`${recent.id}.md`]);
  });

  it('a result for a withdrawn job is moved aside and reported as late', async () => {
    const files = createAgentJobFiles(root, () => clock);
    const job = jobFor('raw/articles/bread.md');
    await files.file(job);
    await files.finish(job.id, 'withdrawn', null);
    expect(await files.orphanResults()).toEqual([]);

    await writeResult(job.id, '---\nstatus: done\n---\n\nToo late.\n');
    expect(await files.orphanResults()).toEqual([job.id]);

    await files.discardLateResult(job.id);

    expect(await files.orphanResults()).toEqual([]);
    expect(await names(resultsDir())).toEqual([]);
    expect(await names(join(jobsDir(), 'done'))).toContain(`${job.id}.result.md`);
    expect((await files.finished())[0]?.outcome).toBe('withdrawn');
  });
});
