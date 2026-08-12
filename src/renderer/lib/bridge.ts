/* Die Brücke, über die der Renderer mit dem Hauptprozess spricht.
   In Electron ist das `window.sb` aus dem Preload. Im reinen Browser (Storybook,
   Vitest, „mal schnell ansehen") fehlt sie — dann greift die Mock-Brücke, damit
   die Oberfläche auch dort vollständig prüfbar ist. */

import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import { mockBridge } from './mock-bridge';

export interface SbBridge {
  invoke<K extends IpcChannel>(channel: K, payload?: IpcRequest<K>): Promise<IpcResponse<K>>;
  on<E extends IpcEventName>(event: E, callback: (payload: IpcEvents[E]) => void): () => void;
  off<E extends IpcEventName>(event: E, callback: (payload: IpcEvents[E]) => void): void;
}

/** Wird pro Aufruf gelesen, damit Tests `window.sb` nachträglich setzen können. */
export function bridge(): SbBridge {
  return window.sb ?? mockBridge;
}

/** Läuft die App in Electron, oder nur im Browser auf Fixture-Daten? */
export function hasNativeBridge(): boolean {
  return window.sb !== undefined;
}
