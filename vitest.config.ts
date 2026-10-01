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

/* Node 25 turned its own Web Storage on by default. Without `--localstorage-file`
   its `localStorage` global is an empty stand-in, and it shadows jsdom's, so a
   DOM test's `window.localStorage.clear()` is not a function. Off in the forks,
   on every Node that knows the flag (22.4+); older ones have no global to clash. */
const webStorageFlag = '--no-experimental-webstorage';
const disableNodeWebStorage = process.allowedNodeEnvironmentFlags.has(webStorageFlag);

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
    execArgv: [
      ...(needsUncloneableShim ? ['--import', shimUrl] : []),
      ...(disableNodeWebStorage ? [webStorageFlag] : []),
    ],
    /* Vitest stubs every `.css` import to an empty module by default, `?raw`
       included — `tasks.test.tsx`'s AC8 check (072 review, finding 4) reads
       `tasks.css` as text to count `var(--accent)` uses, which needs the real
       file content. Scoped to that one file rather than turning CSS
       processing on everywhere: no other test reads a stylesheet's content. */
    css: { include: [/styles[\\/]app[\\/]tasks\.css/] },
  },
});
