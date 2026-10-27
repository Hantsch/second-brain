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
});

/* The ~2000-word speed check lives in `diff.perf.test.ts` (perf lane). */
