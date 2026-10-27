import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAuditJob, settleGardenerAudit, validateAuditResult } from '@core/agent/audit-job';
import { createAgentJobFiles } from '@core/agent/job-files';
import type { AgentDoneResult, AgentJobDeps } from '@core/agent/settler';
import { auditFindings, buildFinding } from '@core/gardener';
import type { AuditResult, GardenerContext, StoredRun } from '@core/gardener';
import { gatewayWithReplies } from '../../helpers/llm';
import { createTempVault, type TempVault } from '../../helpers/vault';
import { SETTINGS, gardenerFixture, moduleFixture } from '../gardener/fixtures';

const FIRST = 'modules/wissen/wiki/concepts/sitzungsdauer.md';
const SECOND = 'modules/wissen/wiki/concepts/sitzung-kurz.md';

async function pairContext(): Promise<{ ctx: GardenerContext; run: StoredRun }> {
  const fixture = await moduleFixture('wissen', [
    {
      type: 'concept',
      slug: 'sitzungsdauer',
      title: 'Sitzungsdauer',
      summary: 'Acht Stunden',
      body: 'Eine Sitzung läuft acht Stunden.',
    },
    {
      type: 'concept',
      slug: 'sitzung-kurz',
      title: 'Sitzung, kurze Fassung',
      summary: 'Eine Stunde',
      body: 'Eine Sitzung endet nach einer Stunde.',
    },
  ]);
  const ctx = fixture.ctx({ settings: SETTINGS });
  const duplicate = buildFinding(ctx, {
    kind: 'near-duplicate',
    severity: 'warn',
    title: 'Two pages say the same',
    detail: 'The pages overlap.',
    paths: [FIRST, SECOND],
    module: 'wissen',
    key: [FIRST, SECOND],
  });
  const run: StoredRun = {
    ranAt: '2026-08-10T08:00:00.000Z',
    usedLlm: false,
    findings: [duplicate],
    advice: [],
    size: 2,
  };
  return { ctx, run };
}

function jobFor(ctx: GardenerContext, run: StoredRun) {
  const job = buildAuditJob(ctx, run, new Date('2026-08-10T08:05:00.000Z'));
  if (job === null) throw new Error('the run has pages, so there is a job');
  return job;
}

describe('the audit job of a stored run', () => {
  it('carries ids and paths for the agent, never page content', async () => {
    const { ctx, run } = await pairContext();
    const job = jobFor(ctx, run);

    expect(job).toMatchObject({
      kind: 'gardener-audit',
      subject: run.ranAt,
      fields: { ranAt: run.ranAt, candidateIds: [run.findings[0]?.id], pages: [FIRST, SECOND] },
    });
    expect(JSON.stringify(job)).not.toContain('acht Stunden');
    expect(job.body).toContain(job.id);
  });

  it('a run with nothing to interpret builds no job', async () => {
    const fixture = await gardenerFixture({});
    const run: StoredRun = {
      ranAt: '2026-08-10T08:00:00.000Z',
      usedLlm: false,
      findings: [],
      advice: [],
      size: 0,
    };

    expect(buildAuditJob(fixture.ctx({ settings: SETTINGS }), run)).toBeNull();
  });
});

describe('validating an audit result of the agent', () => {
  it('a result naming a path not in the index fails with that path', async () => {
    const { ctx, run } = await pairContext();
    const answer = {
      contradictions: [
        { pathA: FIRST, pathB: 'modules/wissen/wiki/concepts/erfunden.md', note: 'x' },
      ],
    };

    const check = validateAuditResult(ctx, jobFor(ctx, run), run, answer);

    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason.text).toContain('modules/wissen/wiki/concepts/erfunden.md');
  });

  it('a result confirming a finding that is not a candidate of the run fails with that id', async () => {
    const { ctx, run } = await pairContext();

    const check = validateAuditResult(ctx, jobFor(ctx, run), run, {
      confirmed: ['stale-page:foreign'],
    });

    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason.text).toContain('stale-page:foreign');
  });

  it('a result for a replaced run fails', async () => {
    const { ctx, run } = await pairContext();
    const job = jobFor(ctx, run);

    const check = validateAuditResult(ctx, job, { ...run, ranAt: '2026-08-11T08:00:00.000Z' }, {});

    expect(check).toMatchObject({ ok: false, reason: { code: 'run-replaced' } });
  });

  it('a valid result passes the same check as a model audit', async () => {
    const { ctx, run } = await pairContext();
    const candidate = run.findings[0]?.id ?? '';
    const answer = {
      contradictions: [{ pathA: SECOND, pathB: FIRST, note: 'Eine Stunde gegen acht Stunden.' }],
      confirmed: [candidate],
      rejected: [],
      advice: ['Die kürzere Fassung nachprüfen.'],
    };

    const check = validateAuditResult(ctx, jobFor(ctx, run), run, answer);
    const { gateway } = gatewayWithReplies({ 'gardener-audit': JSON.stringify(answer) });
    const viaModel = await auditFindings(ctx, run.findings, { gateway });

    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.audit).toMatchObject({
        contradictions: viaModel.contradictions,
        confirmed: [candidate],
        advice: viaModel.advice,
      });
    }
  });

  it('the model policy keeps dropping a bad entry silently', async () => {
    const { ctx, run } = await pairContext();
    const answer = { confirmed: ['stale-page:foreign'], advice: ['Eins.'] };
    const { gateway } = gatewayWithReplies({ 'gardener-audit': JSON.stringify(answer) });

    const viaModel = await auditFindings(ctx, run.findings, { gateway });

    expect(viaModel.confirmed).toEqual([]);
    expect(viaModel.advice).toEqual(['Eins.']);
  });
});

describe('settling an audit result', () => {
  let vault: TempVault;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  function depsWith(
    ctx: GardenerContext,
    run: StoredRun | null,
    book: (audit: AuditResult, at: string) => Promise<void>,
  ): AgentJobDeps {
    return {
      vaultRoot: vault.root,
      store: vault.store,
      jobs: createAgentJobFiles(vault.root),
      now: () => new Date('2026-08-10T09:00:00.000Z'),
      gardenerAudit: {
        storedRun: async () => run,
        checkContext: async () => ctx,
        book,
      },
    };
  }

  function done(fields: Record<string, unknown>): AgentDoneResult {
    return { status: 'done', fields, body: '' };
  }

  it('a failing result never calls book', async () => {
    const { ctx, run } = await pairContext();
    const book = vi.fn(async () => undefined);

    const outcome = await settleGardenerAudit(
      depsWith(ctx, run, book),
      jobFor(ctx, run),
      done({ rejected: ['not-a-candidate'] }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: { code: 'invalid-answer' } });
    expect(book).not.toHaveBeenCalled();
  });

  it('a valid result books the cleaned audit once', async () => {
    const { ctx, run } = await pairContext();
    const book = vi.fn(async () => undefined);

    const outcome = await settleGardenerAudit(
      depsWith(ctx, run, book),
      jobFor(ctx, run),
      done({ rejected: [run.findings[0]?.id], advice: ['Eins.'] }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(book).toHaveBeenCalledTimes(1);
    expect(book).toHaveBeenCalledWith(
      expect.objectContaining({ rejected: [run.findings[0]?.id], advice: ['Eins.'] }),
      '2026-08-10T09:00:00.000Z',
    );
  });

  it('refuses honestly where no maintenance state is wired', async () => {
    const { ctx, run } = await pairContext();
    const deps = depsWith(ctx, run, async () => undefined);
    delete deps.gardenerAudit;

    const outcome = await settleGardenerAudit(deps, jobFor(ctx, run), done({}));

    expect(outcome).toMatchObject({ ok: false, reason: { code: 'not-available' } });
  });
});
