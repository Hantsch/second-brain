/* Ingest sources: YouTube, URL, file, text → `raw/` → wiki.

   The truth about running jobs lives in a core `IngestQueue`; this module
   attaches it to the open vault, gives it its environment (fetch, process
   invocation, file system, yt-dlp), and mirrors every change onto the one work
   queue (074, D4) — where it is listed and cancellable next to every other
   long-running task, instead of on a channel only the sources screen knew.

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
  IngestError,
  IngestQueue,
  TERMINAL_STAGES,
  analyzeYoutubeResources,
  allIngestors,
  innertubeClient,
  installYtdlp,
  logPathFor,
  loadExistingOutcome,
  logFingerprint,
  nodeFileSystem,
  nodeProcessRunner,
  resolveYtdlp,
  patchIngestLog,
  readIngestLog,
  sourceFingerprint,
  throwIfCancelled,
} from '@core/ingest';
import type {
  CondenseResult,
  IngestContext,
  IngestLogRecord,
  IngestOutcome,
  IngestProgressFn,
  YtdlpStatus,
} from '@core/ingest';
import { ingestSource } from '@core/wiki';
import { assertSafeVaultPath } from '@core/vault/paths';
import type { IngestJob } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import {
  analyzeResourceDetail,
  attachSourceFiles,
  findCondensedTwin,
  findDuplicate,
  sourceDetail,
} from './source-detail';
import { fetchFixtureFor } from './fetch-e2e-fixture';
import { docLanguage, settle, wikiDeps, wikiStore } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import { getWorkQueue } from '../work-queue';
import type { ExternalTaskHandle } from '@core/work/registry';
import type { Services } from '../services';

/** This many jobs run concurrently. */
const CONCURRENCY = 2;

/**
 * `SB_E2E_INGEST_DELAY_MS` — how long a job pauses at the boundary between the
 * raw-source phase and the digestion, in milliseconds. Read and guarded exactly
 * like `SB_E2E_STAGE_DELAY_MS` in `ipc/gardener-run.ts`: same env family as
 * `SB_VAULT` (`main/index.ts`) and `SB_DEMO` (`ipc/app.ts`), set by the check
 * scripts, never by the app.
 *
 * Why it exists (050, D9): with the fake provider the digestion of a pasted text
 * is over in milliseconds, so a spec can never drive a window close *into* a
 * running import — and that, not the resulting wiki page, is what AC3 is about.
 *
 * Anything that is not a positive integer — unset, empty, `0`, `-1`, `1.5`,
 * `abc` — is read as "no delay" and never throws: a mistyped variable must not
 * be able to keep a shipped import from digesting. Then no pause happens at all,
 * and the digestion is the digestion it was before this seam existed.
 */
function ingestDelayFromEnv(): number | undefined {
  const raw = process.env['SB_E2E_INGEST_DELAY_MS']?.trim();
  if (!raw) return undefined;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) return undefined;
  return ms;
}

/* Read once, when this module loads — not per job: the variable belongs to how
   the process was started, and a job that re-read it would let a mid-session
   change turn one import into a different one. */
const INGEST_DELAY_MS = ingestDelayFromEnv();

/**
 * Hold a job at the phase boundary — but never past its own stop.
 *
 * The pause ends on the job's abort signal, not only on the timer, because
 * `IngestQueue.cancel` does nothing but abort: a pause that sat out its full
 * delay would leave "stop" waiting for it, and story 050's whole point is that a
 * stopped digestion writes nothing. The `throwIfCancelled` afterwards is the
 * same guarantee `IngestQueue.run` gives around its own ingestor — a step that
 * was aborted must not report success into the phase that follows it.
 *
 * Fully inert without the variable: the early return happens before the signal
 * is even looked at, so nothing about a shipped digestion changes.
 */
async function holdBetweenPhases(signal: AbortSignal | undefined): Promise<void> {
  if (INGEST_DELAY_MS === undefined) return;
  throwIfCancelled(signal);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, INGEST_DELAY_MS);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
  throwIfCancelled(signal);
}

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
    fetchImpl: fetchFixtureFor() ?? fetch,
    fs: nodeFileSystem(),
    run: nodeProcessRunner(),
    languages: ['original', docLanguage(services), 'en'],
    youtube: {
      ytdlpPath: ytdlpCache.path,
      innertube,
    },
  };
}

/** The codes an `IngestError` may carry — the runtime half of its own type. */
const INGEST_ERROR_CODES: readonly IngestError['code'][] = [
  'invalid',
  'not-found',
  'io',
  'cancelled',
  'unknown',
];

/**
 * A failed job as an error again, for `ExternalTaskHandle.fail`.
 *
 * Reconstructed rather than re-worded: `describeFailure` reads code and text
 * straight off an `IngestError`, so the mirrored task ends up carrying the very
 * failure the job reported. `IngestJob.error` is a plain string on the wire
 * (`IpcError.code`), so a code that is not one of the ingest codes falls back to
 * a plain `Error` — which `describeFailure` files as `unknown`, the honest
 * answer, instead of a code nothing defines.
 */
function jobFailure(job: IngestJob): Error {
  const message = job.message ?? job.error ?? 'Aufnahme gescheitert.';
  const code = INGEST_ERROR_CODES.find((candidate) => candidate === job.error);
  return code === undefined ? new Error(message) : new IngestError(code, message);
}

/**
 * The queue of the open vault. When the vault changes, the old queue is
 * cancelled: a job writing into a closed vault would be a write with nowhere
 * to go.
 */
class QueueHolder {
  private root: string | null = null;
  private queue: IngestQueue | null = null;
  /**
   * The mirrored work task per running ingest job, keyed by `IngestJob.id`.
   *
   * Scoped exactly like `queue` above, and rebuilt with it: `IngestQueue` hands
   * out ids from its own counter, so the next vault's first job is `ingest-1`
   * again — a handle left behind by the closed vault would then be found for a
   * completely different job. An entry lives only while its job is in flight;
   * see `mirror()` for why it goes as soon as the job settles.
   */
  private readonly mirrors = new Map<string, ExternalTaskHandle>();

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
    /* The previous vault's bookkeeping goes with its queue — see `mirrors`. */
    this.mirrors.clear();
    /* `queue` is read inside `onUpdate` only, which nothing calls before the
       constructor has returned. Capturing it there rather than reaching for
       `this.queue` matters for `mirror()`'s cancel hook: that hook has to reach
       the queue this job actually belongs to, even if the vault has switched
       since — never `requireVaultRoot()`, which throws once the vault is gone
       and would take `WorkRegistry.cancelAll('shutdown')` down with it. */
    const queue: IngestQueue = new IngestQueue({
      store: wikiStore(services),
      ingestors: allIngestors(),
      environment: () => environment(services),
      llmAvailable: () => createGateway(services).isAvailable('summarize-source'),
      concurrency: () => CONCURRENCY,
      condense: ({ job, outcome, signal, onProgress }) =>
        this.condense(job, outcome, signal, onProgress),
      onUpdate: (job) => this.publish(queue, job),
    });
    return queue;
  }

  /** Raw source → source page, entities, concepts, catalog, chronicle. */
  private async condense(
    job: IngestJob,
    outcome: IngestOutcome,
    signal: AbortSignal | undefined,
    onProgress: IngestProgressFn | undefined,
  ): Promise<CondenseResult> {
    const module = job.module;
    /* "File later": don't invent anything. The raw source is filed, the
       catalog stays untouched, and the source shows up as uncondensed in the
       list. */
    if (module === null || module.length === 0) return { pages: [] };

    /* The phase boundary the e2e seam pauses at (050, D9), and the only one this
       module owns: the raw source is filed and the queue has just claimed
       `summarizing`, while nothing of the digestion — not the resource report's
       log patch, not a single wiki write — has happened yet. A job held here is
       observably `running` in the work registry, and stopping it leaves the vault
       exactly as the raw phase left it. A pause any later would sit inside
       `ingestSource`'s own transaction window, where "stopped" and "rolled back"
       are no longer the same thing. */
    await holdBetweenPhases(signal);

    if (outcome.kind === 'youtube') {
      const resourceReport = await analyzeYoutubeResources({
        store: wikiStore(this.services),
        gateway: createGateway(this.services),
        rawPath: outcome.rawPath,
        ...(signal === undefined ? {} : { signal }),
      });
      await patchIngestLog(wikiStore(this.services), outcome.rawPath, { resourceReport });
    }

    /* The queue already holds `job.progress` at a fixed 0.85 before this call
       and overwrites it with a fixed 0.95 right after (`wiki-update`, queue.ts)
       — the wiki core's own 0..1 fraction is mapped into that open stretch, so
       the bar keeps moving during the digestion instead of sitting still
       (story 050, D7). */
    const forward =
      onProgress === undefined
        ? undefined
        : (fraction: number): void => {
            onProgress({ stage: 'summarizing', progress: 0.85 + fraction * 0.1, message: null });
          };

    const result = await ingestSource(wikiDeps(this.services, signal, forward), {
      rawPath: outcome.rawPath,
      module,
      title: outcome.title,
      text: outcome.text,
      origin: outcome.origin,
      basis: job.basis,
    });
    return {
      pages: result.touchedPages,
      sourcePage: result.sourceSlug,
      modules: [result.module],
    };
  }

  /**
   * Reflect one ingest job onto the shared work queue (074, D4).
   *
   * A mirror, not a move: `IngestQueue` keeps its own pump, its own
   * concurrency and its own `AbortController` per job — the registry never
   * drives an import, it only shows one and offers to stop it. Hence
   * `startExternal` (never `enqueue`), and hence the `import` lane, which is
   * classification for the Tasks screen and nothing else: the real limit
   * stays `CONCURRENCY` above.
   *
   * Cancelling works from both ends, the same way the maintenance run's mirror
   * does it. Registry → job: `onCancel` reaches the real `IngestQueue.cancel`,
   * so "stop" on the Tasks screen and `cancelAll('shutdown')` on vault close
   * both land on the running import. Job → registry: a job that ends as
   * `error`/`cancelled` settles its task through the registry's own
   * `cancel()` rather than `fail()` — a stop the user asked for must read
   * `cancelled`, not `failed`. Neither direction loops: the registry marks an
   * entry settled before it calls `onCancel`, and both `cancel()` and the
   * handle's own settle methods refuse a second transition.
   */
  private mirror(queue: IngestQueue, job: IngestJob): void {
    const workQueue = getWorkQueue(this.services);
    const known = this.mirrors.get(job.id);
    const handle =
      known ??
      workQueue.startExternal(
        {
          kind: 'ingest',
          lane: 'import',
          subject: { label: job.label, ref: job.rawPath },
          /* The whole job travels as `detail`, so the Tasks screen reads
             ingest's own stages from the task record instead of a second
             channel — see `WorkTask.detail`. */
          detail: job,
        },
        {
          state: job.stage === 'queued' ? 'queued' : 'running',
          /* The reason is deliberately ignored: `IngestQueue.cancel` takes
             none, and a stop is unconditional either way — story 050's
             all-or-nothing rollback is what decides what survives it. */
          onCancel: () => {
            queue.cancel(job.id);
          },
        },
      );
    if (known === undefined) this.mirrors.set(job.id, handle);

    if (!TERMINAL_STAGES.has(job.stage)) {
      /* A no-op once the task is running; the first stage off `queued` is what
         actually starts it. */
      if (job.stage !== 'queued') handle.start();
      handle.update({ progress: job.progress, message: job.message, detail: job });
      return;
    }

    if (job.stage === 'error' && job.error === 'cancelled') {
      workQueue.cancel(handle.id, 'user');
    } else if (job.stage === 'error') {
      handle.fail(jobFailure(job));
    } else {
      /* `done`, `awaiting-llm` and `duplicate` are all honest ends, not
         crashes: there is nothing left to do and nothing broke. */
      handle.update({ progress: job.progress, message: job.message, detail: job });
      handle.finish({ hasResult: false });
    }
    /* The id outlives the task: `IngestQueue.retry` puts the *same* job id back
       to `queued`, and a settled handle cannot be un-settled. Dropping it here
       makes the next publish mint a fresh task — the same choice
       `WorkRegistry.retry` makes for its own records. */
    this.mirrors.delete(job.id);
  }

  /** Every change is mirrored onto the work queue; the index catches up at the end. */
  private publish(queue: IngestQueue, job: IngestJob): void {
    this.mirror(queue, job);
    /* Even a cancelled run may have left behind a raw source — the index
       should know about it, instead of missing it until the next start. */
    if (!TERMINAL_STAGES.has(job.stage)) return;
    /* The log belongs too: the index decides by file extension whether a path
       concerns it — and a raw source is often a folder without an extension. */
    const raw = job.rawPath === null ? [] : [job.rawPath, logPathFor(job.rawPath)];
    void settle(this.services, [...raw, ...job.touchedPages], 'ingest').catch(() => undefined);
  }
}

/**
 * The job that is already working on this raw source, or null. Matched by path
 * and by identity: the same video under a second path would write the same page.
 */
function jobWorkingOn(queue: IngestQueue, rawPath: string, log: IngestLogRecord): IngestJob | null {
  const fingerprint = logFingerprint(log);
  return (
    queue.jobs().find((job) => {
      if (TERMINAL_STAGES.has(job.stage)) return false;
      if (job.rawPath === rawPath) return true;
      /* Without a target module a job never condenses — it doesn't get in the way. */
      return (
        job.module !== null &&
        fingerprint !== null &&
        sourceFingerprint(job.kind, job.input) === fingerprint
      );
    }) ?? null
  );
}

/**
 * The `QueueHolder` behind each open vault's `Services`, kept for
 * `hasPendingJobForModule` below (063, D4). A `WeakMap` rather than a field on
 * `Services` itself: the queue is this file's own state, the same way
 * `ytdlpCache` above is, and a `Services` that closes its vault simply drops
 * out of the map instead of needing to be told to forget it.
 */
const queueHolders = new WeakMap<Services, QueueHolder>();

export function ingestHandlers(services: Services): HandlerMap {
  const holder = new QueueHolder(services);
  queueHolders.set(services, holder);

  return defineHandlers({
    'ingest:pickFiles': async () => {
      const parent = services.mainWindow();
      const options = { properties: ['openFile', 'multiSelections'] as const };
      const result = await (parent
        ? dialog.showOpenDialog(parent, { properties: [...options.properties] })
        : dialog.showOpenDialog({ properties: [...options.properties] }));
      return result.canceled ? [] : result.filePaths;
    },

    'ingest:start': async ({ kind, input, module, force }) => {
      const text = String(input ?? '').trim();
      if (text.length === 0) throw fail('invalid', 'ohne Eingabe gibt es keine Quelle');
      const queue = holder.current();
      if (force !== true) {
        const fingerprint = sourceFingerprint(kind, text);
        const session = queue
          .jobs()
          .find(
            (job) =>
              job.error !== 'cancelled' && sourceFingerprint(job.kind, job.input) === fingerprint,
          );
        if (session?.rawPath === null || session?.rawPath === undefined) {
          if (session !== undefined) return session;
        } else {
          return queue.addDuplicate({ kind, input: text, module: module ?? null }, session.rawPath);
        }
        const duplicate = await findDuplicate(services, kind, text);
        if (duplicate !== null) {
          return queue.addDuplicate({ kind, input: text, module: module ?? null }, duplicate);
        }
      }
      return queue.add({ kind, input: text, module: module ?? null });
    },

    'ingest:jobs': () => holder.current().jobs(),

    'ingest:cancel': ({ id }) => {
      holder.current().cancel(id);
    },

    'ingest:retry': ({ id }) => holder.current().retry(id),

    'ingest:condense': async ({ path, module, basis }) => {
      const target = String(module ?? '').trim();
      if (target.length === 0) throw fail('invalid', 'Verdichtung braucht ein Zielmodul');
      const rawPath = assertSafeVaultPath(path);
      if (!rawPath.startsWith('raw/')) throw fail('invalid', 'keine Rohquelle');
      const store = wikiStore(services);
      const log = await readIngestLog(store, rawPath);
      if (log === null) throw fail('not-found', `keine Rohquelle: ${rawPath}`);
      if (typeof log.sourcePage === 'string' && log.sourcePage.length > 0) {
        throw fail('conflict', 'Quelle ist bereits verdichtet');
      }
      const queue = holder.current();
      /* A second click while the first run is still going: hand back the running
         job instead of condensing the same source twice. */
      const working = jobWorkingOn(queue, rawPath, log);
      if (working !== null) return working;
      /* The same source under a second raw path: it gets condensed once. */
      const twin = await findCondensedTwin(services, rawPath, logFingerprint(log));
      if (twin !== null) throw fail('conflict', `bereits verdichtet: ${twin}`);
      const outcome = await loadExistingOutcome(store, rawPath, { basis });
      /* An explicit digest-from-description click that turns up nothing (no
         description, no chapters) would just start a job that ends hollow —
         reject it up front instead, the same way an empty input to
         `ingest:start` is refused above. */
      if (basis === 'metadata' && outcome.text.trim().length === 0) {
        throw fail('invalid', 'keine Beschreibung zum Verdichten');
      }
      return queue.addExisting(
        { kind: outcome.kind, input: outcome.origin, module: target, basis },
        outcome,
      );
    },

    'ingest:detail': ({ path }) => sourceDetail(services, path),

    'ingest:analyzeResources': async ({ path }) => {
      const detail = await analyzeResourceDetail(services, path);
      await settle(services, [logPathFor(path)], 'ingest');
      return detail;
    },

    'ingest:attachFiles': async ({ path }) => {
      const parent = services.mainWindow();
      const properties = ['openFile', 'multiSelections'] as const;
      const result = await (parent
        ? dialog.showOpenDialog(parent, { properties: [...properties] })
        : dialog.showOpenDialog({ properties: [...properties] }));
      if (result.canceled || result.filePaths.length === 0) return sourceDetail(services, path);
      const attached = await attachSourceFiles(services, path, result.filePaths);
      await settle(services, attached.copied, 'ingest');
      return attached.detail;
    },

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

/**
 * Whether the ingest queue holds a non-terminal job targeting `moduleSlug` —
 * asked by module rename/delete (063, D4) before a plan (→ `blocked:
 * 'digestion-pending'`) and before an apply (→ `conflict`): the lock in
 * `withModuleLock` only covers a running *write* phase, so a queued or
 * running digestion would otherwise recreate `modules/<slug>/` right after
 * the folder was renamed or trashed out from under it.
 *
 * `false` when this `services` never had `ingestHandlers` wired (no vault
 * open yet, or a caller that doesn't ingest) — "nothing pending" is the
 * honest default there, not a thrown error, since there is no queue to ask.
 */
export function hasPendingJobForModule(services: Services, moduleSlug: string): boolean {
  const holder = queueHolders.get(services);
  if (holder === undefined) return false;
  return holder
    .current()
    .jobs()
    .some((job) => job.module === moduleSlug && !TERMINAL_STAGES.has(job.stage));
}
