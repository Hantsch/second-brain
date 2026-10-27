/* Booking an agent audit through the gardener state file: it writes the run
   back without the pruning a new run applies, and touches nothing at all when
   the run it was asked about is no longer the stored one. */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingId } from '@core/gardener';
import type { AuditResult } from '@core/gardener';
import type { GardenerFinding } from '@shared/types';
import { GARDENER_STATE_FILE, GardenerState } from '../../src/main/gardener-state';
import { TODAY, day, stamp } from '../helpers/time';

const CANDIDATE: GardenerFinding = {
  id: findingId('near-duplicate', 'a+b'),
  kind: 'near-duplicate',
  severity: 'warn',
  title: 'near-duplicate a+b',
  detail: '',
  paths: ['modules/demo/wiki/concepts/a.md'],
  module: 'demo',
  foundAt: stamp(),
  fix: null,
};

const AUDIT: AuditResult = {
  usedLlm: true,
  contradictions: [],
  confirmed: [],
  rejected: [CANDIDATE.id],
  advice: ['Merge a and b.'],
  model: null,
};

describe('booking an agent audit into gardener.json', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sb-gardener-audit-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function stored(): Promise<string> {
    return readFile(join(root, ...GARDENER_STATE_FILE.split('/')), 'utf8');
  }

  async function stateWithRun(): Promise<GardenerState> {
    const state = await GardenerState.load(root, TODAY);
    await state.save({
      ranAt: stamp(-1),
      usedLlm: false,
      findings: [CANDIDATE],
      advice: [],
      size: 10,
    });
    await state.dismiss(CANDIDATE.id);
    await state.snooze(CANDIDATE.id, day(3));
    return state;
  }

  it('leaves the file byte-identical when the stored run has another ranAt', async () => {
    const state = await stateWithRun();
    const before = await stored();

    expect(await state.bookAgentAudit(stamp(-2), AUDIT, stamp())).toBe(false);
    expect(await stored()).toBe(before);
  });

  it('writes the audited run and keeps the dismissal and snooze of a rejected candidate', async () => {
    const state = await stateWithRun();

    expect(await state.bookAgentAudit(stamp(-1), AUDIT, stamp())).toBe(true);

    const reloaded = await GardenerState.load(root, TODAY);
    expect(reloaded.run()?.findings).toEqual([]);
    expect(reloaded.run()?.consideredIds).toContain(CANDIDATE.id);
    expect(reloaded.run()?.audit).toEqual({ by: 'agent', at: stamp() });
    expect(reloaded.dismissed().has(CANDIDATE.id)).toBe(true);
    expect(reloaded.snoozedUntil(CANDIDATE.id)).toBe(day(3));
  });
});
