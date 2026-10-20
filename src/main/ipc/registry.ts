/* Typed registration of the IPC handlers.

   Every handler gets wrapped: it receives its payload, returns its result —
   and any thrown error comes back as an `IpcError`. What crosses the
   boundary is always an envelope (`ok`/`error`), because Electron otherwise
   reduces error objects to their message. The preload unwraps it. */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc';
import type { IpcChannel, IpcError, IpcRequest, IpcResponse } from '@shared/ipc';
import { toIpcError } from './errors';

/* There is deliberately no longer a helper here that builds a "this area
   doesn't exist yet" refusal: every channel from `IPC_CHANNELS` is real
   (test: "no channel is a placeholder"). Such a helper would be the
   shortest path back to that state. */
export { fail, IpcFailure, llmUnavailable, noVault, toIpcError } from './errors';

export type IpcHandler<K extends IpcChannel> = (
  request: IpcRequest<K>,
) => IpcResponse<K> | Promise<IpcResponse<K>>;

export type HandlerMap = Partial<{ [K in IpcChannel]: IpcHandler<K> }>;

/** The envelope in which every response crosses the boundary. */
export type IpcEnvelope<K extends IpcChannel> =
  { ok: true; value: IpcResponse<K> } | { ok: false; error: IpcError };

/** Only for typing while writing a handler map — the identity at runtime. */
export function defineHandlers<M extends HandlerMap>(map: M): M {
  return map;
}

/** Registers all handlers on `ipcMain`. Duplicate channels replace the previous one. */
export function register(map: HandlerMap): void {
  for (const channel of Object.keys(map) as IpcChannel[]) {
    const handler = map[channel];
    if (!handler) continue;
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, payload: unknown) => {
      try {
        /* The payload comes from the renderer and is unchecked at runtime;
           the channel's typing is the contract that the preload upholds. */
        const value = await (handler as IpcHandler<IpcChannel>)(payload as IpcRequest<IpcChannel>);
        return { ok: true, value };
      } catch (error) {
        const translated = toIpcError(error);
        if (translated.code === 'unknown') console.error(`[ipc] ${channel}`, error);
        return { ok: false, error: translated };
      }
    });
  }
}

/** Channels from `IPC_CHANNELS` for which the map has no handler. */
export function missingChannels(map: HandlerMap): IpcChannel[] {
  return IPC_CHANNELS.filter((channel) => typeof map[channel] !== 'function');
}
