import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/* Notnagel für Node < 22.10: jsdom@30 zieht undici@8 herein, und undici greift
   beim Laden auf `worker_threads.markAsUncloneable` zu. Fehlt die Funktion,
   stirbt der Vitest-Worker der jsdom-Dateien, bevor ein Test läuft. Der Shim
   wird deshalb in jeden Fork vorgeladen. Ab Node 22.10 entfällt er.
   Siehe scripts/lib/undici-uncloneable-shim.mjs. */
const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);
const needsUncloneableShim = nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 10);
const shimUrl = pathToFileURL(resolve('scripts/lib/undici-uncloneable-shim.mjs')).href;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    /* Standard ist Node; DOM-Tests bestellen jsdom per `// @vitest-environment
       jsdom` in Zeile 1 — das ist dateilokal und braucht keine Glob-Tabelle. */
    environment: 'node',
    pool: 'forks',
    execArgv: needsUncloneableShim ? ['--import', shimUrl] : [],
  },
});
