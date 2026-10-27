/* Wall-clock budgets for the perf lane (`*.perf.test.ts`, `npm run test:perf`).
 *
 * A budget is a signal, not a gate. The same code takes ~5x longer on a GitHub
 * runner than on the dev machine (053's passage refresh: 32–37 ms here, 155 ms on
 * windows-latest), so no fixed headroom makes a millisecond assertion trustworthy
 * in a gate that blocks a release. An overrun therefore never fails the test: it
 * prints a warning and, under GitHub Actions, becomes a `::warning` annotation on
 * the run (vitest's github-actions reporter turns `annotate(..., 'warning')` into
 * one).
 *
 * Every budget also prints one `PERF-BUDGET <name> measured=<ms> limit=<ms> ok|over`
 * line - the marker `/release-prep` reads (test-gates, "The perf lane").
 *
 * What a gate test proves about cost, it proves deterministically — bytes written,
 * files read, calls made (see `tests/core/index/counting-store.ts`).
 */

import type { TestContext } from 'vitest';

export async function reportBudget(
  context: Pick<TestContext, 'annotate'>,
  name: string,
  measuredMs: number,
  budgetMs: number,
): Promise<void> {
  const over = measuredMs >= budgetMs;
  const marker = `PERF-BUDGET ${name} measured=${Math.round(measuredMs)} limit=${Math.round(budgetMs)} ${over ? 'over' : 'ok'}`;
  if (!over) {
    console.log(marker);
    return;
  }
  console.warn(marker);
  await context.annotate(
    `perf budget exceeded: ${name}: ${Math.round(measuredMs)} ms (budget ${Math.round(budgetMs)} ms)`,
    'warning',
  );
}
