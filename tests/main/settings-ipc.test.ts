/* Die Einstellungs-Kanäle: Deep-Merge, Validierung, Sprachen.
 *
 * Zwei Dinge sollen hier festsitzen. Erstens: eine Änderung ersetzt nur, was sie
 * nennt — alles andere in der Datei bleibt unberührt, auch was diese App nicht
 * kennt (`version` bleibt ihre Sache). Zweitens: was nicht ins Format passt,
 * wird abgewiesen, statt in die Datei zu wandern.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VAULT_SETTINGS_FILE } from '@shared/types';
import type { VaultSettings } from '@shared/types';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { settingsHandlers } = await import('../../src/main/ipc/settings');
  const settings = await SettingsService.load(userDataDir);
  const keys = {
    encryptionAvailable: false,
    has: () => false,
    get: () => null,
    set: async () => ({ persisted: false, encrypted: false }),
    remove: async () => undefined,
    ids: () => [],
  };
  const services = createServices(
    settings,
    keys as unknown as Parameters<typeof createServices>[1],
    userDataDir,
  );
  const handlers: Handlers = settingsHandlers(services);
  /* Async wie in `register()`: ein synchron geworfener Fehler kommt auch dort als
     abgelehntes Versprechen beim Renderer an. */
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };
  return { services, settings, call };
}

describe('Einstellungs-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Awaited<ReturnType<typeof createHarness>>;

  beforeEach(async () => {
    vault = await createTempVault();
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-settings-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  const stored = async (): Promise<VaultSettings> =>
    JSON.parse(await readFile(join(vault.root, VAULT_SETTINGS_FILE), 'utf8')) as VaultSettings;

  it('mergt tief und lässt den Rest des Abschnitts stehen', async () => {
    const snapshot = await harness.call('settings:setVault', {
      patch: { overview: { staleAfterDays: 21 } },
    });

    expect(snapshot.vault?.overview.staleAfterDays).toBe(21);
    /* Der Nachbar im gleichen Abschnitt bleibt, wie er war. */
    expect(snapshot.vault?.overview.deadlineHorizonDays).toBe(14);
    expect((await stored()).overview.staleAfterDays).toBe(21);
  });

  it('klemmt die Frist der Pflege in den erlaubten Bereich', async () => {
    const snapshot = await harness.call('settings:setVault', {
      patch: { gardener: { reviewAfterDays: 1 } },
    });
    /* Ein Tag hielte jede Seite für angestaubt — dann sagt der Befund nichts. */
    expect(snapshot.vault?.gardener.reviewAfterDays).toBe(7);
  });

  it('weist einen Wert ab, den das Format nicht kennt', async () => {
    await expect(
      harness.call('settings:setVault', {
        patch: {
          journal: { mode: 'schimpfen' },
        } as unknown as IpcRequest<'settings:setVault'>['patch'],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect((await stored()).journal.mode).toBe('tips');
  });

  it('lässt Provider nicht über diesen Kanal in die Datei', async () => {
    await expect(
      harness.call('settings:setVault', {
        patch: {
          providers: [{ id: 'x', hasKey: true }],
        } as unknown as IpcRequest<'settings:setVault'>['patch'],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect((await stored()).providers).toEqual([]);
  });

  it('ignoriert erfundene Felder, statt sie zu speichern', async () => {
    await harness.call('settings:setVault', {
      patch: {
        capture: { autoClassify: false, erfunden: 1 },
        erfunden: true,
      } as unknown as IpcRequest<'settings:setVault'>['patch'],
    });
    const file = await readFile(join(vault.root, VAULT_SETTINGS_FILE), 'utf8');
    expect(file).not.toContain('erfunden');
    expect((await stored()).capture.autoClassify).toBe(false);
  });

  it('setzt die drei Sprachen getrennt und merkt die UI-Sprache auch in der App', async () => {
    const snapshot = await harness.call('settings:setLanguages', {
      ui: 'en',
      documents: 'de',
      conversation: 'en',
    });

    expect(snapshot.vault?.languages.ui).toBe('en');
    expect(snapshot.vault?.languages.documents).toBe('de');
    expect(snapshot.vault?.languages.conversation).toBe('en');
    /* Vor dem ersten Vault gilt die App-Sprache — deshalb wandert `ui` mit. */
    expect(snapshot.app.uiLanguage).toBe('en');
  });

  it('weist eine Sprache ab, die es nicht gibt', async () => {
    await expect(
      harness.call('settings:setLanguages', {
        ui: 'kl',
      } as unknown as IpcRequest<'settings:setLanguages'>),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('schickt nach jeder Änderung einen neuen Einstellungsstand', async () => {
    const seen: unknown[] = [];
    harness.settings.onChange((snapshot) => seen.push(snapshot));

    await harness.call('settings:setVault', { patch: { gardener: { runOnOpen: false } } });

    expect(seen.length).toBeGreaterThan(0);
  });

  it('verlangt für Vault-Einstellungen einen offenen Vault', async () => {
    await harness.services.closeVault();
    await expect(
      harness.call('settings:setVault', { patch: { gardener: { runOnOpen: false } } }),
    ).rejects.toMatchObject({ code: 'no-vault' });
  });
});
