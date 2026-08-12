/* Der Service-Container: hält den aktuellen Vault-Zustand, die Einstellungen,
   den Schlüsselspeicher und die Nahtstellen zum Kern. Alle IPC-Handler bekommen
   ihn hereingegeben — er ist die einzige veränderliche Stelle im Main.

   Für spätere Arbeitsschritte ist nur diese API stabil:
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

  // ── Fenster ───────────────────────────────────────────────────────────────

  setMainWindow(window: BrowserWindow | null): void {
    this.main = window;
  }

  mainWindow(): BrowserWindow | null {
    return this.main && !this.main.isDestroyed() ? this.main : null;
  }

  /** Schickt ein Ereignis an alle offenen Fenster. Typisiert über `IpcEvents`. */
  sendEvent<E extends IpcEventName>(name: E, payload: IpcEvents[E]): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(name, payload);
    }
  }

  // ── Vault-Zustand ─────────────────────────────────────────────────────────

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

    /* Der Vault gilt ab hier als offen, obwohl der Index noch fehlt: sonst
       stünde die Oberfläche im Onboarding, während im Hintergrund indiziert
       wird. `indexing` sagt, dass die Zahlen noch nicht endgültig sind. */
    const session: OpenVault = { root, name: layout.name, store, index: null, watcher: null };
    this.open = session;
    this.indexState = { docCount: 0, indexedAt: null, indexing: true };
    this.broadcastStatus();
    this.sendEvent('event:index-progress', { done: 0, total: 0, indexing: true });

    if (this.indexFactory && store) {
      try {
        const index = await this.indexFactory(root, store);
        /* Wurde zwischenzeitlich ein anderer Vault geöffnet, gehört der Index
           nicht mehr hierher — dann wieder abräumen. */
        if (this.open === session) session.index = index;
        else await index.dispose?.();
      } catch (error) {
        /* Der Index ist abgeleitet: sein Ausfall darf den Vault nicht kosten. */
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

  // ── Nahtstellen zum Kern ──────────────────────────────────────────────────

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

  // ── Index-Zustand ─────────────────────────────────────────────────────────

  /** Meldet Fortschritt eines Indexlaufs an alle Fenster. */
  reportIndexProgress(done: number, total: number, indexing: boolean): void {
    this.indexState.indexing = indexing;
    this.sendEvent('event:index-progress', { done, total, indexing });
    if (!indexing) this.broadcastStatus();
  }

  /** Liest die Kennzahlen des Index neu ein, falls einer hängt. */
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

  /* Der Watcher meldet; der Index zieht nach und erst dann geht die Nachricht
     an den Renderer — so findet die nachgeladene Query den neuen Stand vor. */
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

/** Baut den Container. Getrennt vom Konstruktor, damit der Start lesbar bleibt. */
export function createServices(
  settings: SettingsService,
  keys: KeyStore,
  userDataDir: string,
): Services {
  return new Services(settings, keys, userDataDir);
}
