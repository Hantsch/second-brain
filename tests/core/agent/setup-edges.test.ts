/* A file edited by the user and written by a newer Gaston must survive an older one,
 * whichever record (manifest or in-file marker) still says it is newer. A hard write
 * error on one file is reported as a result and never costs the others theirs. */

import { describe, expect, it } from 'vitest';
import { applySetup } from '@core/agent/setup-apply';
import { readSetupState } from '@core/agent/setup-status';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { sha256 } from '@core/vault/hash';
import { AGENT_SETUP_MANIFEST, AGENT_SKILLS } from '../../../src/shared/types/agent-setup';
import {
  install,
  manifestEntries,
  shippedWith,
  statusOf,
  template,
} from '../../helpers/agent-setup';

const CURATE_SKILL = `.claude/skills/${AGENT_SKILLS.curate}/SKILL.md`;

async function installEditedFromNewer() {
  const store = new MemoryVaultStore();
  await install(store, shippedWith(CURATE_SKILL, template(CURATE_SKILL).version + 1));
  const before = (await store.readText(CURATE_SKILL)) ?? '';
  await store.writeText(CURATE_SKILL, `${before}\nMy own note.\n`);
  return store;
}

async function expectLeftAloneAndRefused(store: MemoryVaultStore) {
  const edited = await store.readText(CURATE_SKILL);
  const state = await readSetupState(store, SETUP_TEMPLATES);

  expect(statusOf(state, CURATE_SKILL)?.status).toBe('newer');
  expect(state.plan.leave).toContainEqual({ path: CURATE_SKILL, status: 'newer' });
  expect(state.plan.optIn.map((item) => item.path)).not.toContain(CURATE_SKILL);

  const { results } = await applySetup(
    store,
    { confirmed: [{ path: CURATE_SKILL, expectedHash: sha256(edited ?? '') }] },
    SETUP_TEMPLATES,
  );
  expect(results.find((r) => r.path === CURATE_SKILL)?.outcome).toBe('refused');
  expect(await store.readText(CURATE_SKILL)).toBe(edited);
}

describe('setup apply edges', () => {
  it('an edited file from a newer Gaston is left alone and never downgraded', async () => {
    await expectLeftAloneAndRefused(await installEditedFromNewer());
  });

  it('an edited file from a newer Gaston stays newer when the manifest is gone', async () => {
    const store = await installEditedFromNewer();
    await store.delete(AGENT_SETUP_MANIFEST);
    await expectLeftAloneAndRefused(store);
  });
});

/** A memory vault in which one chosen call fails the way a locked file does on disk. */
class FaultyStore extends MemoryVaultStore {
  fault: { method: 'writeText' | 'snapshot'; path: string } | null = null;

  private trip(method: 'writeText' | 'snapshot', path: string): void {
    if (this.fault?.method === method && this.fault.path === path) {
      throw Object.assign(new Error('x'), { code: 'EPERM' });
    }
  }

  override async writeText(...args: Parameters<MemoryVaultStore['writeText']>) {
    this.trip('writeText', args[0]);
    return super.writeText(...args);
  }

  override async snapshot(path: string) {
    this.trip('snapshot', path);
    return super.snapshot(path);
  }
}

const SETUP_PATHS = SETUP_TEMPLATES.map((t) => t.path);
const FAILING = SETUP_PATHS[5] ?? '';

async function partiallyInstalled() {
  const store = new FaultyStore();
  store.fault = { method: 'writeText', path: FAILING };
  const { results } = await install(store);
  store.fault = null;
  return { store, results };
}

describe('setup apply with a hard write error', () => {
  it('a failed write keeps the results of every other file and the manifest records only what landed', async () => {
    const { store, results } = await partiallyInstalled();

    const failedAt = results.findIndex((r) => r.path === FAILING);
    expect(results[failedAt]).toEqual({ path: FAILING, outcome: 'failed', reason: 'EPERM' });
    expect(failedAt).toBeGreaterThan(0);
    expect(failedAt).toBeLessThan(results.length - 1);
    const others = results.filter((r) => r.path !== FAILING);
    expect(others.map((r) => r.path).sort()).toEqual(
      SETUP_PATHS.filter((p) => p !== FAILING).sort(),
    );
    expect(others.every((r) => r.outcome === 'written')).toBe(true);

    const recorded = (await manifestEntries(store)).map((entry) => entry.path).sort();
    expect(recorded).toEqual(others.map((r) => r.path).sort());
    expect(await store.readText(FAILING)).toBeNull();
  });

  it('a partial apply leaves the failed file due and offers an update', async () => {
    const { store } = await partiallyInstalled();
    const state = await readSetupState(store, SETUP_TEMPLATES);

    expect(state.action).toBe('update');
    expect(statusOf(state, FAILING)?.status).toBe('missing');
    for (const path of SETUP_PATHS.filter((p) => p !== FAILING)) {
      expect(statusOf(state, path)?.status).toBe('current');
    }
  });

  it('a second apply after a partial one writes the rest', async () => {
    const { store } = await partiallyInstalled();

    const { results } = await install(store);

    expect(results).toEqual([{ path: FAILING, outcome: 'written' }]);
    expect((await readSetupState(store, SETUP_TEMPLATES)).action).toBe('none');
  });

  it('a failing undo copy leaves the edited file untouched', async () => {
    const store = new FaultyStore();
    await install(store);
    const edited = `${(await store.readText(CURATE_SKILL)) ?? ''}
My own note.
`;
    await store.writeText(CURATE_SKILL, edited);
    const state = await readSetupState(store, SETUP_TEMPLATES);
    expect(state.plan.optIn.map((item) => item.path)).toContain(CURATE_SKILL);
    store.fault = { method: 'snapshot', path: CURATE_SKILL };

    const { results } = await install(store);

    expect(results).toContainEqual({ path: CURATE_SKILL, outcome: 'failed', reason: 'EPERM' });
    expect(await store.readText(CURATE_SKILL)).toBe(edited);
  });

  it('a manifest that cannot be written is reported, not thrown', async () => {
    const store = new FaultyStore();
    store.fault = { method: 'writeText', path: AGENT_SETUP_MANIFEST };

    const { results } = await install(store);

    const files = results.filter((r) => r.path !== AGENT_SETUP_MANIFEST);
    expect(files.map((r) => r.path).sort()).toEqual([...SETUP_PATHS].sort());
    expect(files.every((r) => r.outcome === 'written')).toBe(true);
    expect(results).toContainEqual({
      path: AGENT_SETUP_MANIFEST,
      outcome: 'failed',
      reason: 'EPERM',
    });
  });
});
