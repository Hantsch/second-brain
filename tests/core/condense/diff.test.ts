import { describe, expect, it } from 'vitest';
import { diffLines } from '../../../src/core/condense/diff';

describe('diffLines', () => {
  it('reports no changes for identical input', () => {
    const text = 'line one\nline two\nline three';
    const result = diffLines(text, text);
    expect(result.hasChanges).toBe(false);
    expect(result.rows.every((row) => row.kind === 'context')).toBe(true);
    expect(result.rows).toHaveLength(3);
  });

  it('diffs a pure deletion as removed rows with no additions', () => {
    const before = 'keep one\nremove this\nkeep two\nremove that too\nkeep three';
    const after = 'keep one\nkeep two\nkeep three';
    const result = diffLines(before, after);

    expect(result.hasChanges).toBe(true);
    const removed = result.rows.filter((row) => row.kind === 'removed');
    const added = result.rows.filter((row) => row.kind === 'added');
    expect(removed.map((row) => row.text)).toEqual(['remove this', 'remove that too']);
    expect(added).toHaveLength(0);
  });

  it('diffs a changed source-attribution line as one removed + one added row', () => {
    const before = ['# Area', 'From: areas/x.md, areas/y.md', 'Some content'].join('\n');
    const after = ['# Area', 'From: areas/x.md, areas/z.md', 'Some content'].join('\n');

    const result = diffLines(before, after);

    expect(result.hasChanges).toBe(true);
    const removed = result.rows.filter((row) => row.kind === 'removed');
    const added = result.rows.filter((row) => row.kind === 'added');
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(removed[0]!.text).toBe('From: areas/x.md, areas/y.md'); // length 1 asserted above
    expect(added[0]!.text).toBe('From: areas/x.md, areas/z.md'); // length 1 asserted above

    const contextRows = result.rows.filter((row) => row.kind === 'context');
    expect(contextRows.map((row) => row.text)).toEqual(['# Area', 'Some content']);
  });

  it('diffs a ~2000-word artifact with scattered changes well under a second', () => {
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

    expect(elapsed).toBeLessThan(1000);
    expect(result.hasChanges).toBe(true);
    expect(result.rows.filter((row) => row.kind === 'removed').length).toBeGreaterThan(0);
    expect(result.rows.filter((row) => row.kind === 'added').length).toBeGreaterThan(0);
  });
});
