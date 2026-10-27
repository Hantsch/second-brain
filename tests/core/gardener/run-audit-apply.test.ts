/* An agent audit booked into a run that is already stored. The run is the
   user's last report and the decisions in the same file hang off its ids, so the
   cases below are the ways a late audit could quietly lose one of them. */

import { describe, expect, it } from 'vitest';
import {
  applyAgentAudit,
  bookAgentAudit,
  empty,
  findingId,
  hasAudit,
  isRunComplete,
  readStoredGardener,
} from '@core/gardener';
import type { AuditResult, StoredGardener, StoredRun } from '@core/gardener';
import type { FindingSeverity, GardenerFinding, GardenerFindingKind } from '@shared/types';
import { day, stamp } from '../../helpers/time';

const AT = stamp(0, '12:00');

function finding(
  kind: GardenerFindingKind,
  key: string,
  module: string | null = 'demo',
  severity: FindingSeverity = 'warn',
): GardenerFinding {
  return {
    id: findingId(kind, key),
    kind,
    severity,
    title: `${kind} ${key}`,
    detail: '',
    paths: [`modules/${module ?? 'none'}/wiki/concepts/${key}.md`],
    module,
    foundAt: stamp(),
    fix: null,
  };
}

const DUPLICATE = finding('near-duplicate', 'a+b');
const MISSING = finding('missing-page', 'gamma');
const ORPHAN = finding('orphan', 'delta', 'demo', 'info');
const CONTRADICTION = finding('contradiction', 'x+y', 'demo', 'high');
const FOREIGN_CONTRADICTION = finding('contradiction', 'p+q', 'other', 'high');

function storedRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    ranAt: stamp(-1),
    usedLlm: false,
    findings: [DUPLICATE, MISSING, ORPHAN],
    consideredIds: [DUPLICATE.id, MISSING.id, ORPHAN.id],
    advice: [],
    size: 10,
    plan: ['checks'],
    completed: ['checks'],
    checkedKinds: ['near-duplicate', 'missing-page', 'orphan'],
    ...overrides,
  };
}

function agentAudit(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    usedLlm: true,
    contradictions: [CONTRADICTION],
    confirmed: [MISSING.id],
    rejected: [DUPLICATE.id],
    advice: ['Merge the two pages on the same topic.'],
    model: null,
    ...overrides,
  };
}

const ids = (findings: readonly GardenerFinding[]): string[] => findings.map((entry) => entry.id);

describe('booking an agent audit into a stored run', () => {
  it('an agent audit drops rejected candidates but keeps them considered', () => {
    const run = storedRun();
    const booked = applyAgentAudit(run, agentAudit(), AT);

    expect(ids(booked.findings)).not.toContain(DUPLICATE.id);
    expect(ids(booked.findings)).toEqual(
      expect.arrayContaining([MISSING.id, ORPHAN.id, CONTRADICTION.id]),
    );
    /* Most severe first, like every stored run. */
    expect(booked.findings[0]?.id).toBe(CONTRADICTION.id);
    expect(booked.consideredIds).toEqual(
      expect.arrayContaining([DUPLICATE.id, MISSING.id, ORPHAN.id, CONTRADICTION.id]),
    );
    expect(booked.advice).toEqual(['Merge the two pages on the same topic.']);
    expect(booked.usedLlm).toBe(true);
    expect(booked.completed).toContain('audit');
    expect(booked.checkedKinds).toContain('contradiction');
    expect(booked.audit).toEqual({ by: 'agent', at: AT });
    expect(booked.ranAt).toBe(run.ranAt);
    expect(booked.size).toBe(run.size);
  });

  it('keeps a rejected candidate considered on a run stored without consideredIds', () => {
    const legacy = storedRun();
    delete legacy.consideredIds;
    const booked = applyAgentAudit(legacy, agentAudit(), AT);
    expect(booked.consideredIds).toContain(DUPLICATE.id);
  });

  it('adds a contradiction once and only inside the scope of a scoped run', () => {
    const run = storedRun({
      findings: [DUPLICATE, CONTRADICTION],
      scope: { kinds: [], module: 'demo' },
    });
    const booked = applyAgentAudit(
      run,
      agentAudit({ contradictions: [CONTRADICTION, FOREIGN_CONTRADICTION], rejected: [] }),
      AT,
    );
    expect(ids(booked.findings).filter((id) => id === CONTRADICTION.id)).toHaveLength(1);
    expect(ids(booked.findings)).not.toContain(FOREIGN_CONTRADICTION.id);
    expect(booked.scope).toEqual(run.scope);
  });

  it('leaves an absent checkedKinds absent', () => {
    const legacy = storedRun();
    delete legacy.checkedKinds;
    expect(applyAgentAudit(legacy, agentAudit(), AT).checkedKinds).toBeUndefined();
  });

  it('an agent audit keeps dismissed and snoozed decisions', () => {
    const data: StoredGardener = {
      ...empty(1),
      run: storedRun(),
      dismissed: [DUPLICATE.id, findingId('contradiction', 'old')],
      snoozed: { [MISSING.id]: day(3), [findingId('orphan', 'gone')]: day(5) },
      fixed: [{ id: ORPHAN.id, undoToken: 'token-1' }],
    };
    const booked = bookAgentAudit(data, data.run?.ranAt ?? '', agentAudit(), AT);

    expect(booked).not.toBeNull();
    expect(booked?.dismissed).toEqual(data.dismissed);
    expect(booked?.snoozed).toEqual(data.snoozed);
    expect(booked?.fixed).toEqual(data.fixed);
    expect(booked?.version).toBe(1);
  });

  it('books nothing into a run that was replaced or never stored', () => {
    const data: StoredGardener = { ...empty(1), run: storedRun() };
    expect(bookAgentAudit(data, stamp(-2), agentAudit(), AT)).toBeNull();
    expect(bookAgentAudit(empty(1), stamp(-1), agentAudit(), AT)).toBeNull();
  });

  it("an applied audit leaves the run's completeness as it was", () => {
    const runs: StoredRun[] = [
      storedRun(),
      storedRun({ plan: ['checks', 'audit'], completed: ['checks', 'audit'] }),
      /* Stopped before the model stage: the agent's answer re-derived nothing,
         so the run stays partial and keeps its frozen score. */
      storedRun({
        plan: ['checks', 'audit'],
        completed: ['checks'],
        healthAsOf: { ranAt: stamp(-5), score: 80, contributions: [] },
      }),
      storedRun({
        plan: ['checks', 'audit', 'loose-ends'],
        completed: ['checks'],
      }),
      storedRun({ scope: { kinds: ['near-duplicate'] } }),
      storedRun({ plan: undefined, completed: undefined }),
    ];
    for (const run of runs) {
      const booked = applyAgentAudit(run, agentAudit(), AT);
      expect(isRunComplete(booked)).toBe(isRunComplete(run));
      expect(booked.plan).toEqual(run.plan);
      expect(booked.healthAsOf).toEqual(run.healthAsOf);
    }
  });

  it('an old run with a model answer counts as audited', () => {
    expect(hasAudit(storedRun({ usedLlm: true }))).toBe(true);
    expect(hasAudit(storedRun())).toBe(false);
    expect(hasAudit(storedRun({ audit: { by: 'agent', at: AT } }))).toBe(true);
  });

  it('a new run whose loose-ends model answered but whose audit did not counts as not audited', () => {
    expect(hasAudit(storedRun({ usedLlm: true, audit: null }))).toBe(false);
  });

  it('a legacy run without the audit field and with a model answer counts as audited', () => {
    const legacy = storedRun({ usedLlm: true });
    expect('audit' in legacy).toBe(false);
    expect(hasAudit(legacy)).toBe(true);
  });

  it('round-trips a null audit through read and keeps it distinct from absent', () => {
    const read = (run: StoredRun): StoredRun | null =>
      readStoredGardener(JSON.parse(JSON.stringify({ run })), 1).run;

    const unaudited = read(storedRun({ usedLlm: true, audit: null }));
    expect(unaudited?.audit).toBeNull();
    expect(hasAudit(unaudited as StoredRun)).toBe(false);
    expect(read(storedRun({ usedLlm: true }))?.audit).toBeUndefined();
  });

  it('reads a malformed audit mark as absent and keeps the run', () => {
    const read = (audit: unknown): StoredRun | null =>
      readStoredGardener({ run: { ...storedRun(), audit } }, 1).run;

    expect(read({ by: 'agent', at: AT })?.audit).toEqual({ by: 'agent', at: AT });
    for (const garbage of [{ by: 'someone', at: AT }, { by: 'model' }, 'agent', 7]) {
      const run = read(garbage);
      expect(run?.ranAt).toBe(stamp(-1));
      expect(run?.audit).toBeUndefined();
    }
  });
});
