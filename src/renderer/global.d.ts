/* Was das Preload in den Renderer stellt. Mehr gibt es nicht: kein `require`,
   kein `fs`, kein `ipcRenderer`. */

import type { SbBridge } from './lib/bridge';

declare global {
  interface Window {
    /** Fehlt im reinen Browser-Kontext — dann greift die Mock-Brücke. */
    sb?: SbBridge;
  }
}
