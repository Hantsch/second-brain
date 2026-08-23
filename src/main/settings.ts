/* Two levels of settings, deliberately separated:
   - App settings in `<userData>/settings.json` are tied to the machine
     (window geometry, vault history, language before the first vault).
   - Vault settings in `<vault>/.secondbrain/settings.json` travel with the vault.

   This file doesn't know Electron: the paths are passed in, so the
   settings are testable without a running app. */

import { join } from 'node:path';
import { VAULT_SETTINGS_FILE } from '@shared/types';
import type {
  AppSettings,
  DocLanguage,
  SettingsSnapshot,
  UiLanguage,
  VaultSettings,
  WindowBounds,
} from '@shared/types';
import type { DeepPartial } from '@shared/ipc';
import { deepMerge, readJson, writeJsonAtomic } from './fs-json';
import {
  APP_SETTINGS_VERSION,
  VAULT_SETTINGS_VERSION,
  defaultAppSettings,
  defaultVaultSettings,
} from './settings-defaults';

const APP_SETTINGS_FILE = 'settings.json';
const MAX_RECENT_VAULTS = 8;

/** Called after every change — the service container sends `event:settings` from it. */
export type SettingsListener = (snapshot: SettingsSnapshot) => void;

export class SettingsService {
  private appSettings: AppSettings;
  private vaultSettings: VaultSettings | null = null;
  private vaultRoot: string | null = null;
  private readonly listeners = new Set<SettingsListener>();

  private constructor(
    private readonly userDataDir: string,
    app: AppSettings,
  ) {
    this.appSettings = app;
  }

  /** Loads the app settings; missing fields come from the defaults. */
  static async load(userDataDir: string): Promise<SettingsService> {
    const stored = await readJson<Partial<AppSettings>>(join(userDataDir, APP_SETTINGS_FILE));
    const merged = deepMerge(defaultAppSettings(), stored);
    merged.version = APP_SETTINGS_VERSION;
    return new SettingsService(userDataDir, merged);
  }

  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  app(): AppSettings {
    return this.appSettings;
  }

  vault(): VaultSettings | null {
    return this.vaultSettings;
  }

  snapshot(): SettingsSnapshot {
    return { app: this.appSettings, vault: this.vaultSettings };
  }

  /** The language the UI is currently running in — vault overrides app. */
  uiLanguage(): UiLanguage {
    return this.vaultSettings?.languages.ui ?? this.appSettings.uiLanguage;
  }

  async patchApp(patch: DeepPartial<AppSettings>): Promise<AppSettings> {
    this.appSettings = deepMerge(this.appSettings, patch);
    this.appSettings.version = APP_SETTINGS_VERSION;
    await this.saveApp();
    return this.appSettings;
  }

  async patchVault(patch: DeepPartial<VaultSettings>): Promise<VaultSettings> {
    if (!this.vaultSettings || !this.vaultRoot) {
      throw new Error('Kein Vault geöffnet');
    }
    this.vaultSettings = deepMerge(this.vaultSettings, patch);
    this.vaultSettings.version = VAULT_SETTINGS_VERSION;
    await this.saveVault();
    return this.vaultSettings;
  }

  /**
   * Replaces an entire section of the vault settings. Needed anywhere
   * entries also need to disappear (routing, providers, dashboard) — a
   * merge would resurrect anything deleted.
   */
  async setVaultSection<K extends keyof VaultSettings>(
    key: K,
    value: VaultSettings[K],
  ): Promise<VaultSettings> {
    if (!this.vaultSettings || !this.vaultRoot) {
      throw new Error('Kein Vault geöffnet');
    }
    this.vaultSettings = { ...this.vaultSettings, [key]: value };
    await this.saveVault();
    return this.vaultSettings;
  }

  /** Languages live in the vault as long as one is open — otherwise in the app settings. */
  async setLanguages(next: {
    ui?: UiLanguage;
    documents?: DocLanguage;
    conversation?: UiLanguage;
  }): Promise<SettingsSnapshot> {
    if (this.vaultSettings) {
      await this.patchVault({ languages: next });
    }
    if (next.ui) await this.patchApp({ uiLanguage: next.ui });
    else this.notify();
    return this.snapshot();
  }

  /**
   * Binds the settings to a vault. If the file is missing, it's created
   * with full defaults — there is no vault without settings.
   */
  async openVault(root: string): Promise<VaultSettings> {
    const file = join(root, VAULT_SETTINGS_FILE);
    const stored = await readJson<Partial<VaultSettings>>(file);
    /* A vault opened for the first time has no `stored` languages of its own
       yet — its seed is what the onboarding screen collected before the vault
       existed, not the hardcoded 'de' in `defaultVaultSettings()`. `stored`
       overrides this seed field by field once the vault has its own file. */
    const seed: VaultSettings = {
      ...defaultVaultSettings(),
      languages: { ui: this.appSettings.uiLanguage, ...this.appSettings.newVaultLanguages },
    };
    const merged = deepMerge(seed, stored);
    merged.version = VAULT_SETTINGS_VERSION;
    this.vaultRoot = root;
    this.vaultSettings = merged;
    if (!stored) await this.saveVault();
    await this.rememberVault(root);
    return merged;
  }

  async closeVault(): Promise<void> {
    this.vaultRoot = null;
    this.vaultSettings = null;
    await this.patchApp({ lastVault: null });
  }

  /** Writes the vault into the history and marks it as "last opened". */
  async rememberVault(root: string): Promise<void> {
    const recent = [root, ...this.appSettings.recentVaults.filter((p) => p !== root)].slice(
      0,
      MAX_RECENT_VAULTS,
    );
    await this.patchApp({ lastVault: root, recentVaults: recent });
  }

  async forgetVault(root: string): Promise<void> {
    await this.patchApp({ recentVaults: this.appSettings.recentVaults.filter((p) => p !== root) });
  }

  /** Remembers window geometry. Called throttled while moving the window. */
  async saveWindow(bounds: WindowBounds): Promise<void> {
    await this.patchApp({ window: bounds });
  }

  private async saveApp(): Promise<void> {
    await writeJsonAtomic(join(this.userDataDir, APP_SETTINGS_FILE), this.appSettings);
    this.notify();
  }

  private async saveVault(): Promise<void> {
    if (!this.vaultRoot || !this.vaultSettings) return;
    await writeJsonAtomic(join(this.vaultRoot, VAULT_SETTINGS_FILE), this.vaultSettings);
    this.notify();
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
