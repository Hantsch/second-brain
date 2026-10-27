/* Perf lane: the line diff on a realistic artifact size. */

import { describe, expect, it } from 'vitest';
import { diffLines } from '../../../src/core/condense/diff';
import { reportBudget } from '../../helpers/perf';

describe('diffLines', () => {
  it('diffs a ~2000-word artifact with scattered changes well under a second', async ({
    annotate,
  }) => {
    const beforeLines: string[] = [];
    const afterLines: string[] = [];
    for (let i = 0; i < 180; i++) {
      const words = Array.from({ length: 11 }, (_, w) => `word${i}_${w}`).join(' ');
      beforeLines.push(`line ${i}: ${words}`);
      // Change every 7th line so both removals and additions occur scattered
      // throughout the document, not just at the edges.
      afterLines.push(i % 7 === 0 ? `line ${i}: CHANGED ${words}` : `line ${i}: ${words}`);
    }
    const before = beforeLines.join('\n');
    const after = afterLines.join('\n');

    const start = Date.now();
    const result = diffLines(before, after);
    const elapsed = Date.now() - start;

    expect(result.hasChanges).toBe(true);
    expect(result.rows.filter((row) => row.kind === 'removed').length).toBeGreaterThan(0);
    expect(result.rows.filter((row) => row.kind === 'added').length).toBeGreaterThan(0);
    await reportBudget({ annotate }, '2000-word diff', elapsed, 1000);
  });
});
