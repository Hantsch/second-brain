/**
 * Pure LCS-based line diff for condensed-artifact previews (docs/VAULT-FORMAT.md,
 * section "Condensed area"). No dependency, no Electron: this is used to show the
 * human what a proposed rewrite of `areas/<slug>.condensed.md` actually changes
 * before they confirm it.
 *
 * Classic O(n*m) DP table — the artifacts this diffs are short (a few hundred
 * lines at most), so quadratic time is fine and keeps the implementation obvious.
 */

export type DiffRowKind = 'context' | 'added' | 'removed';

export interface DiffRow {
  kind: DiffRowKind;
  text: string;
  /** 1-based line number in "before"; present for 'context' and 'removed'. */
  beforeLine?: number;
  /** 1-based line number in "after"; present for 'context' and 'added'. */
  afterLine?: number;
}

export interface LineDiffResult {
  rows: DiffRow[];
  hasChanges: boolean;
}

/**
 * Row of the dp table, one entry per index into `b` (0..m). Wrapping the raw
 * `number[]` in this helper keeps every read in-bounds by construction, so the
 * rest of the function never has to fight `noUncheckedIndexedAccess` on a
 * value we know is there.
 */
function makeDpRow(m: number): { get: (j: number) => number; set: (j: number, v: number) => void } {
  const row = new Array<number>(m + 1).fill(0);
  return {
    get: (j: number) => row[j] ?? 0,
    set: (j: number, v: number) => {
      row[j] = v;
    },
  };
}

/** Computes a line-level diff between `before` and `after` using LCS. */
export function diffLines(before: string, after: string): LineDiffResult {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i..n) and b[j..m)
  const dp = Array.from({ length: n + 1 }, () => makeDpRow(m));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i];
    const rowBelow = dp[i + 1];
    if (!row || !rowBelow) continue; // unreachable: dp has n+1 rows, i < n+1
    const ai = a[i];
    if (ai === undefined) continue; // unreachable: i < n === a.length
    for (let j = m - 1; j >= 0; j--) {
      const bj = b[j];
      if (bj === undefined) continue; // unreachable: j < m === b.length
      row.set(j, ai === bj ? rowBelow.get(j + 1) + 1 : Math.max(rowBelow.get(j), row.get(j + 1)));
    }
  }

  const rows: DiffRow[] = [];
  let hasChanges = false;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const ai = a[i];
    const bj = b[j];
    if (ai === undefined || bj === undefined) break; // unreachable: i < n, j < m
    const row = dp[i];
    const rowBelow = dp[i + 1];
    if (!row || !rowBelow) break; // unreachable: dp has n+1 rows
    if (ai === bj) {
      rows.push({ kind: 'context', text: ai, beforeLine: i + 1, afterLine: j + 1 });
      i++;
      j++;
    } else if (rowBelow.get(j) >= row.get(j + 1)) {
      rows.push({ kind: 'removed', text: ai, beforeLine: i + 1 });
      hasChanges = true;
      i++;
    } else {
      rows.push({ kind: 'added', text: bj, afterLine: j + 1 });
      hasChanges = true;
      j++;
    }
  }
  while (i < n) {
    const ai = a[i];
    if (ai === undefined) break; // unreachable: i < n === a.length
    rows.push({ kind: 'removed', text: ai, beforeLine: i + 1 });
    hasChanges = true;
    i++;
  }
  while (j < m) {
    const bj = b[j];
    if (bj === undefined) break; // unreachable: j < m === b.length
    rows.push({ kind: 'added', text: bj, afterLine: j + 1 });
    hasChanges = true;
    j++;
  }

  return { rows, hasChanges };
}
