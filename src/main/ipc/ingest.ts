/* Ingest sources: YouTube, URL, file, text → `raw/` → wiki.

   The truth about running jobs lives in a core `IngestQueue`; this module
   attaches it to the open vault, gives it its environment (fetch, process
   invocation, file system, yt-dlp), and sends every change as
   `event:ingest-progress` to the renderer.

   Three decisions that otherwise aren't visible in the code:
   - **The condensation step is passed in.** The ingest core doesn't know
     `core/wiki`; the two come together here. If a model is missing, the job
     honestly ends as `awaiting-llm` — the raw source is still filed.
   - **Without a target module, nothing gets condensed.** "File later" means:
     the raw source sits in `raw/`, no wiki page is created, and the job
     carries no touched pages. The gardener run later finds it as an
     uncondensed source.
   - **yt-dlp is never fetched on its own.** `ytdlpStatus` only checks;
     downloading happens exclusively via `ytdlpInstall`, i.e. on click. */

import { join } from 'node:path';
import { dialog } from 'electron';
import {
  IngestQueue,
  TERMINAL_STAGES,
  allIngestors,
  innertubeClient,
  installYtdlp,
  logPathFor,
  nodeFileSystem,
  nodeProcessRunner,
  resolveYtdlp,
} from '@core/ingest';
import type { CondenseResult, IngestContext, YtdlpStatus } from '@core/ingest';
import { ingestSource } from '@core/wiki';
import type { IngestJob } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { docLanguage, settle, wikiDeps, wikiStore } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { Services } from '../services';

/** This many jobs run concurrently. */
const CONCURRENCY = 2;

/* The most recently found yt-dlp path. A `resolveYtdlp` per job would start a
   process before anything is even fetched; it's queried instead on status
   check and on install — and the result is cached here. */
const ytdlpCache: { path: string | null } = { path: null };

/* The fallback path without a binary. Built once: the client loads its
   module on first use and keeps the session. */
const innertube = innertubeClient();

/** The managed yt-dlp copy lives next to the settings, not in the vault. */
function binDir(services: Services): string {
  return join(services.userDataDir, 'bin');
}

function ytdlpDeps(services: Services) {
  return {
    fs: nodeFileSystem(),
    run: nodeProcessRunner(),
    platform: process.platform,
    binDir: binDir(services),
  };
}

/** The state as the renderer needs it — without the resolution internals. */
function ytdlpView(status: YtdlpStatus): {
  available: boolean;
  path: string | null;
  version: string | null;
} {
  return { available: status.available, path: status.path, version: status.version };
}

/**
 * Environment for a job: everything that touches network, processes, and
 * files outside the vault. Read freshly per job — the user is allowed to set
 * up yt-dlp while a job is already running.
 *
 * The subtitle languages are derived from the document language: original
 * first, then the language pages are written in, then English. There's no
 * dedicated `ingest` section in the vault settings yet.
 */
function environment(
  services: Services,
): Omit<IngestContext, 'store' | 'onProgress' | 'signal' | 'module'> {
  return {
    fetchImpl: fetch,
    fs: nodeFileSystem(),
    run: nodeProcessRunner(),
    languages: ['original', docLanguage(services), 'en'],
    youtube: {
      ytdlpPath: ytdlpCache.path,
      innertube,
    },
  };
}

/**
 * The queue of the open vault. When the vault changes, the old queue is
 * cancelled: a job writing into a closed vault would be a write with nowhere
 * to go.
 */
class QueueHolder {
  private root: string | null = null;
  private queue: IngestQueue | null = null;

  constructor(private readonly services: Services) {}

  current(): IngestQueue {
    const root = this.services.requireVaultRoot();
    if (this.queue !== null && this.root === root) return this.queue;
    this.queue?.cancelAll();
    this.root = root;
    this.queue = this.build();
    return this.queue;
  }

  private build(): IngestQueue {
    const services = this.services;
    return new IngestQueue({
      store: wikiStore(services),
      ingestors: allIngestors(),
      environment: () => environment(services),
      llmAvailable: () => createGateway(services).isAvailable('summarize-source'),
      concurrency: () => CONCURRENCY,
      condense: ({ job, outcome, signal }) => this.condense(job, outcome, signal),
      onUpdate: (job) => this.publish(job),
    });
  }

  /** Raw source → source page, entities, concepts, catalog, chronicle. */
  private async condense(
    job: IngestJob,
    outcome: { rawPath: string; title: string; text: string; origin: string },
    signal: AbortSignal | undefined,
  ): Promise<CondenseResult> {
    const module = job.module;
    /* "File later": don't invent anything. The raw source is filed, the
       catalog stays untouched, and the source shows up as uncondensed in the
       list. */
    if (module === null || module.length === 0) return { pages: [] };

    const result = await ingestSource(wikiDeps(this.services, signal), {
      rawPath: outcome.rawPath,
      module,
      title: outcome.title,
      text: outcome.text,
      origin: outcome.origin,
    });
    return {
      pages: result.touchedPages,
      sourcePage: result.sourceSlug,
      modules: [result.module],
    };
  }

  /** Every change goes to the renderer; the index catches up at the end. */
  private publish(job: IngestJob): void {
    this.services.sendEvent('event:ingest-progress', job);
    /* Even a cancelled run may have left behind a raw source — the index
       should know about it, instead of missing it until the next start. */
    if (!TERMINAL_STAGES.has(job.stage)) return;
    /* The log belongs too: the index decides by file extension whether a path
       concerns it — and a raw source is often a folder without an extension. */
    const raw = job.rawPath === null ? [] : [job.rawPath, logPathFor(job.rawPath)];
    void settle(this.services, [...raw, ...job.touchedPages], 'ingest').catch(() => undefined);
  }
}

export function ingestHandlers(services: Services): HandlerMap {
  const holder = new QueueHolder(services);

  return defineHandlers({
    'ingest:pickFiles': async () => {
      const parent = services.mainWindow();
      const options = { properties: ['openFile', 'multiSelections'] as const };
      const result = await (parent
        ? dialog.showOpenDialog(parent, { properties: [...options.properties] })
        : dialog.showOpenDialog({ properties: [...options.properties] }));
      return result.canceled ? [] : result.filePaths;
    },

    'ingest:start': ({ kind, input, module }) => {
      const text = String(input ?? '').trim();
      if (text.length === 0) throw fail('invalid', 'ohne Eingabe gibt es keine Quelle');
      return holder.current().add({ kind, input, module: module ?? null });
    },

    'ingest:jobs': () => holder.current().jobs(),

    'ingest:cancel': ({ id }) => {
      holder.current().cancel(id);
    },

    'ingest:retry': ({ id }) => holder.current().retry(id),

    /* Only checks: the path named in settings doesn't exist yet
       (`VaultSettings` has no `ingest` section), so PATH and the managed
       copy are what counts. */
    'ingest:ytdlpStatus': async () => {
      const status = await resolveYtdlp({ ...ytdlpDeps(services), configuredPath: null });
      ytdlpCache.path = status.path;
      return ytdlpView(status);
    },

    /* Click-triggered only: a download nobody initiated would be network
       access behind the user's back. */
    'ingest:ytdlpInstall': async () => {
      const status = await installYtdlp({ ...ytdlpDeps(services), fetchImpl: fetch });
      ytdlpCache.path = status.path;
      return ytdlpView(status);
    },
  });
}
