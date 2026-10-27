/* Reads and validates the proposals the agent leaves in `.secondbrain/agent/proposals/`.
   An invalid proposal still comes back as a view with a code, never as a throw: the
   human sees why it cannot be accepted. Core sends codes, the renderer words them. */

import { diffLines } from '@core/condense/diff';
import { baseName, isInside, isSafeVaultPath, toVaultPath } from '@core/vault/paths';
import { parse, splitFrontmatterBlock } from '@core/vault/frontmatter';
import type { VaultStore } from '@core/vault/types';
import {
  AGENT_DIRS,
  PROPOSAL_FIELDS,
  PROPOSAL_FILING_FIELDS,
  type AgentProposalView,
  type FilingProposal,
  type ProposalInvalidCode,
} from '@shared/types';
import {
  buildFilingProposal,
  indexSourceFor,
  type FilingOptions,
  type IndexSource,
} from './proposal-filing';

const HASH = /^[0-9a-f]{64}$/;
const FORBIDDEN_DIRS = ['journal', 'raw', '.secondbrain', '.claude'];
const FILING_DIR = 'inbox';

/** A proposal read from disk: the view plus what an accept path needs to apply it. */
export interface ParsedProposal {
  view: AgentProposalView;
  /** Everything after the closing frontmatter line, verbatim. */
  content: string;
  /** The hash of the target the agent based its proposal on; `null` while it is unreadable. */
  baseHash: string | null;
  /** The validated capture proposal of a `filing` proposal; `null` for every other state. */
  filing: FilingProposal | null;
}

type Invalid = { code: ProposalInvalidCode; detail: string | null };

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function isForbidden(target: string): boolean {
  const lower = target.toLowerCase();
  return (
    FORBIDDEN_DIRS.some((dir) => isInside(dir, lower)) ||
    lower === 'claude.md' ||
    baseName(lower) === '.ingest.json'
  );
}

/** The first rule the proposal's fields break, or `null`. Checks the target file last. */
function checkFields(fields: Record<string, unknown>): Invalid | null {
  const required: string[] = [...PROPOSAL_FIELDS];
  if (fields.kind === 'filing') required.push(...PROPOSAL_FILING_FIELDS);
  for (const field of required) {
    if (text(fields[field]) === null) return { code: 'missing-field', detail: field };
  }
  if (fields.kind !== 'edit' && fields.kind !== 'filing') {
    return { code: 'unknown-kind', detail: text(fields.kind) };
  }
  if (!HASH.test(String(fields.base_hash))) return { code: 'bad-hash', detail: null };
  return null;
}

function emptyView(id: string): AgentProposalView {
  return {
    id,
    path: `${AGENT_DIRS.proposals}/${id}.md`,
    kind: null,
    target: null,
    reason: null,
    run: null,
    fileInto: null,
    section: null,
    valid: false,
    invalid: null,
    diff: null,
  };
}

async function parseFile(
  store: VaultStore,
  id: string,
  raw: string,
  source: IndexSource,
  options: FilingOptions,
): Promise<ParsedProposal> {
  const view = emptyView(id);
  const fail = (invalid: Invalid, baseHash: string | null = null): ParsedProposal => ({
    view: { ...view, invalid },
    content: '',
    baseHash,
    filing: null,
  });

  const parsed = parse(raw);
  if (!parsed.hadFrontmatter || parsed.warning !== undefined) {
    return fail({ code: 'unreadable', detail: null });
  }
  const fields = parsed.frontmatter;
  const content = splitFrontmatterBlock(raw).body;
  view.kind = fields.kind === 'edit' || fields.kind === 'filing' ? fields.kind : null;
  view.target = text(fields.target);
  view.reason = text(fields.reason);
  view.run = text(fields.run);
  view.fileInto = text(fields.file_into);
  view.section = text(fields.section);
  const baseHash = text(fields.base_hash);

  const broken = checkFields(fields);
  if (broken) return { ...fail(broken, baseHash), content };
  const target = view.target ?? '';
  if (!isSafeVaultPath(target))
    return { ...fail({ code: 'outside-vault', detail: target }), content };
  const safe = toVaultPath(target);
  if (isForbidden(safe)) return { ...fail({ code: 'forbidden-target', detail: safe }), content };
  if (view.kind === 'filing' && !isInside(FILING_DIR, safe)) {
    return { ...fail({ code: 'forbidden-target', detail: safe }), content };
  }
  const current = await store.readText(safe);
  if (current === null) return { ...fail({ code: 'target-missing', detail: safe }), content };

  let filing: FilingProposal | null = null;
  if (view.kind === 'filing') {
    const checked = await buildFilingProposal(
      {
        dumpPath: safe,
        fileInto: view.fileInto ?? '',
        section: view.section,
        content,
        reason: view.reason ?? '',
      },
      source,
      options.now ?? new Date(),
      options.docLanguage,
    );
    if ('reason' in checked) {
      return { ...fail({ code: 'filing-invalid', detail: checked.reason }, baseHash), content };
    }
    filing = checked.proposal;
  }

  const diff = diffLines(view.kind === 'filing' ? '' : current, content).rows;
  return { view: { ...view, valid: true, diff }, content, baseHash, filing };
}

/** The file of a proposal id; `null` when the id would leave the proposals folder. */
export function proposalPathOf(id: string): string | null {
  const path = `${AGENT_DIRS.proposals}/${id}.md`;
  return /[/\\]/.test(id) || !isSafeVaultPath(path) ? null : path;
}

async function readWith(
  store: VaultStore,
  id: string,
  source: IndexSource,
  options: FilingOptions,
): Promise<ParsedProposal | null> {
  const path = proposalPathOf(id);
  if (path === null) return null;
  const raw = await store.readText(path).catch(() => null);
  if (raw === null) return null;
  return parseFile(store, id, raw, source, options);
}

/** One proposal with its parsed content and base hash; `null` when the file is gone. */
export function readProposalFull(
  store: VaultStore,
  id: string,
  options: FilingOptions = {},
): Promise<ParsedProposal | null> {
  return readWith(store, id, indexSourceFor(store, options.index), options);
}

export async function readProposal(
  store: VaultStore,
  id: string,
  options: FilingOptions = {},
): Promise<AgentProposalView | null> {
  return (await readProposalFull(store, id, options))?.view ?? null;
}

/** Every `.md` file directly in the proposals folder, sorted by id. */
export async function listProposals(
  store: VaultStore,
  options: FilingOptions = {},
): Promise<AgentProposalView[]> {
  const source = indexSourceFor(store, options.index);
  const paths = await store.list({
    dir: AGENT_DIRS.proposals,
    ext: '.md',
    recursive: false,
    includeInternal: true,
  });
  const ids = paths.map((path) => baseName(path).slice(0, -'.md'.length)).sort();
  const views: AgentProposalView[] = [];
  for (const id of ids) {
    const proposal = await readWith(store, id, source, options);
    if (proposal !== null) views.push(proposal.view);
  }
  return views;
}
