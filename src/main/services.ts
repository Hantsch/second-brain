/* The service container: holds the current vault state, the settings, the key
   store, and the seams to the core. Every IPC handler receives it — it is the
   only mutable spot in the main process.

   For later work, only this API is stable:
     services.status() / openVault() / createVault() / closeVault()
     services.sendEvent(name, payload)
     services.attachVaultStore() / attachIndex() / attachWatcher() / attachLlm()
     services.store() / index() / llm() / requireStore() / requireIndex() / requireLlm()
     services.settings / services.keys / services.vaultRoot() */

import { BrowserWindow } from 'electron';
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
import { cancelGardenerRun } from './gardener-run-state';
import { fail, noVault } from './ipc/errors';
import { ensureStructure, isVault } from './vault-layout';

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
};

export class Services {
  private open: OpenVault | null = null;
  private indexState = { docCount: 0, indexedAt: null as string | null, indexing: false };
  private storeFactory: VaultStoreFactory | null = null;
  private indexFactory: IndexFactory | null = null;
  private watcherFactory: VaultWatcherFactory | null = null;
  private llmBridge: LlmBridge | null = null;
  private main: BrowserWindow | null = null;

  constructor(
    readonly settings: SettingsService,
    readonly keys: KeyStore,
    readonly userDataDir: string,
  ) {
    this.settings.onChange((snapshot) => this.sendEvent('event:settings', snapshot));
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
    this.indexState = { docCount: 0, indexedAt: null, indexing: true };
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
    return this.status();
  }

  async createVault(root: string, name: string): Promise<VaultStatus> {
    await ensureStructure(root, { name });
    return this.openVault(root);
  }

  async closeVault(): Promise<VaultStatus> {
    /* A maintenance run must not keep writing into a vault that is on its way
       out — and `openVault` closes the old one before opening the next, so
       without this a run would finish into the vault it is being replaced by.
       `'shutdown'` is the reason that keeps nothing (021b): the run's own
       caller sees it and persists no partial report. */
    cancelGardenerRun('shutdown');
    const previous = this.open;
    this.open = null;
    this.indexState = { docCount: 0, indexedAt: null, indexing: false };
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
    };
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    this.sendEvent('event:vault-status', this.status());
  }

  /* The watcher reports; the index catches up, and only then does the message
     go to the renderer — this way the reloaded query finds the new state. */
  private handleVaultChange(paths: string[], external: boolean): void {
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
