/* Die LLM-Kanäle im Hauptprozess — an echten Dateien, mit gefälschtem `fetch`.
 *
 * Der Prüfstein dieser Datei ist der Schlüssel: er kommt herein, verschwindet im
 * Schlüsselspeicher und darf danach in keiner Antwort, keiner Fehlermeldung und
 * in keiner Datei des Vaults mehr auftauchen. Alles andere (anlegen, testen,
 * Modelle holen, entfernen, Routing vorschlagen) wird gleich mitgeprüft.
 *
 * Kein Netz: `fetch` ist global ersetzt, `AbortSignal.timeout` bleibt unbenutzt.
 */

import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VAULT_SETTINGS_FILE } from '@shared/types';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { createFetchFake, jsonResponse, textResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

const API_KEY = 'sk-test-4711-geheim-abcdef';
const MODELS = ['llama3.1:8b', 'qwen2.5:14b', 'mixtral:8x7b'];
/** Der Provider sortiert die Modell-Liste — die Erwartung tut es genauso. */
const SORTED = [...MODELS].sort((one, other) => one.localeCompare(other));

/* Electron gibt es im Test nicht: Fenster gibt es keine, und die
   Betriebssystem-Verschlüsselung wird injiziert (siehe `storage`). */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}));

/** „Verschlüsselung": umgedreht. Genügt, um zu prüfen, dass nichts im Klartext liegt. */
const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (plain: string) => Buffer.from([...plain].reverse().join(''), 'utf8'),
  decryptString: (blob: Buffer) => [...blob.toString('utf8')].reverse().join(''),
};

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { createLlmBridge } = await import('../../src/main/llm-bridge');
  const { createKeyStore, providerKeyId } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { llmHandlers } = await import('../../src/main/ipc/llm');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir, storage);
  const services = createServices(settings, keys, userDataDir);
  services.attachLlm(createLlmBridge(services));
  const handlers: Handlers = llmHandlers(services);

  const responses: unknown[] = [];
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    const value = await (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
    responses.push(value);
    return value;
  };

  return { services, settings, keys, call, responses, providerKeyId };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('LLM-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault();
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-llm-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  /** Alles, was der Provider je an Modellen meldet. */
  function stubModels(): void {
    const fake = createFetchFake(() => jsonResponse({ data: MODELS.map((id) => ({ id })) }));
    vi.stubGlobal('fetch', fake.fetch);
  }

  async function addProvider(apiKey = API_KEY) {
    return harness.call('llm:addProvider', {
      label: 'OpenRouter',
      kind: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      local: false,
      apiKey,
    });
  }

  const settingsFile = (): Promise<string> =>
    readFile(join(vault.root, VAULT_SETTINGS_FILE), 'utf8');

  const keysFile = (): Promise<string> => readFile(join(userDataDir, 'keys.json'), 'utf8');

  it('legt einen Provider an und gibt den Schlüssel nicht heraus', async () => {
    const provider = await addProvider();

    expect(provider.hasKey).toBe(true);
    expect(provider.label).toBe('OpenRouter');
    expect(JSON.stringify(provider)).not.toContain(API_KEY);
    /* Der Schlüssel liegt im Speicher der Maschine … */
    expect(harness.keys.get(harness.providerKeyId(provider.id))).toBe(API_KEY);
    /* … verschlüsselt, also nicht im Klartext in der Datei … */
    expect(await keysFile()).not.toContain(API_KEY);
    expect(await keysFile()).toContain(`provider:${provider.id}`);
    /* … und niemals im Vault. */
    const stored = await settingsFile();
    expect(stored).toContain('OpenRouter');
    expect(stored).not.toContain(API_KEY);
  });

  it('testet die Verbindung, merkt die Modelle und nennt keinen Schlüssel', async () => {
    const provider = await addProvider();
    stubModels();

    const probed = await harness.call('llm:probe', { id: provider.id });

    expect(probed.probe?.ok).toBe(true);
    expect(typeof probed.probe?.latencyMs).toBe('number');
    expect(probed.models).toEqual(SORTED);
    expect(JSON.stringify(probed)).not.toContain(API_KEY);
    /* Der Bestand im Vault trägt die Modelle, aber keinen Schlüssel. */
    const stored = await settingsFile();
    expect(stored).toContain('llama3.1:8b');
    expect(stored).not.toContain(API_KEY);
  });

  it('nennt einen Fehlschlag im Klartext, ohne den Schlüssel zu spiegeln', async () => {
    const provider = await addProvider();
    /* Manche Dienste schicken den Schlüssel in der Fehlerseite zurück. */
    const fake = createFetchFake(() =>
      textResponse(`unauthorized for key ${API_KEY} (Bearer ${API_KEY})`, 401),
    );
    vi.stubGlobal('fetch', fake.fetch);

    const probed = await harness.call('llm:probe', { id: provider.id });

    expect(probed.probe?.ok).toBe(false);
    expect(probed.probe?.error).toBeTruthy();
    expect(probed.probe?.error).toContain('***');
    expect(probed.probe?.error).not.toContain(API_KEY);
    expect(JSON.stringify(probed)).not.toContain(API_KEY);
    expect(await settingsFile()).not.toContain(API_KEY);
  });

  it('holt Modelle über den eigenen Kanal und schreibt sie in den Vault', async () => {
    const provider = await addProvider('');
    stubModels();

    const models = await harness.call('llm:models', { id: provider.id });

    expect(models).toEqual(SORTED);
    expect(await settingsFile()).toContain('qwen2.5:14b');
  });

  it('übernimmt aus einer Änderung nur erlaubte Felder', async () => {
    const provider = await addProvider('');
    expect(provider.hasKey).toBe(false);

    const updated = await harness.call('llm:updateProvider', {
      id: provider.id,
      /* Ein Renderer, der `hasKey` behauptet, darf damit nicht durchkommen —
         `hasKey` ist ein Befund des Schlüsselspeichers, keine Eingabe. */
      patch: { label: 'Neuer Name', hasKey: true, baseUrl: 'https://openrouter.ai/api/v1/' },
    });

    expect(updated.label).toBe('Neuer Name');
    expect(updated.hasKey).toBe(false);
    /* Der Schrägstrich am Ende fällt weg — sonst gäbe es zwei Adressen für einen Dienst. */
    expect(updated.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('weist eine Adresse ab, die keine http-URL ist', async () => {
    await expect(
      harness.call('llm:addProvider', {
        label: 'Kaputt',
        kind: 'openai-compatible',
        baseUrl: 'ftp://beispiel.local',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await harness.call('llm:providers', undefined)).toEqual([]);
  });

  it('weist eine Art von Zugang ab, die es nicht gibt', async () => {
    await expect(
      harness.call('llm:addProvider', {
        label: 'Attrappe',
        kind: 'fake',
        baseUrl: 'http://localhost:1',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('entfernt Provider, Schlüssel und Routing in einem Zug', async () => {
    const provider = await addProvider();
    stubModels();
    await harness.call('llm:probe', { id: provider.id });
    await harness.call('llm:setRoute', {
      task: 'title-tags',
      ref: { providerId: provider.id, model: MODELS[0] as string },
    });
    await harness.call('llm:setDefault', {
      tier: 'cheap',
      ref: { providerId: provider.id, model: MODELS[0] as string },
    });

    await harness.call('llm:removeProvider', { id: provider.id });

    expect(await harness.call('llm:providers', undefined)).toEqual([]);
    const routing = await harness.call('llm:routing', undefined);
    expect(routing.tasks).toEqual({});
    expect(routing.defaults).toEqual({});
    expect(harness.keys.get(harness.providerKeyId(provider.id))).toBeNull();
    expect(await keysFile()).not.toContain(`provider:${provider.id}`);
  });

  it('lässt eine Route nur auf einen eingerichteten Provider zeigen', async () => {
    await expect(
      harness.call('llm:setRoute', {
        task: 'title-tags',
        ref: { providerId: 'gibt-es-nicht', model: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('schlägt ein Routing vor, ohne es zu speichern', async () => {
    const provider = await addProvider();
    stubModels();
    await harness.call('llm:probe', { id: provider.id });

    const suggested = await harness.call('llm:suggestRouting', undefined);

    expect(Object.keys(suggested.tasks).length).toBeGreaterThan(0);
    /* Der Vorschlag ist ein Vorschlag: gespeichert ist weiterhin nichts. */
    expect(harness.settings.vault()?.routing).toEqual({ tasks: {}, defaults: {} });
    const stored = JSON.parse(await settingsFile()) as { routing: unknown };
    expect(stored.routing).toEqual({ tasks: {}, defaults: {} });
  });

  it('erkennt eine lokale Runtime und legt dabei nichts an', async () => {
    const fake = createFetchFake((call) =>
      call.url.includes('11434')
        ? jsonResponse({ data: MODELS.map((id) => ({ id })) })
        : new Error('connect ECONNREFUSED'),
    );
    vi.stubGlobal('fetch', fake.fetch);

    const found = await harness.call('llm:detectLocal', undefined);

    const ollama = found.find((entry) => entry.presetId === 'ollama');
    expect(ollama?.running).toBe(true);
    expect(ollama?.models).toEqual(SORTED);
    expect(ollama?.configured).toBe(false);
    expect(found.find((entry) => entry.presetId === 'lmstudio')?.running).toBe(false);
    /* Erkennen ist Lesen: der Bestand bleibt leer, bis der Nutzer übernimmt. */
    expect(await harness.call('llm:providers', undefined)).toEqual([]);
  });

  it('meldet eine erkannte Runtime als eingerichtet, sobald sie es ist', async () => {
    await harness.call('llm:addProvider', {
      label: 'Ollama',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1/',
      local: true,
    });
    const fake = createFetchFake(() => jsonResponse({ data: [{ id: MODELS[0] }] }));
    vi.stubGlobal('fetch', fake.fetch);

    const found = await harness.call('llm:detectLocal', undefined);

    expect(found.find((entry) => entry.presetId === 'ollama')?.configured).toBe(true);
  });

  it('nennt in keiner Antwort dieses Durchlaufs den Schlüssel', async () => {
    const provider = await addProvider();
    stubModels();
    await harness.call('llm:probe', { id: provider.id });
    await harness.call('llm:models', { id: provider.id });
    await harness.call('llm:providers', undefined);
    await harness.call('llm:tasks', undefined);
    await harness.call('llm:presets', undefined);

    for (const response of harness.responses) {
      expect(JSON.stringify(response) ?? '').not.toContain(API_KEY);
    }
  });

  it('verlangt einen offenen Vault für den Provider-Bestand', async () => {
    await harness.services.closeVault();
    await expect(harness.call('llm:providers', undefined)).rejects.toMatchObject({
      code: 'no-vault',
    });
  });
});
