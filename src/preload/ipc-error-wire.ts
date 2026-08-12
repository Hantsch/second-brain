/* Fehlerübergabe über die contextBridge.

   Electron reduziert Fehlerobjekte auf ihre Message, wenn sie die Brücke
   überqueren — eigene Felder wie `code` gehen verloren. Deshalb reist der
   `IpcError` als JSON in der Message, mit festem Präfix.

   Gegenstück: `src/renderer/lib/ipc-error.ts` (decodeIpcError). Beide Seiten
   müssen dasselbe Präfix benutzen. */

import type { IpcError } from '@shared/ipc';

export const IPC_ERROR_PREFIX = 'SB_IPC_ERROR:';

export function encodeIpcError(error: IpcError): Error {
  return new Error(`${IPC_ERROR_PREFIX}${JSON.stringify(error)}`);
}
