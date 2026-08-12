/* Zwei Einstellungsebenen, bewusst getrennt:
   - App-Settings in `<userData>/settings.json` hängen an der Maschine
     (Fenstergeometrie, Vault-Historie, Sprache vor dem ersten Vault).
   - Vault-Settings in `<vault>/.secondbrain/settings.json` reisen mit dem Vault.

   Diese Datei kennt Electron nicht: die Pfade werden hereingegeben, damit die
   Einstellungen ohne laufende App testbar sind. */

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

/** Wird nach jeder Änderung gerufen — der Service-Container schickt daraus `event:settings`. */
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

  /** Lädt die App-Settings; fehlende Felder kommen aus den Defaults. */
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

  /** Die Sprache, in der die Oberfläche gerade läuft — Vault schlägt App. */
  uiLanguage(): UiLanguage {
    return this.vaultSettings?.languages.ui ?? this.appSettings.uiLanguage;
  }

  async patchApp(patch: Partial<AppSettings>): Promise<AppSettings> {
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
   * Ersetzt einen ganzen Abschnitt der Vault-Einstellungen. Nötig überall, wo
   * Einträge auch verschwinden müssen (Routing, Provider, Dashboard) — ein
   * Merge würde Gelöschtes wieder auferstehen lassen.
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

  /** Sprachen sitzen im Vault, solange einer offen ist — sonst in den App-Settings. */
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
   * Bindet die Einstellungen an einen Vault. Fehlt die Datei, wird sie mit
   * vollständigen Defaults angelegt — ein Vault ohne Einstellungen gibt es nicht.
   */
  async openVault(root: string): Promise<VaultSettings> {
    const file = join(root, VAULT_SETTINGS_FILE);
    const stored = await readJson<Partial<VaultSettings>>(file);
    const merged = deepMerge(defaultVaultSettings(), stored);
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

  /** Schreibt den Vault in die Historie und merkt ihn als „zuletzt geöffnet". */
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

  /** Fenstergeometrie merken. Wird beim Verschieben gedrosselt aufgerufen. */
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
