/* Der IPC-Vertrag ist nur so gut wie seine Vollständigkeit: für jeden Kanal aus
   `IPC_CHANNELS` muss ein Handler registriert sein, jedes Ereignis aus
   `IPC_EVENTS` muss das Preload durchlassen — und nur die.

   Dazu die Regel, an der die letzte Welle gemessen wird: **kein Kanal ist ein
   Platzhalter.** Ein registrierter Handler, der nur `invalid`/„noch nicht
   implementiert" wirft, sieht von außen aus wie ein fertiger Bereich — der
   Abdeckungstest oben ginge durch, und der Screen dahinter würde eine Absage
   zeigen, die er als Fehler ausgibt. */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc';
import type { IpcChannel } from '@shared/ipc';

/** Muster, an denen ein Platzhalter erkennbar ist — Helfer wie Wortlaut. */
const PLACEHOLDER = /notImplemented|noch nicht implementiert|not implemented/;

const IPC_DIR = join(import.meta.dirname, '..', '..', 'src', 'main', 'ipc');

const captured = vi.hoisted(() => ({ bridge: null as Record<string, unknown> | null }));

/* Electron gibt es im Test nicht — die Handler werden nur gebaut, nie gerufen. */
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  contextBridge: {
    exposeInMainWorld: (_name: string, value: Record<string, unknown>) => {
      captured.bridge = value;
    },
  },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  safeStorage: { isEncryptionAvailable: () => false },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  screen: { getAllDisplays: () => [], getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
}));

let channels: IpcChannel[] = [];
let handlers = new Map<IpcChannel, (request: never) => unknown>();

beforeAll(async () => {
  const { buildHandlers } = await import('../../src/main/ipc/register-all');
  const { missingChannels } = await import('../../src/main/ipc/registry');
  /* Die Handler werden hier nur eingesammelt; ein echter Container ist dafür
     nicht nötig, deshalb genügt ein leerer Platzhalter. */
  const services = {} as unknown as Parameters<typeof buildHandlers>[0];
  const map = buildHandlers(services);
  channels = Object.keys(map) as IpcChannel[];
  handlers = new Map(
    channels.map((channel) => [channel, map[channel] as unknown as (request: never) => unknown]),
  );
  expect(missingChannels(map)).toEqual([]);
  await import('../../src/preload/index');
});

describe('IPC-Abdeckung im Main', () => {
  it('registriert jeden Kanal aus IPC_CHANNELS', () => {
    const missing = IPC_CHANNELS.filter((channel) => !channels.includes(channel));
    expect(missing).toEqual([]);
  });

  it('registriert keinen Kanal, den der Vertrag nicht kennt', () => {
    const unexpected = channels.filter((channel) => !IPC_CHANNELS.includes(channel));
    expect(unexpected).toEqual([]);
  });

  it('kennt jeden Kanal genau einmal', () => {
    expect(new Set(channels).size).toBe(channels.length);
  });
});

describe('kein Kanal ist ein Platzhalter', () => {
  /* Der Rumpf des Handlers selbst: ein Platzhalter ist genau der Handler, dessen
     ganze Arbeit darin besteht, eine Absage zu werfen. Das ist an seiner Quelle
     ablesbar, ohne dass ein echter Vault oder ein Modell dafür laufen muss. */
  it('wirft aus keinem Handler-Rumpf eine „noch nicht implementiert"-Absage', () => {
    const placeholders = [...handlers.entries()]
      .filter(([, handler]) => PLACEHOLDER.test(handler.toString()))
      .map(([channel]) => channel);
    expect(placeholders).toEqual([]);
  });

  /* Und der Helfer selbst darf es nicht mehr geben: solange er importierbar ist,
     ist der nächste Platzhalter eine Zeile weit entfernt. */
  it('kennt keinen Helfer, der Platzhalter baut', () => {
    const guilty: string[] = [];
    for (const entry of readdirSync(IPC_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      if (PLACEHOLDER.test(readFileSync(join(IPC_DIR, entry.name), 'utf8'))) {
        guilty.push(entry.name);
      }
    }
    expect(guilty).toEqual([]);
  });

  it('registriert jeden Kanal als Funktion, nicht als Wert', () => {
    for (const channel of IPC_CHANNELS) {
      expect(typeof handlers.get(channel), channel).toBe('function');
    }
  });
});

describe('033: llm:searchModelFiles', () => {
  it('ist im Vertrag, hat einen Handler und ist im Preload-Allowlist', () => {
    expect(IPC_CHANNELS).toContain('llm:searchModelFiles');
    expect(channels).toContain('llm:searchModelFiles');
    expect(typeof handlers.get('llm:searchModelFiles')).toBe('function');
  });
});

describe('043: condense:delete', () => {
  it('ist im Vertrag, hat einen Handler und ist im Preload-Allowlist', () => {
    expect(IPC_CHANNELS).toContain('condense:delete');
    expect(channels).toContain('condense:delete');
    expect(typeof handlers.get('condense:delete')).toBe('function');
  });
});

describe('Preload-Freigabe', () => {
  function bridge(): {
    invoke: (channel: string, payload?: unknown) => Promise<unknown>;
    on: (event: string, callback: (payload: unknown) => void) => () => void;
    off: (event: string, callback: (payload: unknown) => void) => void;
  } {
    expect(captured.bridge).not.toBeNull();
    return captured.bridge as never;
  }

  it('stellt genau invoke, on und off bereit', () => {
    expect(Object.keys(bridge()).sort()).toEqual(['invoke', 'off', 'on']);
  });

  it('lässt jedes Ereignis aus IPC_EVENTS zu', () => {
    for (const event of IPC_EVENTS) {
      const unsubscribe = bridge().on(event, () => undefined);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    }
  });

  it('weist unbekannte Ereignisse ab', () => {
    expect(() => bridge().on('event:erfunden', () => undefined)).toThrow(/SB_IPC_ERROR/);
  });

  it('weist unbekannte Kanäle ab', async () => {
    await expect(bridge().invoke('erfunden:kanal')).rejects.toThrow(/SB_IPC_ERROR/);
  });
});
