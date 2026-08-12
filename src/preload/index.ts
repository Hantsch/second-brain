/* The one and only bridge. It lets through exactly the channels from
   `IPC_CHANNELS` and exactly the events from `IPC_EVENTS` — anything else is
   an error. The renderer gets no `require`, no `fs`, no `ipcRenderer`. */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/ipc';
import type { IpcChannel, IpcError, IpcEventName, IpcEvents, IpcRequest } from '@shared/ipc';
import { encodeIpcError } from './ipc-error-wire';

const channels = new Set<string>(IPC_CHANNELS);
const events = new Set<string>(IPC_EVENTS);

type Envelope = { ok: true; value: unknown } | { ok: false; error: IpcError };

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

async function invoke(channel: string, payload?: unknown): Promise<unknown> {
  if (!channels.has(channel)) {
    throw encodeIpcError({ code: 'invalid', message: `unbekannter Kanal: ${channel}` });
  }
  const result: unknown = await ipcRenderer.invoke(channel, payload);
  if (!isEnvelope(result)) {
    throw encodeIpcError({ code: 'unknown', message: 'unerwartete Antwort aus dem Hauptprozess' });
  }
  if (!result.ok) throw encodeIpcError(result.error);
  return result.value;
}

/** Per event: renderer callback → listener that `ipcRenderer` knows. */
const listeners = new Map<string, Map<(payload: never) => void, (...args: unknown[]) => void>>();

function on(event: string, callback: (payload: never) => void): () => void {
  if (!events.has(event)) {
    throw encodeIpcError({ code: 'invalid', message: `unbekanntes Ereignis: ${event}` });
  }
  let perEvent = listeners.get(event);
  if (!perEvent) {
    perEvent = new Map();
    listeners.set(event, perEvent);
  }
  const existing = perEvent.get(callback);
  if (existing) return () => off(event, callback);
  const wrapped = (...args: unknown[]): void => callback(args[1] as never);
  perEvent.set(callback, wrapped);
  ipcRenderer.on(event, wrapped);
  return () => off(event, callback);
}

function off(event: string, callback: (payload: never) => void): void {
  const wrapped = listeners.get(event)?.get(callback);
  if (!wrapped) return;
  ipcRenderer.removeListener(event, wrapped);
  listeners.get(event)?.delete(callback);
}

/** What appears in the renderer as `window.sb`. Types in `src/renderer/global.d.ts`. */
const bridge = {
  invoke: <K extends IpcChannel>(channel: K, payload?: IpcRequest<K>): Promise<unknown> =>
    invoke(channel, payload),
  on: <E extends IpcEventName>(event: E, callback: (payload: IpcEvents[E]) => void): (() => void) =>
    on(event, callback as (payload: never) => void),
  off: <E extends IpcEventName>(event: E, callback: (payload: IpcEvents[E]) => void): void =>
    off(event, callback as (payload: never) => void),
};

contextBridge.exposeInMainWorld('sb', bridge);
