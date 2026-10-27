/* Accepting or rejecting a proposal the agent left in `.secondbrain/agent/proposals/`.
   Only the id is trusted: accept re-reads and re-validates the file, journals the target's
   current content before it writes, and writes guarded by the proposal's `base_hash`. A
   resolved proposal is archived under `.secondbrain/agent/resolved/`, never deleted. */

import { GardenerError } from '@core/gardener/types';
import { writeFixJournal } from '@core/gardener/undo';
import { frontmatterText, serialize, splitFrontmatterBlock } from '@core/vault/frontmatter';
import { patchFrontmatterYaml } from '@core/vault/frontmatter-patch';
import { sha256 } from '@core/vault/hash';
import { joinVaultPath, toVaultPath, type DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import { VaultConflictError, type VaultStore } from '@core/vault/types';
import { applyProposal } from '@core/capture';
import { AGENT_RESOLVED_DIR, type FilingProposal } from '@shared/types';
import type { FilingOptions } from './proposal-filing';
import { proposalPathOf, readProposalFull, type ParsedProposal } from './proposals';

/** `capture` tokens go to `capture:undo`, `gardener` tokens to the gardener's undo. */
export interface AcceptProposalResult {
  undo: { via: 'gardener' | 'capture'; token: string };
}

/** The resolution fields, merged into the proposal's frontmatter when it can be patched.
    It is not the shared patch-frontmatter helper because it must tolerate unreadable
    frontmatter, so a broken proposal can still be archived. */
function stamped(raw: string, fields: Record<string, string>): string {
  const yaml = frontmatterText(raw);
  const patched = yaml === null ? null : patchFrontmatterYaml(yaml, fields);
  if (patched !== null) {
    const block = patched.endsWith('\n') ? patched : `${patched}\n`;
    return `---\n${block}---\n${splitFrontmatterBlock(raw).body}`;
  }
  /* Missing or unreadable frontmatter: the record goes in front and the agent's file
     follows byte for byte, so a broken proposal is still archived as written. */
  return `${serialize(fields, '')}${raw}`;
}

/** `<id>.md`, or the first free `<id>-<n>.md` — an earlier resolution is never overwritten. */
async function freeResolvedPath(store: VaultStore, id: string): Promise<string> {
  for (let n = 1; ; n += 1) {
    const path = joinVaultPath(AGENT_RESOLVED_DIR, n === 1 ? `${id}.md` : `${id}-${n}.md`);
    if (!(await store.exists(path))) return path;
  }
}

async function archive(
  store: VaultStore,
  from: string,
  id: string,
  fields: Record<string, string>,
): Promise<void> {
  const to = await freeResolvedPath(store, id);
  await store.move(from, to);
  const raw = (await store.readText(to)) ?? '';
  await store.writeText(to, stamped(raw, fields), { expectedHash: sha256(raw) });
}

function refused(id: string, why: string): GardenerError {
  return new GardenerError('invalid', `Proposal ${id} cannot be accepted: ${why}.`);
}

/**
 * Journal before write, as the gardener's fixes do: the journal carries the hash of the
 * content about to land, so `undoFix` restores the old text only while that content is
 * still what the file holds.
 */
async function acceptEdit(
  store: VaultStore,
  id: string,
  proposal: ParsedProposal,
  baseHash: string,
  at: Date,
): Promise<AcceptProposalResult> {
  const target = toVaultPath(proposal.view.target ?? '');
  const current = await store.readText(target);
  const actualHash = current === null ? '' : sha256(current);
  if (current === null || actualHash !== baseHash) {
    throw new VaultConflictError({ path: target, expectedHash: baseHash, actualHash });
  }
  const token = createUndoToken(at);
  await writeFixJournal(store, token, {
    version: 1,
    kind: 'agent-proposal',
    action: 'agent-proposal',
    steps: [{ path: target, before: current, hashAfter: sha256(proposal.content) }],
  });
  await store.writeText(target, proposal.content, { expectedHash: baseHash });
  await archive(store, proposal.view.path, id, {
    resolution: 'accepted',
    resolved_at: at.toISOString(),
    undo: token,
  });
  return { undo: { via: 'gardener', token } };
}

/**
 * The dump is checked against the proposal's `base_hash` before anything is written, so a
 * dump edited meanwhile fails with a conflict instead of a half-applied filing; the capture
 * flow's own undo token is what takes the filing back.
 */
async function acceptFiling(
  store: VaultStore,
  id: string,
  filing: FilingProposal,
  proposalPath: string,
  baseHash: string,
  at: Date,
  options: Omit<FilingOptions, 'now'>,
): Promise<AcceptProposalResult> {
  const dump = filing.dumpPath;
  const current = await store.readText(dump);
  const actualHash = current === null ? '' : sha256(current);
  if (current === null || actualHash !== baseHash) {
    throw new VaultConflictError({ path: dump, expectedHash: baseHash, actualHash });
  }
  const result = await applyProposal(store, filing, {
    now: at,
    expectedHashes: { [dump]: baseHash },
    ...(options.docLanguage === undefined ? {} : { docLanguage: options.docLanguage }),
  });
  const token = result.undoToken;
  if (token === null) throw refused(id, 'nothing was filed');
  await archive(store, proposalPath, id, {
    resolution: 'accepted',
    resolved_at: at.toISOString(),
    undo: token,
  });
  return { undo: { via: 'capture', token } };
}

/**
 * Apply a proposal. Everything but the id is re-read from disk, so a caller cannot hand in
 * a target or content of its own; an invalid or vanished proposal writes nothing.
 */
export async function acceptProposal(
  store: VaultStore,
  id: string,
  now?: DateLike,
  options: Omit<FilingOptions, 'now'> = {},
): Promise<AcceptProposalResult> {
  const at = new Date(now ?? Date.now());
  const proposal = await readProposalFull(store, id, { ...options, now: at });
  if (proposal === null) throw refused(id, 'not found');
  const { view, baseHash } = proposal;
  if (!view.valid || baseHash === null) throw refused(id, view.invalid?.code ?? 'invalid');
  if (view.kind === 'edit') return acceptEdit(store, id, proposal, baseHash, at);
  if (view.kind === 'filing' && proposal.filing !== null) {
    return acceptFiling(store, id, proposal.filing, proposal.view.path, baseHash, at, options);
  }
  throw refused(id, `kind ${view.kind ?? 'unknown'} is not supported`);
}

/** Archive a proposal unapplied. Never reads the target, so a broken proposal can go too. */
export async function rejectProposal(store: VaultStore, id: string, now?: DateLike): Promise<void> {
  const path = proposalPathOf(id);
  if (path === null || !(await store.exists(path))) {
    throw new GardenerError('not-found', `Proposal ${id} not found.`);
  }
  const at = new Date(now ?? Date.now());
  await archive(store, path, id, { resolution: 'rejected', resolved_at: at.toISOString() });
}
