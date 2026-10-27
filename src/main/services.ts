/* The service container: holds the current vault state, the settings, the key
   store, and the seams to the core. Every IPC handler receives it — it is the
   only mutable spot in the main process.

   For later work, only this API is stable:
     services.status() / openVault() / createVault() / closeVault()
     services.sendEvent(name, payload)
     services.attachVaultStore() / attachIndex() / attachWatcher() / attachLlm()
     services.store() / index() / llm() / requireStore() / requireIndex() / requireLlm()
     services.settings / services.keys / services.vaultRoot() */

import { app, BrowserWindow } from 'electron';
import type { IpcEventName, IpcEvents } from '@shared/ipc';
import type { VaultStatus } from '@shared/types';
import type {
  IndexFactory,
  IndexLike,
  LlmBridge,
  VaultStoreFactory,
  VaultStoreLike,
  VaultWatcherFactory,
  VaultWatcherLike,
} from './contracts';
import type { KeyStore } from './secrets';
import type { SettingsService } from './settings';
import { isAgentJobPath, settleAgentJobsQueued } from './agent-jobs-settle';
import { fail, noVault } from './ipc/errors';
import { ensureStructure, isVault } from './vault-layout';
import { getWorkQueue } from './work-queue';
import { getTaskResults } from './task-results';
import { isDemoVault } from './demo';
import { createUpdateBackend } from './update/backend';
import { createUpdateChecker, detectDistribution } from './update/checker';
import { restartBlocker } from './update/restart-blocker';
import { updateFileFixtureFor, updateFixtureFor } from './update/e2e-fixture';
import { createUpdateService } from './update/service';
import type { UpdateService } from './update/service';

interface OpenVault {
  root: string;
  name: string;
  store: VaultStoreLike | null;
  index: IndexLike | null;
  watcher: VaultWatcherLike | null;
}

const EMPTY_STATUS: VaultStatus = {
  root: null,
  name: null,
  ready: false,
  docCount: 0,
  indexedAt: null,
  indexing: false,
  indexRefreshFailedAt: null,
};

export class Services {
  private open: OpenVault | null = null;
  private indexState = {
    docCount: 0,
    indexedAt: null as string | null,
    indexing: false,
    indexRefreshFailedAt: null as string | null,
  };
  /* Set while a watcher-driven refresh has failed and not yet been superseded
     by a successful one — merged into the next successful refresh's report so
     the paths that failed to index still reach the renderer eventually. */
  private pendingFailedChange: { paths: Set<string>; external: boolean } | null = null;
  private storeFactory: VaultStoreFactory | null = null;
  private indexFactory: IndexFactory | null = null;
  private watcherFactory: VaultWatcherFactory | null = null;
  private llmBridge: LlmBridge | null = null;
  private main: BrowserWindow | null = null;
  /* Serializes `withoutWatcher` calls: without this, two module-lifecycle
     operations racing each other could both see a live watcher, both dispose
     it, and both later recreate one — orphaning whichever recreate lost the
     race (never disposed) instead of leaving exactly one watcher behind. */
  private watcherGate: Promise<unknown> = Promise.resolve();
  private updateService: UpdateService | null = null;

  constructor(
    readonly settings: SettingsService,
    readonly keys: KeyStore,
    readonly userDataDir: string,
  ) {
    this.settings.onChange((snapshot) => this.sendEvent('event:settings', snapshot));
  }

  /* Built on first use: constructing it reads `app.getVersion()`, which the
     many tests that only need settings or the vault never provide. */
  updates(): UpdateService {
    if (this.updateService) return this.updateService;
    const currentVersion = app.getVersion();
    const file = updateFileFixtureFor(currentVersion);
    const fixture = file?.check ?? updateFixtureFor();
    const checker = createUpdateChecker();
    this.updateService = createUpdateService({
      dir: this.userDataDir,
      currentVersion,
      distribution: file?.distribution ?? detectDistribution(process.env),
      check: fixture ?? (() => checker.check()),
      isSupported: () => {
        if (fixture) return { supported: true, disabledReason: null };
        if (!app.isPackaged) return { supported: false, disabledReason: 'unpackaged' };
        if (isDemoVault(this.vaultRoot())) return { supported: false, disabledReason: 'demo' };
        return { supported: true, disabledReason: null };
      },
      onStateChange: (state) => this.sendEvent('event:update', state),
      // The fixture forbids the network, so with it active nothing real may download.
      backend: file?.backend ?? (fixture ? undefined : createUpdateBackend()),
      restartBlocker: () => restartBlocker(this),
    });
    return this.updateService;
  }

  // ── Window ────────────────────────────────────────────────────────────────

  setMainWindow(window: BrowserWindow | null): void {
    this.main = window;
  }

  mainWindow(): BrowserWindow | null {
    return this.main && !this.main.isDestroyed() ? this.main : null;
  }

  /** Sends an event to all open windows. Typed via `IpcEvents`. */
  sendEvent<E extends IpcEventName>(name: E, payload: IpcEvents[E]): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(name, payload);
    }
  }

  // ── Vault state ───────────────────────────────────────────────────────────

  vaultRoot(): string | null {
    return this.open?.root ?? null;
  }

  requireVaultRoot(): string {
    if (!this.open) throw noVault();
    return this.open.root;
  }

  status(): VaultStatus {
    if (!this.open) return { ...EMPTY_STATUS };
    return {
      root: this.open.root,
      name: this.open.name,
      ready: true,
      docCount: this.indexState.docCount,
      indexedAt: this.indexState.indexedAt,
      indexing: this.indexState.indexing,
      indexRefreshFailedAt: this.indexState.indexRefreshFailedAt,
    };
  }

  async openVault(root: string): Promise<VaultStatus> {
    if (!(await isVault(root))) {
      throw fail('not-found', 'in diesem Ordner liegt kein Vault');
    }
    await this.closeVault();
    const layout = await ensureStructure(root);
    await this.settings.openVault(root);
    const store = this.storeFactory ? await this.storeFactory(root) : null;

    /* The vault counts as open from here on, even though the index is still
       missing: otherwise the UI would sit in onboarding while indexing runs
       in the background. `indexing` signals that the numbers aren't final yet. */
    const session: OpenVault = { root, name: layout.name, store, index: null, watcher: null };
    this.open = session;
    this.indexState = { docCount: 0, indexedAt: null, indexing: true, indexRefreshFailedAt: null };
    this.pendingFailedChange = null;
    this.broadcastStatus();
    this.sendEvent('event:index-progress', { done: 0, total: 0, indexing: true });

    if (this.indexFactory && store) {
      try {
        const index = await this.indexFactory(root, store);
        /* If a different vault was opened in the meantime, the index no
           longer belongs here — clean it back up in that case. */
        if (this.open === session) session.index = index;
        else await index.dispose?.();
      } catch (error) {
        /* The index is derived: its failure must not cost the vault. */
        console.warn('[vault] Index ließ sich nicht aufbauen:', error);
      }
    }
    if (this.open !== session) return this.status();

    this.indexState.indexing = false;
    this.sendEvent('event:index-progress', { done: 0, total: 0, indexing: false });

    if (this.watcherFactory) {
      session.watcher = await this.watcherFactory(root, (paths, external) =>
        this.handleVaultChange(paths, external),
      );
    }
    await this.refreshIndexState();
    // Answers that arrived while the app was closed are booked now, not at the next change.
    void settleAgentJobsQueued(this);
    return this.status();
  }

  /* Windows' chokidar recursive watch holds a handle on the vault root that
     deterministically `EPERM`s a directory rename/delete beneath it — not the
     transient antivirus-style lock `fs-io.ts`'s retry-with-backoff already
     covers, but a structural one that only releasing the whole watcher clears
     (`unwatch()` on the subpath alone does not help; chokidar keeps one
     handle on the watched root, not per-subdirectory ones). Folder-moving
     module-lifecycle operations (rename/delete/undo) run their apply through
     here so the watcher steps aside for the duration and always comes back
     — on success, on a conflict, and on a rolled-back write alike. */
  async withoutWatcher<T>(fn: () => Promise<T>): Promise<T> {
    /* A single chain, not a queue: the next caller's dispose→run→recreate
       only starts once the previous one has fully settled (success or
       failure), so two concurrent module-lifecycle operations never both see
       a live watcher to dispose, nor both race to recreate one. */
    const previous = this.watcherGate;
    let release!: () => void;
    this.watcherGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.runWithoutWatcher(fn);
    } finally {
      release();
    }
  }

  private async runWithoutWatcher<T>(fn: () => Promise<T>): Promise<T> {
    const session = this.open;
    if (!session || !session.watcher) return fn();

    await session.watcher.dispose();
    session.watcher = null;

    /* `fn`'s own outcome must reach the caller untouched — a failing watcher
       recreate below is a secondary, derived problem (mirroring the
       `handleVaultChange` index-refresh below: a follow-up must not turn a
       successful action into a failure, nor hide the action's real error). */
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await fn() };
    } catch (error) {
      outcome = { ok: false, error };
    }

    /* The vault may have been closed or reopened while `fn` ran (e.g. it
       opened a different vault) — in that case this session's watcher slot
       is no longer this session's to fill back in, mirroring the same
       `this.open === session` guard `openVault` uses above. */
    if (this.open === session && this.watcherFactory) {
      try {
        session.watcher = await this.watcherFactory(session.root, (paths, external) =>
          this.handleVaultChange(paths, external),
        );
      } catch (error) {
        /* Degraded but safe: the vault is simply left unwatched until the
           next openVault/withoutWatcher call. Never turn `fn`'s success into
           a failure, and never mask `fn`'s own error with this one. */
        console.warn('[modules] Watcher-Wiederaufnahme fehlgeschlagen:', error);
      }
    }

    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  async createVault(root: string, name: string): Promise<VaultStatus> {
    await ensureStructure(root, { name });
    return this.openVault(root);
  }

  async closeVault(): Promise<VaultStatus> {
    /* Work enqueued against the vault that is closing must not keep going
       against the one that opens next (071, D4) — and that now includes a
       maintenance run, which is mirrored onto this queue and cancels its own
       real run through the registry's `onCancel` hook (074, D2). So there is
       one mechanism here, not a direct `cancelGardenerRun` next to it.
       `'shutdown'` is the reason that keeps nothing (021b): the run's own
       caller sees it and persists no partial report. `cancelAll` forces every
       queued/running task terminal; `clear()` then drops those (and any
       earlier finished history) so the list a caller sees right after is
       genuinely empty. */
    getWorkQueue(this).cancelAll('shutdown');
    getWorkQueue(this).clear();
    /* The proposals those tasks produced go with them (073, D3): a result is
       vault content, and Guardrail 6 does not let vault content outlive the
       vault it was read from. */
    getTaskResults().clear();
    const previous = this.open;
    this.open = null;
    this.indexState = { docCount: 0, indexedAt: null, indexing: false, indexRefreshFailedAt: null };
    this.pendingFailedChange = null;
    if (previous) {
      await previous.watcher?.dispose();
      await previous.index?.dispose?.();
      await this.settings.closeVault();
    }
    this.broadcastStatus();
    return this.status();
  }

  // ── Seams to the core ─────────────────────────────────────────────────────

  attachVaultStore(factory: VaultStoreFactory | null): void {
    this.storeFactory = factory;
  }

  attachIndex(factory: IndexFactory | null): void {
    this.indexFactory = factory;
  }

  attachWatcher(factory: VaultWatcherFactory | null): void {
    this.watcherFactory = factory;
  }

  attachLlm(bridge: LlmBridge | null): void {
    this.llmBridge = bridge;
  }

  store(): VaultStoreLike | null {
    return this.open?.store ?? null;
  }

  index(): IndexLike | null {
    return this.open?.index ?? null;
  }

  llm(): LlmBridge | null {
    return this.llmBridge;
  }

  requireStore(): VaultStoreLike {
    if (!this.open) throw noVault();
    if (!this.open.store) throw fail('invalid', 'noch nicht implementiert');
    return this.open.store;
  }

  requireIndex(): IndexLike {
    if (!this.open) throw noVault();
    if (!this.open.index) throw fail('io', 'der Index steht nicht bereit');
    return this.open.index;
  }

  requireLlm(): LlmBridge {
    if (!this.llmBridge) throw fail('llm-unavailable', 'kein LLM-Gateway verfügbar');
    return this.llmBridge;
  }

  // ── Index state ───────────────────────────────────────────────────────────

  /** Reports the progress of an index run to all windows. */
  reportIndexProgress(done: number, total: number, indexing: boolean): void {
    this.indexState.indexing = indexing;
    this.sendEvent('event:index-progress', { done, total, indexing });
    if (!indexing) this.broadcastStatus();
  }

  /** Re-reads the index's metrics, if one is attached. */
  async refreshIndexState(): Promise<void> {
    const index = this.index();
    if (!index) return;
    const stats = await index.stats();
    this.indexState = {
      docCount: stats.docs,
      indexedAt: stats.builtAt,
      indexing: this.indexState.indexing,
      indexRefreshFailedAt: this.indexState.indexRefreshFailedAt,
    };
    this.broadcastStatus();
  }

  /** Clears a previously recorded watcher-refresh failure, e.g. after a successful manual rebuild. */
  clearIndexRefreshFailure(): void {
    if (this.indexState.indexRefreshFailedAt === null) return;
    this.indexState.indexRefreshFailedAt = null;
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    this.sendEvent('event:vault-status', this.status());
  }

  /* The watcher reports; the index catches up, and only then does the message
     go to the renderer — this way the reloaded query finds the new state. A
     failed refresh reports no `event:vault-changed` and instead marks the
     status (Guardrail 6: timestamp only, never the error) so the UI can show
     the index as stale rather than silently reporting success. The failed
     paths are remembered and folded into the next successful refresh's
     report, so nothing gets lost — only delayed. */
  private handleVaultChange(paths: string[], external: boolean): void {
    if (paths.some(isAgentJobPath)) void settleAgentJobsQueued(this);
    const index = this.index();
    if (!index?.refresh) {
      this.sendEvent('event:vault-changed', { paths, external });
      return;
    }
    void (async () => {
      try {
        await index.refresh?.(paths);
        await this.refreshIndexState();
      } catch (error) {
        console.warn('[vault] Index-Nachlauf fehlgeschlagen:', error);
        this.indexState.indexRefreshFailedAt = new Date().toISOString();
        if (this.pendingFailedChange) {
          for (const p of paths) this.pendingFailedChange.paths.add(p);
          this.pendingFailedChange.external = this.pendingFailedChange.external || external;
        } else {
          this.pendingFailedChange = { paths: new Set(paths), external };
        }
        this.broadcastStatus();
        return;
      }

      if (this.pendingFailedChange) {
        const pending = this.pendingFailedChange;
        this.pendingFailedChange = null;
        this.indexState.indexRefreshFailedAt = null;
        const mergedPaths = new Set([...pending.paths, ...paths]);
        this.sendEvent('event:vault-changed', {
          paths: [...mergedPaths],
          external: pending.external || external,
        });
        return;
      }
      this.sendEvent('event:vault-changed', { paths, external });
    })();
  }
}

/** Builds the container. Kept separate from the constructor so startup stays readable. */
export function createServices(
  settings: SettingsService,
  keys: KeyStore,
  userDataDir: string,
): Services {
  return new Services(settings, keys, userDataDir);
}
