/* The bridge through which the renderer talks to the main process.
   In Electron, that's `window.sb` from the preload. In a plain browser
   (Storybook, Vitest, "just take a quick look") it's missing — then the mock
   bridge kicks in, so the UI is fully testable there too. */

import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import { mockBridge } from './mock-bridge';

export interface SbBridge {
  invoke<K extends IpcChannel>(channel: K, payload?: IpcRequest<K>): Promise<IpcResponse<K>>;
  on<E extends IpcEventName>(event: E, callback: (payload: IpcEvents[E]) => void): () => void;
  off<E extends IpcEventName>(event: E, callback: (payload: IpcEvents[E]) => void): void;
}

/** Read fresh on every call, so tests can set `window.sb` after the fact. */
export function bridge(): SbBridge {
  return window.sb ?? mockBridge;
}

/** Is the app running in Electron, or just in the browser on fixture data? */
export function hasNativeBridge(): boolean {
  return window.sb !== undefined;
}
