/* Accepting an agent proposal writes the target only when the proposal is valid and the
   target is still the one the agent read; every accepted edit has a way back, and every
   resolved proposal is archived instead of deleted. */

import { describe, expect, it } from 'vitest';
import { acceptProposal, rejectProposal } from '@core/agent/proposal-resolve';
import { GardenerError } from '@core/gardener/types';
import { undoFix } from '@core/gardener/undo';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { VaultConflictError } from '@core/vault/types';
import { AGENT_DIRS, AGENT_RESOLVED_DIR } from '@shared/types';
import { listProposals } from '@core/agent/proposals';
import { JOURNAL_PATH, WORK_PROJECT_PATH, captureFixture } from '../capture/fixtures';

const OLD = 'Old text\n';
const NEW = 'New text\n';
const TARGET = 'notes/plan.md';
const DIR = AGENT_DIRS.proposals;
const NOW = new Date(2026, 9, 27, 10, 0, 0);

function proposal(fields: Record<string, string | undefined> = {}, content = NEW): string {
  const base: Record<string, string | undefined> = {
    gaston: 'proposal',
    version: '1',
    kind: 'edit',
    target: TARGET,
    base_hash: sha256(OLD),
    run: 'run-1',
    reason: 'The plan is out of date',
    ...fields,
  };
  const lines = Object.entries(base)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n${content}`;
}

function vaultWith(files: Record<string, string>): MemoryVaultStore {
  return new MemoryVaultStore({
    files: { [TARGET]: OLD, 'journal/2026-10-27.md': 'private\n', ...files },
  });
}

async function trashFiles(store: MemoryVaultStore): Promise<string[]> {
  return store.list({ dir: '.secondbrain/trash', includeInternal: true });
}

describe('accepting an agent proposal', () => {
  it('accepting writes the target, journals the old content in the trash and moves the proposal aside', async () => {
    const store = vaultWith({ [`${DIR}/p1.md`]: proposal() });

    const { undo } = await acceptProposal(store, 'p1', NOW);

    expect(undo.via).toBe('gardener');
    expect(await store.readText(TARGET)).toBe(NEW);
    const journal = JSON.parse(
      (await store.readText(`.secondbrain/trash/${undo.token}/gardener.json`)) ?? '{}',
    ) as { kind: string; steps: { path: string; before: string; hashAfter: string }[] };
    expect(journal.kind).toBe('agent-proposal');
    expect(journal.steps).toEqual([{ path: TARGET, before: OLD, hashAfter: sha256(NEW) }]);
    expect(await store.exists(`${DIR}/p1.md`)).toBe(false);
    const archived = parse((await store.readText(`${AGENT_RESOLVED_DIR}/p1.md`)) ?? '');
    expect(archived.frontmatter).toMatchObject({
      kind: 'edit',
      resolution: 'accepted',
      resolved_at: NOW.toISOString(),
      undo: undo.token,
    });
    expect(archived.body).toBe(NEW);
  });

  it('undoing an accepted proposal restores the target', async () => {
    const store = vaultWith({ [`${DIR}/p1.md`]: proposal() });
    const { undo } = await acceptProposal(store, 'p1', NOW);

    const result = await undoFix(store, undo.token);

    expect(result.restored).toEqual([TARGET]);
    expect(await store.readText(TARGET)).toBe(OLD);
  });

  it('accepting after the target changed is a conflict and writes nothing', async () => {
    const edited = 'The user edited this meanwhile\n';
    const store = vaultWith({ [TARGET]: edited, [`${DIR}/p1.md`]: proposal() });

    await expect(acceptProposal(store, 'p1', NOW)).rejects.toBeInstanceOf(VaultConflictError);

    expect(await store.readText(TARGET)).toBe(edited);
    expect(await trashFiles(store)).toEqual([]);
    expect(await store.readText(`${DIR}/p1.md`)).toBe(proposal());
    expect(await store.exists(`${AGENT_RESOLVED_DIR}/p1.md`)).toBe(false);
  });

  it('accepting an invalid proposal is refused and writes nothing', async () => {
    const files = {
      [`${DIR}/journal.md`]: proposal({ target: 'journal/2026-10-27.md' }),
      [`${DIR}/no-reason.md`]: proposal({ reason: undefined }),
    };
    const store = vaultWith(files);

    for (const id of ['journal', 'no-reason', 'gone', '../x']) {
      const error: unknown = await acceptProposal(store, id, NOW).catch(
        (caught: unknown) => caught,
      );
      expect(error, id).toBeInstanceOf(GardenerError);
      expect(error, id).toMatchObject({ code: 'invalid' });
    }

    expect(await store.readText(TARGET)).toBe(OLD);
    expect(await store.readText('journal/2026-10-27.md')).toBe('private\n');
    expect(await trashFiles(store)).toEqual([]);
    for (const [path, raw] of Object.entries(files)) expect(await store.readText(path)).toBe(raw);
    expect(await store.list({ dir: AGENT_RESOLVED_DIR, includeInternal: true })).toEqual([]);
  });
});

describe('accepting a filing proposal', () => {
  const FILED = 'A thought the agent wants filed\n';

  async function filingVault(): Promise<{
    store: MemoryVaultStore;
    dumpPath: string;
    filing: (fields?: Record<string, string | undefined>) => string;
  }> {
    const fixture = await captureFixture();
    const dump = await fixture.dump('Raw dump text');
    const raw = (await fixture.store.readText(dump.path)) ?? '';
    const filing = (fields: Record<string, string | undefined> = {}): string =>
      proposal(
        {
          kind: 'filing',
          target: dump.path,
          base_hash: sha256(raw),
          file_into: WORK_PROJECT_PATH,
          ...fields,
        },
        FILED,
      );
    return { store: fixture.store, dumpPath: dump.path, filing };
  }

  it('a filing proposal files the dump through the capture flow', async () => {
    const { store, dumpPath, filing } = await filingVault();
    await store.writeText(`${DIR}/f1.md`, filing());
    const before = (await store.readText(WORK_PROJECT_PATH)) ?? '';

    const { undo } = await acceptProposal(store, 'f1', NOW);

    expect(undo.via).toBe('capture');
    expect(undo.token.length).toBeGreaterThan(0);
    expect(await store.readText(WORK_PROJECT_PATH)).toContain(FILED.trim());
    expect(await store.readText(WORK_PROJECT_PATH)).not.toBe(before);
    expect(parse((await store.readText(dumpPath)) ?? '').frontmatter).toMatchObject({
      status: 'filed',
      filed_into: WORK_PROJECT_PATH,
    });
    expect(await store.exists(`${DIR}/f1.md`)).toBe(false);
    const archived = parse((await store.readText(`${AGENT_RESOLVED_DIR}/f1.md`)) ?? '');
    expect(archived.frontmatter).toMatchObject({
      kind: 'filing',
      resolution: 'accepted',
      undo: undo.token,
    });
  });

  it('a filing proposal whose dump changed meanwhile is a conflict and nothing moves', async () => {
    const { store, dumpPath, filing } = await filingVault();
    await store.writeText(`${DIR}/f1.md`, filing());
    const edited = 'The user rewrote the dump\n';
    await store.writeText(dumpPath, edited);
    const project = await store.readText(WORK_PROJECT_PATH);

    await expect(acceptProposal(store, 'f1', NOW)).rejects.toBeInstanceOf(VaultConflictError);

    expect(await store.readText(dumpPath)).toBe(edited);
    expect(await store.readText(WORK_PROJECT_PATH)).toBe(project);
    expect(await store.exists(`${DIR}/f1.md`)).toBe(true);
    expect(await store.exists(`${AGENT_RESOLVED_DIR}/f1.md`)).toBe(false);
  });

  it('a filing proposal into the journal is invalid', async () => {
    const { store, dumpPath, filing } = await filingVault();
    const raw = filing({ file_into: JOURNAL_PATH });
    await store.writeText(`${DIR}/f1.md`, raw);
    const journal = await store.readText(JOURNAL_PATH);
    const dump = await store.readText(dumpPath);

    const views = await listProposals(store);

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      valid: false,
      invalid: { code: 'filing-invalid', detail: 'journal' },
    });
    await expect(acceptProposal(store, 'f1', NOW)).rejects.toMatchObject({ code: 'invalid' });
    expect(await store.readText(JOURNAL_PATH)).toBe(journal);
    expect(await store.readText(dumpPath)).toBe(dump);
    expect(await store.readText(`${DIR}/f1.md`)).toBe(raw);
    expect(await store.exists(`${AGENT_RESOLVED_DIR}/f1.md`)).toBe(false);
  });
});

describe('rejecting an agent proposal', () => {
  it('rejecting moves the proposal aside and leaves the target unchanged', async () => {
    const store = vaultWith({ [`${DIR}/p1.md`]: proposal() });

    await rejectProposal(store, 'p1', NOW);

    expect(await store.readText(TARGET)).toBe(OLD);
    expect(await store.exists(`${DIR}/p1.md`)).toBe(false);
    const archived = parse((await store.readText(`${AGENT_RESOLVED_DIR}/p1.md`)) ?? '');
    expect(archived.frontmatter).toMatchObject({
      resolution: 'rejected',
      resolved_at: NOW.toISOString(),
    });
    expect(archived.frontmatter).not.toHaveProperty('undo');
    expect(await trashFiles(store)).toEqual([]);
  });

  it('a broken proposal can be rejected and keeps its text verbatim in the archive', async () => {
    const broken = '---\nkind: [unclosed\n---\nbody\n';
    const store = vaultWith({ [`${DIR}/broken.md`]: broken });

    await rejectProposal(store, 'broken', NOW);

    const archived = (await store.readText(`${AGENT_RESOLVED_DIR}/broken.md`)) ?? '';
    expect(archived.endsWith(broken)).toBe(true);
    expect(parse(archived).frontmatter).toMatchObject({ resolution: 'rejected' });
  });

  it('a resolved name that is taken gets a free one instead of overwriting', async () => {
    const earlier = '---\nresolution: accepted\n---\nearlier\n';
    const store = vaultWith({
      [`${DIR}/p1.md`]: proposal(),
      [`${AGENT_RESOLVED_DIR}/p1.md`]: earlier,
    });

    await rejectProposal(store, 'p1', NOW);

    expect(await store.readText(`${AGENT_RESOLVED_DIR}/p1.md`)).toBe(earlier);
    const archived = parse((await store.readText(`${AGENT_RESOLVED_DIR}/p1-2.md`)) ?? '');
    expect(archived.frontmatter).toMatchObject({ resolution: 'rejected' });
  });
});
