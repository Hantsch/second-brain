/* The shell lane: only `*.shell.test.ts`, run by `npm run test:shell` in release
   prep — never by `npm test` or `npm run verify`, so the PR lane spawns no
   PowerShell. */

import { configDefaults, defineConfig } from 'vitest/config';
import gate, { SHELL_TESTS } from './vitest.config';

export default defineConfig({
  ...gate,
  test: {
    ...gate.test,
    include: [SHELL_TESTS],
    exclude: configDefaults.exclude,
  },
});
