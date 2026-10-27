/* Die Verdrahtung im Main — der Teil, den kein Kern-Test abdeckt.
 *
 * Geprüft wird an einem echten Vault auf der Platte: `openVault` hängt Store,
 * Index und Watcher ein, meldet Status und Index-Fortschritt an die Fenster,
 * die Suche findet etwas, eine Änderung von außen zieht den Index nach, und
 * `closeVault` räumt auf. Kein Netz, kein LLM.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsVaultStore, ensureStructure } from '@core/vault';
import type { IpcEventName } from '@shared/ipc';
import type { VaultStatus } from '@shared/types';
import type { KeyStore } from '../../src/main/secrets';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

interface SentEvent {
  name: string;
  payload: unknown;
}

/* Electron gibt es im Test nicht. Das eine Fensterattrappe sammelt, was der
   Container an den Renderer schicken würde. */
const bus = vi.hoisted(() => ({ sent: [] as SentEvent[] }));
const appState = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0-test',
    get isPackaged() {
      return appState.isPackaged;
    },
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (name: string, payload: unknown) => bus.sent.push({ name, payload }),
        },
      },
    ],
  },
}));

const NOTE = '---\ntype: note\ntitle: Zwiebelkuchen mit Federweisser\n---\n\nRezept vom Markt.\n';

function events(name: IpcEventName): unknown[] {
  return bus.sent.filter((entry) => entry.name === name).map((entry) => entry.payload);
}

/** Wartet, bis die Bedingung greift — der Watcher braucht seinen Nachlauf. */
async function until(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Bedingung trat nicht ein');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function createContainer(userDataDir: string) {
  const { attachCore } = await import('../../src/main/core-bridge');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const settings = await SettingsService.load(userDataDir);
  /* Der Schlüsselspeicher spielt hier keine Rolle: es wird nichts entschlüsselt. */
  const keys = {
    encryptionAvailable: false,
    has: () => false,
    get: () => null,
    set: async () => ({ persisted: false, encrypted: false }),
    remove: async () => undefined,
    ids: () => [],
  };
  const services = createServices(settings, keys as unknown as KeyStore, userDataDir);
  attachCore(services);
  return services;
}

describe('Services: Vault, Index und Watcher', () => {
  let vault: TempVault;
  let userDataDir: string;
  let services: Awaited<ReturnType<typeof createContainer>>;

  beforeEach(async () => {
    bus.sent = [];
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-'));
    services = await createContainer(userDataDir);
  });

  afterEach(async () => {
    await services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('öffnet den Vault, baut den Index und meldet beides', async () => {
    const status = await services.openVault(vault.root);

    expect(status.root).toBe(vault.root);
    expect(status.ready).toBe(true);
    expect(status.indexing).toBe(false);
    expect(status.docCount).toBeGreaterThan(0);
    expect(status.indexedAt).not.toBeNull();

    /* Der Index läuft: erst „ich arbeite", dann „fertig". */
    const progress = events('event:index-progress') as { indexing: boolean }[];
    expect(progress.map((entry) => entry.indexing)).toContain(true);
    expect(progress.at(-1)?.indexing).toBe(false);

    /* Und der Renderer erfährt den Endzustand über `event:vault-status`. */
    const stati = events('event:vault-status') as VaultStatus[];
    expect(stati.at(-1)?.docCount).toBe(status.docCount);
  });

  it('legt die Ablage des Index im Vault an', async () => {
    await services.openVault(vault.root);
    expect(await vault.exists('.secondbrain/index/index.json')).toBe(true);
  });

  it('findet über die Suche, was im Vault steht', async () => {
    await services.openVault(vault.root);
    const hits = await services.requireIndex().search({ text: 'rollen', limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path.endsWith('.md')).toBe(true);
  });

  /* Länger als die Vorgabe: der Watcher hat 250 ms Nachlauf, und darauf folgt
     ein echter Indexlauf über den Beispielbestand. */
  it('zieht bei einer Änderung von außen den Index nach und meldet den Pfad', async () => {
    const before = (await services.openVault(vault.root)).docCount;
    bus.sent = [];

    await vault.write('inbox/2026-08-10-1500-zwiebelkuchen.md', NOTE);
    await until(() => events('event:vault-changed').length > 0);

    const changed = events('event:vault-changed') as { paths: string[]; external: boolean }[];
    expect(
      changed.some((entry) => entry.paths.some((path) => path.includes('zwiebelkuchen'))),
    ).toBe(true);
    expect(changed.every((entry) => entry.external)).toBe(true);
    /* Die Meldung kommt erst, wenn der Index den neuen Stand hat. */
    expect(services.status().docCount).toBe(before + 1);
    const hits = await services.requireIndex().search({ text: 'federweisser' });
    expect(hits[0]?.path).toBe('inbox/2026-08-10-1500-zwiebelkuchen.md');
  });

  it('schließt den Vault und fällt auf den Leerzustand zurück', async () => {
    await services.openVault(vault.root);
    const status = await services.closeVault();
    expect(status).toEqual({
      root: null,
      name: null,
      ready: false,
      docCount: 0,
      indexedAt: null,
      indexing: false,
      indexRefreshFailedAt: null,
    });
    expect(services.index()).toBeNull();
    expect(services.store()).toBeNull();
  });

  it('lehnt einen Ordner ohne Marker ab, statt ihn zu öffnen', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'sb-plain-'));
    try {
      await expect(services.openVault(plain)).rejects.toMatchObject({ code: 'not-found' });
      expect(services.status().ready).toBe(false);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
});

describe('Services: fehlgeschlagener Index-Nachlauf (D4)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let services: Awaited<ReturnType<typeof createContainer>>;
  let refreshImpl: (paths?: readonly string[]) => Promise<void>;
  let capturedOnChange: ((paths: string[], external: boolean) => void) | null = null;

  beforeEach(async () => {
    bus.sent = [];
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-fail-'));
    services = await createContainer(userDataDir);
    capturedOnChange = null;

    /* Default: refresh always succeeds. Individual tests swap `refreshImpl`
       to inject a rejection without touching real files or a real index. */
    refreshImpl = async () => undefined;

    const fakeStats = () => ({
      docs: 0,
      todos: 0,
      projects: 0,
      modules: 0,
      pages: 0,
      words: 0,
      builtAt: new Date().toISOString(),
      durationMs: 0,
      oversized: [] as string[],
    });
    services.attachIndex(() => ({
      stats: async () => fakeStats(),
      rebuild: async () => fakeStats(),
      search: () => [],
      refresh: async (paths?: readonly string[]) => refreshImpl(paths),
      dispose: async () => undefined,
    }));
    services.attachWatcher((_root, onChange) => {
      capturedOnChange = onChange;
      return { dispose: async () => undefined };
    });

    await services.openVault(vault.root);
    bus.sent = [];
  });

  afterEach(async () => {
    await services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('a failed refresh sends no vault-changed and marks the status', async () => {
    refreshImpl = async () => {
      throw new Error('boom');
    };
    expect(capturedOnChange).not.toBeNull();
    capturedOnChange?.(['inbox/x.md'], true);
    await until(() => services.status().indexRefreshFailedAt !== null);

    expect(services.status().indexRefreshFailedAt).toEqual(expect.any(String));
    expect(events('event:vault-changed')).toHaveLength(0);
    const stati = events('event:vault-status') as VaultStatus[];
    expect(stati.some((s) => s.indexRefreshFailedAt !== null)).toBe(true);
  });

  it('the next successful refresh clears the failure and reports every path', async () => {
    refreshImpl = async () => {
      throw new Error('boom');
    };
    capturedOnChange?.(['inbox/first.md'], true);
    await until(() => services.status().indexRefreshFailedAt !== null);

    refreshImpl = async () => undefined;
    capturedOnChange?.(['inbox/second.md'], false);
    await until(() => events('event:vault-changed').length > 0);

    expect(services.status().indexRefreshFailedAt).toBeNull();
    const changed = events('event:vault-changed') as { paths: string[]; external: boolean }[];
    const allPaths = changed.flatMap((entry) => entry.paths);
    expect(allPaths).toContain('inbox/first.md');
    expect(allPaths).toContain('inbox/second.md');
  });

  it("a pending failure from a closed vault does not leak into the next vault's refresh", async () => {
    refreshImpl = async () => {
      throw new Error('boom');
    };
    capturedOnChange?.(['inbox/first-vault-only.md'], true);
    await until(() => services.status().indexRefreshFailedAt !== null);

    await services.closeVault();

    const vault2 = await createTempVault({ sample: true });
    try {
      let capturedOnChange2: ((paths: string[], external: boolean) => void) | null = null;
      refreshImpl = async () => undefined;
      services.attachIndex(() => ({
        stats: async () => ({
          docs: 0,
          todos: 0,
          projects: 0,
          modules: 0,
          pages: 0,
          words: 0,
          builtAt: new Date().toISOString(),
          durationMs: 0,
          oversized: [] as string[],
        }),
        rebuild: async () => ({
          docs: 0,
          todos: 0,
          projects: 0,
          modules: 0,
          pages: 0,
          words: 0,
          builtAt: new Date().toISOString(),
          durationMs: 0,
          oversized: [] as string[],
        }),
        search: () => [],
        refresh: async (paths?: readonly string[]) => refreshImpl(paths),
        dispose: async () => undefined,
      }));
      services.attachWatcher((_root, onChange) => {
        capturedOnChange2 = onChange;
        return { dispose: async () => undefined };
      });

      await services.openVault(vault2.root);
      bus.sent = [];

      const onChange2 = capturedOnChange2 as ((paths: string[], external: boolean) => void) | null;
      expect(onChange2).not.toBeNull();
      onChange2?.(['inbox/second-vault.md'], false);
      await until(() => events('event:vault-changed').length > 0);

      const changed = events('event:vault-changed') as { paths: string[]; external: boolean }[];
      const allPaths = changed.flatMap((entry) => entry.paths);
      expect(allPaths).not.toContain('inbox/first-vault-only.md');
      expect(allPaths).toContain('inbox/second-vault.md');
    } finally {
      await vault2.cleanup();
    }
  });
});

describe('Services: update wiring', () => {
  let userDataDir: string;
  let services: Awaited<ReturnType<typeof createContainer>>;
  const fixtureEnv = process.env['SB_E2E_UPDATE_FIXTURE'];
  const demoEnv = process.env['SB_DEMO'];

  beforeEach(async () => {
    delete process.env['SB_E2E_UPDATE_FIXTURE'];
    delete process.env['SB_DEMO'];
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-upd-'));
    services = await createContainer(userDataDir);
  });

  afterEach(async () => {
    appState.isPackaged = false;
    if (fixtureEnv !== undefined) process.env['SB_E2E_UPDATE_FIXTURE'] = fixtureEnv;
    if (demoEnv !== undefined) process.env['SB_DEMO'] = demoEnv;
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('the update service is disabled when unpackaged or on the demo vault and enabled otherwise', async () => {
    const real = await createTempVault({ sample: true });
    const demoParent = await mkdtemp(join(tmpdir(), 'sb-demo-'));
    const demoRoot = join(demoParent, '.demo-vault');
    try {
      const reason = async (root: string | null) => {
        await services.closeVault();
        if (root) await services.openVault(root);
        const { supported, disabledReason } = await services.updates().getState();
        return { supported, disabledReason };
      };

      appState.isPackaged = false;
      expect(await reason(real.root)).toEqual({ supported: false, disabledReason: 'unpackaged' });

      appState.isPackaged = true;
      expect(await reason(real.root)).toEqual({ supported: true, disabledReason: null });
      /* The demo verdict comes from the folder name alone, with SB_DEMO unset. */
      await mkdir(demoRoot);
      await ensureStructure(new FsVaultStore(demoRoot), { name: 'Demo' });
      expect(await reason(demoRoot)).toEqual({ supported: false, disabledReason: 'demo' });
    } finally {
      await services.closeVault();
      await real.cleanup();
      await rm(demoParent, { recursive: true, force: true });
    }
  });
});
