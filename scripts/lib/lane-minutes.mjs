/* Reports how long the PR lane took against its budget. A slow lane must
   surface as a warning, never as a failed run, so the report only ever
   returns text and the CLI always exits 0. Pure functions plus a CLI that
   runs only when the file is executed directly (story 098). */

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function requirePositive(value, name) {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (value === undefined || value === null || !Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got ${String(value)}`);
  }
  return n;
}

/** Summary line plus an optional GitHub `::warning` line. Compares the raw
    elapsed minutes to the budget, so exactly at budget does not warn. */
export function laneReport({ startedAtMs, endedAtMs, budgetMinutes }) {
  const started = requirePositive(startedAtMs, 'startedAtMs');
  const budget = requirePositive(budgetMinutes, 'budgetMinutes');
  const elapsed = (endedAtMs - started) / 60000;
  const shown = elapsed.toFixed(1);
  return {
    summary: `PR lane: ${shown} min of a ${budget} min budget`,
    warning:
      elapsed <= budget
        ? null
        : `::warning title=PR lane over budget::PR lane took ${shown} min, budget is ${budget} min`,
  };
}

function main(mode) {
  if (mode === 'start') {
    appendFileSync(process.env.GITHUB_ENV, `LANE_STARTED_AT=${Date.now()}\n`);
    return;
  }
  if (mode === 'report') {
    const { summary, warning } = laneReport({
      startedAtMs: process.env.LANE_STARTED_AT,
      endedAtMs: Date.now(),
      budgetMinutes: process.env.LANE_BUDGET_MINUTES,
    });
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    if (warning) process.stdout.write(`${warning}\n`);
    return;
  }
  throw new Error('usage: lane-minutes.mjs start|report');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv[2]);
}
