/* Capturing and filing — the path of a thought through the shell.

   dump → (autoClassify) → classify → apply → undo. Deciding and writing
   happen in the core (`@core/capture`); this file holds the flow: who
   refreshes the index after a write, who wakes the renderer, and where a
   finished proposal sits until someone picks it up.

   Two decisions that aren't otherwise visible in the code:
   - `classify` writes nothing. An intermediate `proposed` status in the file
     would be a second source of truth — and every write wakes the watcher,
     which makes the UI reload, which classifies again. Instead the proposal
     lives in memory, keyed to the dump's hash: if the user changes the file,
     it falls away.
   - **There is no threshold for automatic filing.** There used to be a
     setting for it; it never had a reader and is gone. Filing automatically
     would mean writing without anyone confirming (guardrail 2), and a toast
     can't offer an undo for a filing action. */

import {
  applyProposal,
  classifyDump,
  discardDump,
  keepDump,
  undoFiling,
  writeDump,
} from '@core/capture';
import { dumpFromDoc } from '@core/index';
import type { DumpItem, FilingProposal, Project } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { captureIndex, captureStore } from './capture-deps';
import { normalize, withAllTargets } from './capture-proposal';
import { createGateway } from '../llm-bridge';
import type { Services } from '../services';
import { hideQuickCapture, showQuickCapture } from '../quick-capture';

/** This many proposals stay in memory. No inbox needs more. */
const CACHE_LIMIT = 50;

/** After every write: refresh the index, then wake the renderer. */
async function settle(services: Services, paths: readonly string[]): Promise<void> {
  const touched = [...new Set(paths)];
  const index = services.index();
  if (index?.refresh) {
    try {
      await index.refresh(touched);
      await services.refreshIndexState();
    } catch (error) {
      /* The index is derived: its refresh must not retroactively turn a
         successful write into a failure. */
      console.warn('[capture] Index-Nachlauf fehlgeschlagen:', error);
    }
  }
  services.sendEvent('event:vault-changed', { paths: touched, external: false });
}

// ── Proposals in memory ───────────────────────────────────────────────────

/** A proposal, keyed to the hash of the dump it was derived from. */
interface CachedProposal {
  hash: string;
  proposal: FilingProposal;
}

/**
 * The proposal store. It costs nothing and saves the second model call:
 * `autoClassify` deposits here what the inbox picks up later.
 */
class ProposalCache {
  private readonly entries = new Map<string, CachedProposal>();
  /* Classifications in flight, per dump. The background run and the inbox
     often ask about the same dump at the same time — that must not become a
     second model call. */
  private readonly pending = new Map<string, Promise<FilingProposal>>();

  forget(path: string): void {
    this.entries.delete(path);
  }

  /** Proposal for a dump — from memory, otherwise freshly classified. */
  async resolve(services: Services, path: string): Promise<FilingProposal> {
    const store = captureStore(services);
    const doc = await store.read(path);
    if (doc === null) throw fail('not-found', 'diesen Dump gibt es nicht mehr');
    const cached = this.entries.get(path);
    if (cached?.hash === doc.hash) return cached.proposal;
    const running = this.pending.get(path);
    if (running) return running;

    const index = captureIndex(services);
    const now = new Date();
    const docLanguage = services.settings.vault()?.languages.documents ?? 'de';
    const work = classifyDump(
      {
        store,
        index,
        gateway: createGateway(services),
        docLanguage,
        now,
      },
      path,
    ).then((proposal) => withAllTargets(proposal, index, doc.body, now, docLanguage));

    this.pending.set(path, work);
    try {
      const proposal = await work;
      this.remember(path, doc.hash, proposal);
      return proposal;
    } finally {
      this.pending.delete(path);
    }
  }

  private remember(path: string, hash: string, proposal: FilingProposal): void {
    this.entries.set(path, { hash, proposal });
    if (this.entries.size <= CACHE_LIMIT) return;
    const oldest = this.entries.keys().next();
    if (!oldest.done) this.entries.delete(oldest.value);
  }
}

/** Classify a dump in the background afterward. A failure remains visible. */
function autoClassify(services: Services, cache: ProposalCache, path: string): void {
  if (services.settings.vault()?.capture.autoClassify !== true) return;
  void cache.resolve(services, path).catch(() => {
    services.sendEvent('event:toast', { kind: 'warn', message: 'toast.classifyFailed' });
  });
}

// ── Inbox ────────────────────────────────────────────────────────────────────

/** Deliberately left-unfiled items go last; otherwise: newest first. */
function sortDumps(dumps: readonly DumpItem[]): DumpItem[] {
  const rank = (dump: DumpItem): number =>
    dump.status === 'raw' || dump.status === 'proposed' ? 0 : 1;
  return [...dumps].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.created !== b.created) return a.created < b.created ? 1 : -1;
    return a.path.localeCompare(b.path);
  });
}

/**
 * The inbox: what the index knows, plus what sits in `inbox/` and hasn't
 * arrived there yet. A dump that was just written must not appear only once
 * the watcher has caught up.
 */
async function readInbox(services: Services): Promise<DumpItem[]> {
  const store = captureStore(services);
  const index = services.requireIndex();
  const fromIndex = typeof index.dumps === 'function' ? [...index.dumps()] : [];
  const known = new Set(fromIndex.map((dump) => dump.path));
  const found: DumpItem[] = [...fromIndex];

  for await (const entry of store.walk({ dir: 'inbox', ext: '.md' })) {
    if (known.has(entry.path)) continue;
    const doc = await store.read(entry.path);
    if (doc !== null) found.push(dumpFromDoc(doc));
  }
  return sortDumps(found);
}

/** The index's projects — empty if it doesn't derive them. */
function projectsOf(services: Services): readonly Project[] {
  const index = services.requireIndex();
  return typeof index.projects === 'function' ? index.projects() : [];
}

export function captureHandlers(services: Services): HandlerMap {
  const cache = new ProposalCache();

  return defineHandlers({
    'capture:window': ({ show }) => {
      if (show) showQuickCapture(services);
      else hideQuickCapture();
    },

    /* The dump goes to disk immediately. Classification happens afterward,
       in the background — the thought must not wait on any model. */
    'capture:dump': async ({ text, origin, tags, scope }) => {
      const dump = await writeDump(captureStore(services), {
        text,
        origin,
        ...(tags === undefined ? {} : { tags }),
        ...(scope === undefined ? {} : { scope }),
      });
      await settle(services, [dump.path]);
      autoClassify(services, cache, dump.path);
      return dump;
    },

    'capture:inbox': () => readInbox(services),

    'capture:classify': ({ path }) => cache.resolve(services, path),

    'capture:apply': async ({ proposal }) => {
      const docLanguage = services.settings.vault()?.languages.documents ?? 'de';
      const prepared = normalize(proposal, projectsOf(services), docLanguage);
      /* The same document language the proposal was normalized with has to reach
         the write itself: `applyProposal` labels *missing* sections and new project
         files, and without it every filing would fall back to German headings no
         matter what `languages.documents` says. */
      const result = await applyProposal(captureStore(services), prepared, { docLanguage });
      cache.forget(proposal.dumpPath);
      await settle(services, [...result.written, proposal.dumpPath]);
      return result;
    },

    'capture:keep': async ({ path }) => {
      const { dump, undoToken } = await keepDump(captureStore(services), path);
      await settle(services, [path]);
      return { dump, undoToken };
    },

    'capture:discard': async ({ path }) => {
      const removed = await discardDump(captureStore(services), path);
      cache.forget(path);
      await settle(services, [path]);
      return removed;
    },

    'capture:undo': async ({ undoToken }) => {
      const touched = await undoFiling(captureStore(services), undoToken);
      await settle(services, touched);
    },
  });
}
