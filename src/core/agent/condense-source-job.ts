/* Handing a waiting raw source to the agent, and booking what it answers. The agent writes
   the source page and, ideally, its index and log entries; `.ingest.json` stays Gaston's.
   Everything the result names is untrusted until checked here, and the bookkeeping that
   follows mirrors `writeDigestion`: module lock, one transaction, the protocol last
   (story 090). */

import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { excerpt } from '@core/vault/doc';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import {
  assertSafeVaultPath,
  isoDay,
  moduleDir,
  slugify,
  wikiIndexPath,
  wikiLogPath,
} from '@core/vault/paths';
import { VaultConflictError } from '@core/vault/types';
import { diffIndex, upsertEntries } from '@core/wiki/index-md';
import { appendLog, parseLog, type ParsedLogEntry } from '@core/wiki/log-md';
import { withModuleLock } from '@core/wiki/module-lock';
import { markRawProtocol, protocolPaths, readProtocol } from '@core/wiki/raw-protocol';
import { phrases } from '@core/wiki/text';
import { WikiTransaction } from '@core/wiki/transaction';
import type { WikiStore } from '@core/wiki/types';
import { writeTextWithRetry } from '@core/wiki/write-retry';
import type { AgentJobFile, DocLanguage } from '@shared/types';
import { condenseSourceInstructions } from './condense-source-instructions';
import { agentJobId } from './job-files';
import type {
  AgentDoneResult,
  AgentJobDeps,
  AgentRefusal,
  SettleOutcome,
  Settler,
} from './settler';

const SUMMARY_CHARS = 120;
/** One slug segment; it also rules out `..`, backslashes, drive letters and empty segments. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type HandOverRefusalCode = 'not-a-source' | 'already-condensed' | 'unknown-module';

export class HandOverError extends Error {
  readonly code: HandOverRefusalCode;

  constructor(code: HandOverRefusalCode, message: string) {
    super(message);
    this.name = 'HandOverError';
    this.code = code;
  }
}

export type CondenseRefusalCode =
  'page-missing' | 'invalid-frontmatter' | 'outside-module-wiki' | 'ingest-touched';

export const CONDENSE_REFUSALS: Record<CondenseRefusalCode, string> = {
  'page-missing': 'The result names no source page, or the page does not exist.',
  'invalid-frontmatter':
    'The source page needs type: source, a title and raw set to the handed-over source.',
  'outside-module-wiki':
    "The source page does not lie in an existing module's wiki/sources folder.",
  'ingest-touched': 'The ingest protocol of the source changed after the hand-over.',
};

class ProtocolUnmarkedError extends Error {
  constructor() {
    super('The ingest protocol could not be marked.');
    this.name = 'ProtocolUnmarkedError';
  }
}

export interface HandOverInput {
  rawPath: string;
  module: string | null;
  language: DocLanguage;
}

export interface CondenseSourceValid {
  ok: true;
  module: string;
  slug: string;
  /** Vault-relative: `modules/<module>/wiki/sources/<slug>.md`. */
  path: string;
  raw: string;
  title: string;
  summary: string;
  ingestHash: string;
}

export type CondenseSourceCheck =
  CondenseSourceValid | { ok: false; reason: AgentRefusal<CondenseRefusalCode> };

function refuse(code: CondenseRefusalCode): {
  ok: false;
  reason: AgentRefusal<CondenseRefusalCode>;
} {
  return { ok: false, reason: { code, text: CONDENSE_REFUSALS[code] } };
}

/** `null` when the source has no readable `.ingest.json`: such a hash never matches. */
async function ingestHashOf(store: WikiStore, rawPath: string): Promise<string | null> {
  const found = await readProtocol(store, rawPath);
  return found === null ? null : sha256(found.raw);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function handOverSource(
  deps: Pick<AgentJobDeps, 'store' | 'jobs' | 'now'>,
  input: HandOverInput,
): Promise<{ status: 'filed' | 'exists'; job: AgentJobFile }> {
  let rawPath: string;
  try {
    rawPath = assertSafeVaultPath(input.rawPath);
  } catch {
    throw new HandOverError('not-a-source', 'The path is not a vault path.');
  }
  if (!rawPath.startsWith('raw/') || !(await deps.store.exists(rawPath))) {
    throw new HandOverError('not-a-source', 'There is no raw source at this path.');
  }
  // Without a protocol the app cannot record the condensation, so the source would stay waiting.
  const protocol = await readProtocol(deps.store, rawPath);
  if (protocol === null) {
    throw new HandOverError('not-a-source', 'This source has no readable ingest protocol.');
  }
  if (nonEmpty(protocol.record['sourcePage']) !== null) {
    throw new HandOverError('already-condensed', 'This source is condensed already.');
  }
  // The instructions, the job and the validator must all name the module the same way.
  const module = input.module === null ? null : slugify(input.module);
  if (module !== null && !(await deps.store.exists(moduleDir(module)))) {
    throw new HandOverError('unknown-module', 'There is no such module.');
  }

  const now = (deps.now ?? (() => new Date()))();
  const id = agentJobId('condense-source', rawPath, now);
  const job: AgentJobFile = {
    version: 1,
    id,
    kind: 'condense-source',
    createdAt: now.toISOString(),
    subject: rawPath,
    fields: {
      raw: rawPath,
      module,
      language: input.language,
      title: nonEmpty(protocol.record['title']) ?? rawPath.split('/').pop() ?? rawPath,
      ingestHash: sha256(protocol.raw),
    },
    body: condenseSourceInstructions({ id, rawPath, module, language: input.language }),
  };
  const status = await deps.jobs.file(job);
  if (status === 'filed') return { status, job };
  const open = (await deps.jobs.open()).find(
    (other) => other.kind === job.kind && other.subject === job.subject,
  );
  return { status, job: open ?? job };
}

/**
 * The page the result names, checked segment by segment. A prefix test would accept
 * `modules/a/wiki/sources/../../x.md`; here every segment is either a fixed name or a slug.
 */
export function sourcePageTarget(
  value: unknown,
): { module: string; slug: string; path: string } | null {
  if (typeof value !== 'string') return null;
  const segments = value.split('/');
  if (segments.length !== 5) return null;
  const [root, module = '', wiki, sources, file = ''] = segments;
  if (root !== 'modules' || wiki !== 'wiki' || sources !== 'sources') return null;
  const slug = file.endsWith('.md') ? file.slice(0, -'.md'.length) : '';
  if (!SLUG.test(module) || !SLUG.test(slug)) return null;
  return { module, slug, path: value };
}

/** Where the page really is: a symlinked or junctioned segment resolves somewhere else. */
async function realPlace(
  vaultRoot: string,
  path: string,
): Promise<'inside' | 'outside' | 'missing'> {
  const segments = path.split('/');
  let actual: string;
  try {
    actual = await realpath(join(vaultRoot, ...segments));
  } catch {
    return 'missing';
  }
  return actual === join(await realpath(vaultRoot), ...segments) ? 'inside' : 'outside';
}

export async function validateCondenseSource(
  deps: AgentJobDeps,
  job: AgentJobFile,
  result: AgentDoneResult,
): Promise<CondenseSourceCheck> {
  const raw = nonEmpty(job.fields['raw']) ?? job.subject;
  const jobModule = nonEmpty(job.fields['module']);
  if (nonEmpty(result.fields['sourcePage']) === null) return refuse('page-missing');
  const target = sourcePageTarget(result.fields['sourcePage']);
  if (target === null) return refuse('outside-module-wiki');
  if (jobModule !== null && target.module !== jobModule) return refuse('outside-module-wiki');
  if (!(await deps.store.exists(moduleDir(target.module)))) return refuse('outside-module-wiki');

  const place = await realPlace(deps.vaultRoot, target.path);
  if (place === 'outside') return refuse('outside-module-wiki');
  const text = place === 'missing' ? null : await deps.store.readText(target.path);
  if (text === null) return refuse('page-missing');

  const page = parse(text);
  const fm = page.frontmatter;
  const title = nonEmpty(fm['title']);
  if (!page.hadFrontmatter || fm['type'] !== 'source' || title === null || fm['raw'] !== raw) {
    return refuse('invalid-frontmatter');
  }

  const ingestHash = typeof job.fields['ingestHash'] === 'string' ? job.fields['ingestHash'] : '';
  if ((await ingestHashOf(deps.store, raw)) !== ingestHash) return refuse('ingest-touched');

  return {
    ok: true,
    ...target,
    raw,
    title: title.trim(),
    summary: excerpt(page.body, SUMMARY_CHARS),
    ingestHash,
  };
}

async function addIndexEntry(store: WikiStore, valid: CondenseSourceValid, language: DocLanguage) {
  const path = wikiIndexPath(valid.module);
  const pages = [{ slug: valid.slug, type: 'source' as const, title: valid.title }];
  if (diffIndex((await store.readText(path)) ?? '', pages).missing.length === 0) return;
  const text = phrases(language);
  await writeTextWithRetry(store, path, (current) => {
    const base = current?.content ?? `# ${text.catalog}\n\n${text.catalogIntro}\n`;
    // The agent may have added the line meanwhile; its one-liner then stays.
    if (diffIndex(base, pages).missing.length === 0) return base;
    return upsertEntries(base, [{ type: 'source', slug: valid.slug, summary: valid.summary }], {
      language,
    });
  });
}

function namesPage(entry: ParsedLogEntry, valid: CondenseSourceValid): boolean {
  if (entry.kind !== 'ingest') return false;
  const local = valid.path.slice(`modules/${valid.module}/`.length);
  const summary = entry.fields['summary'];
  return (
    summary === valid.path ||
    summary === local ||
    entry.lines.some((line) => line.includes(`[[${valid.slug}]]`))
  );
}

async function addLogEntry(
  store: WikiStore,
  valid: CondenseSourceValid,
  options: { now: Date; language: DocLanguage },
) {
  const log = parseLog(await store.readText(wikiLogPath(valid.module)), Number.MAX_SAFE_INTEGER);
  if (log.some((entry) => namesPage(entry, valid))) return;
  await appendLog(
    store,
    valid.module,
    {
      kind: 'ingest',
      title: valid.title,
      day: isoDay(options.now),
      summary: valid.path,
      touched: ['index.md'],
    },
    options,
  );
}

/**
 * Books a checked result: index entry, log entry, then the protocol, which says
 * "condensed" and therefore goes last. A protocol that changed meanwhile is a conflict;
 * then the index and log entries are taken back and the job fails as `ingest-touched`.
 */
export async function bookCondenseSource(
  deps: AgentJobDeps,
  valid: CondenseSourceValid,
): Promise<SettleOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const language = deps.docLanguage ?? 'de';
  return withModuleLock(valid.module, async () => {
    // Checked again under the lock: the validation ran without it.
    if ((await ingestHashOf(deps.store, valid.raw)) !== valid.ingestHash) {
      return refuse('ingest-touched');
    }
    const transaction = new WikiTransaction(deps.store);
    try {
      await addIndexEntry(transaction, valid, language);
      await addLogEntry(transaction, valid, { now, language });
      await markRawProtocol(transaction, valid.raw, valid.slug, valid.module);
      // markRawProtocol leaves an unreadable protocol alone; booking must not call that done.
      const marked = await readProtocol(transaction, valid.raw);
      if (marked === null || marked.record['sourcePage'] !== valid.slug) {
        throw new ProtocolUnmarkedError();
      }
      transaction.commit();
      return { ok: true };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('[agent/condense-source] way back incomplete:', rollbackError);
      }
      const protocolConflict =
        error instanceof VaultConflictError && protocolPaths(valid.raw).includes(error.info.path);
      if (protocolConflict || error instanceof ProtocolUnmarkedError) {
        return refuse('ingest-touched');
      }
      throw error;
    }
  });
}

export const settleCondenseSource: Settler = async (deps, job, result) => {
  const check = await validateCondenseSource(deps, job, result);
  return check.ok ? bookCondenseSource(deps, check) : { ok: false, reason: check.reason };
};
