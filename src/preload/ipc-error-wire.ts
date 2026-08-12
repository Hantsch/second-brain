/* Error handoff across the contextBridge.

   Electron reduces error objects to their message when they cross the
   bridge — custom fields like `code` are lost. That's why the `IpcError`
   travels as JSON inside the message, with a fixed prefix.

   Counterpart: `src/renderer/lib/ipc-error.ts` (decodeIpcError). Both sides
   must use the same prefix. */

import type { IpcError } from '@shared/ipc';

export const IPC_ERROR_PREFIX = 'SB_IPC_ERROR:';

export function encodeIpcError(error: IpcError): Error {
  return new Error(`${IPC_ERROR_PREFIX}${JSON.stringify(error)}`);
}
