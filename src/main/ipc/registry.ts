/* Typisierte Registrierung der IPC-Handler.

   Jeder Handler wird eingepackt: er bekommt seine Nutzlast, gibt seinen
   Rückgabewert — und jeder geworfene Fehler kommt als `IpcError` zurück.
   Über die Grenze geht immer ein Umschlag (`ok`/`error`), weil Electron
   Fehlerobjekte sonst auf ihre Message reduziert. Das Preload packt ihn aus. */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc';
import type { IpcChannel, IpcError, IpcRequest, IpcResponse } from '@shared/ipc';
import { toIpcError } from './errors';

/* Es gibt hier bewusst keinen Helfer mehr, der eine Absage „dieser Bereich fehlt
   noch" baut: jeder Kanal aus `IPC_CHANNELS` ist echt (Test: „kein Kanal ist ein
   Platzhalter"). Ein solcher Helfer wäre der kürzeste Weg zurück. */
export { fail, IpcFailure, noVault, toIpcError } from './errors';

export type IpcHandler<K extends IpcChannel> = (
  request: IpcRequest<K>,
) => IpcResponse<K> | Promise<IpcResponse<K>>;

export type HandlerMap = Partial<{ [K in IpcChannel]: IpcHandler<K> }>;

/** Der Umschlag, in dem jede Antwort über die Grenze geht. */
export type IpcEnvelope<K extends IpcChannel> =
  { ok: true; value: IpcResponse<K> } | { ok: false; error: IpcError };

/** Nur zum Typisieren beim Schreiben eines Bereichs — zur Laufzeit die Identität. */
export function defineHandlers<M extends HandlerMap>(map: M): M {
  return map;
}

/** Setzt alle Handler auf `ipcMain`. Doppelte Kanäle ersetzen den Vorgänger. */
export function register(map: HandlerMap): void {
  for (const channel of Object.keys(map) as IpcChannel[]) {
    const handler = map[channel];
    if (!handler) continue;
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, payload: unknown) => {
      try {
        /* Die Nutzlast kommt aus dem Renderer und ist zur Laufzeit ungeprüft;
           die Typisierung des Kanals ist der Vertrag, den das Preload wahrt. */
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

/** Kanäle aus `IPC_CHANNELS`, für die die Karte keinen Handler hat. */
export function missingChannels(map: HandlerMap): IpcChannel[] {
  return IPC_CHANNELS.filter((channel) => typeof map[channel] !== 'function');
}
