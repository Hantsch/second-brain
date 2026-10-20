/* Was das Preload in den Renderer stellt. Mehr gibt es nicht: kein `require`,
   kein `fs`, kein `ipcRenderer`. */

import type { SbBridge } from './lib/bridge';

declare module '*.png' {
  const source: string;
  export default source;
}

declare global {
  interface Window {
    /** Fehlt im reinen Browser-Kontext — dann greift die Mock-Brücke. */
    sb?: SbBridge;
  }
}
