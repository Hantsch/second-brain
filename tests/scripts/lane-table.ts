/* Shared reader for the `## Test lanes` table in CLAUDE.md. One parser, so the guards that
   read the lane map never disagree about its shape. Not a test file: it has no .test. suffix. */

import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

const claudeMd = readFileSync(new URL('../../CLAUDE.md', import.meta.url), 'utf8');

export type LaneRow = { lane: string; runs: string; budget: string; blocks: string };

function laneSection(): string {
  const start = claudeMd.indexOf('\n## Test lanes');
  expect(start, 'CLAUDE.md has a "## Test lanes" section').toBeGreaterThanOrEqual(0);
  const rest = claudeMd.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

export function laneRows(): LaneRow[] {
  return laneSection()
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .flatMap((cells): LaneRow[] => {
      const [lane, runs, budget, blocks] = cells;
      if (cells.length !== 4 || lane === undefined || runs === undefined) return [];
      if (budget === undefined || blocks === undefined) return [];
      if (lane === 'Lane' || /^-+$/.test(lane)) return [];
      return [{ lane, runs, budget, blocks }];
    });
}
