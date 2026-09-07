/* Playwright drives the built Electron app; vitest keeps the unit tests. The two
   runners are kept apart by file name — `*.spec.ts` belongs to Playwright,
   `*.test.ts` to vitest (see vitest.config.ts `include`). `testMatch` says so
   explicitly instead of relying on Playwright's default, which would also claim
   any `*.test.ts` that ever lands under tests/e2e/.

   The suite needs a build: `npm run build` first, otherwise the harness fails
   with a plain message instead of a Playwright stack trace. */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',

  /* One Electron instance and one userData directory at a time — two apps on the
     same machine would fight over the global hotkey and the tray icon. */
  workers: 1,
  fullyParallel: false,

  /* A stray `.only` must not silently shrink an acceptance gate. */
  forbidOnly: true,

  /* No retries: a test that only passes on the second try is a failure we want to
     see, not a "flaky" line that still exits 0. Traces are therefore only written
     when someone debugs with `--retries=1`. */
  retries: 0,
  use: { trace: 'on-first-retry' },

  /* Per test: launching Electron plus seeding a throwaway vault costs the first
     test of a spec file the better part of a minute on a cold disk.
     Overall budget: ten minutes for the whole suite. If it ever needs longer, the
     suite has grown past what belongs in an e2e gate — split it, don't raise this. */
  timeout: 120_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 10_000 },

  reporter: [['list']],
});
