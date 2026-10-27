import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/* Wall-clock budgets live in `*.perf.test.ts` and run only in the perf lane
   (`npm run test:perf`, vitest.perf.config.ts), never in `npm test`: a GitHub
   runner is ~5x slower than the dev machine, so a millisecond assertion in the
   gate blocks releases for the runner's speed, not for the code. */
export const PERF_TESTS = 'tests/**/*.perf.test.ts';

/* CI installs the Node in `.nvmrc` (setup-node `node-version-file`), which is the
   Node that Electron ships. A different local major is how "green here, red on
   GitHub" starts — both shims below exist because two majors disagreed. */
const pinnedNodeMajor = Number(readFileSync(resolve('.nvmrc'), 'utf8').trim().split('.')[0]);

/* Notnagel für Node < 22.10: jsdom@30 zieht undici@8 herein, und undici greift
   beim Laden auf `worker_threads.markAsUncloneable` zu. Fehlt die Funktion,
   stirbt der Vitest-Worker der jsdom-Dateien, bevor ein Test läuft. Der Shim
   wird deshalb in jeden Fork vorgeladen. Ab Node 22.10 entfällt er.
   Siehe scripts/lib/undici-uncloneable-shim.mjs. */
const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);
const needsUncloneableShim = nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 10);
if (nodeMajor !== pinnedNodeMajor) {
  console.warn(
    `Node ${process.versions.node} runs these tests, CI runs Node ${pinnedNodeMajor} (.nvmrc) — a green run here does not promise a green run there.`,
  );
}
const shimUrl = pathToFileURL(resolve('scripts/lib/undici-uncloneable-shim.mjs')).href;

/* Node 25 turned its own Web Storage on by default. Without `--localstorage-file`
   its `localStorage` global is an empty stand-in, and it shadows jsdom's, so a
   DOM test's `window.localStorage.clear()` is not a function. Off in the forks,
   on every Node that knows the flag (22.4+); older ones have no global to clash. */
const webStorageFlag = '--no-experimental-webstorage';
const disableNodeWebStorage = process.allowedNodeEnvironmentFlags.has(webStorageFlag);

/* The fixed test clock (`NOW` in tests/helpers/time.ts) is 14:32 Central
   European summer time, and journal and ingest code format local wall-clock
   time. CI runners sit in UTC, so without a pinned zone those tests only pass
   on a machine in Berlin. Set before the forks start, which inherit it. */
process.env.TZ = 'Europe/Berlin';

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
    exclude: [...configDefaults.exclude, PERF_TESTS],
    /* Timeouts catch hangs, they are not speed limits. Vitest's 5 s default is a
       hidden perf budget: tests that take 2–3 s here cross it on a loaded runner,
       and Windows file-system contention has stalled a 0.3 s test past 20 s.
       A per-test timeout may only be longer than these, never shorter. */
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
