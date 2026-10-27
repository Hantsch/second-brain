/* The perf lane: only `*.perf.test.ts`, run by `npm run test:perf` and by the
   advisory perf workflow — never by `npm test`, `npm run verify` or a release.
   A budget overrun is a warning (tests/helpers/perf.ts), not a failure.

   One file at a time, so a measurement does not share the CPU with the next
   file's setup. */

import { configDefaults, defineConfig } from 'vitest/config';
import gate, { PERF_TESTS } from './vitest.config';

export default defineConfig({
  ...gate,
  test: {
    ...gate.test,
    include: [PERF_TESTS],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
