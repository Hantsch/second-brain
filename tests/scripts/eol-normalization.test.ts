/* Guards the fix from story 041 D3: `.gitattributes` normalizes every
   tracked file to LF on checkout (see the rationale block at the top of
   .gitattributes). Without a test, a future edit that narrows or removes
   the `* text=auto eol=lf` rule — or a file checked in with CRLF before
   that rule existed — would silently let CRLF back into the index, and
   `prettier --check` (which expects LF) would fail on machines with
   `core.autocrlf=true` again, exactly the failure mode story 041 fixes. */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);

/* Both checks below need a real git checkout with git on PATH. Detected
   once, at collection time, so both `it`s can skip via `skipIf` rather than
   failing — this repo also ships as a downloaded zip (see the handoff
   check in tests/scripts/handoff-check.test.ts) and CI/sandboxed
   environments sometimes run without git on PATH; neither case is a real
   regression in the eol rule. */
function hasGitCheckout(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const gitAvailable = hasGitCheckout();

describe('line-ending normalization', () => {
  it.skipIf(!gitAvailable)('no tracked file has a CRLF or mixed index eol', () => {
    const output = execSync('git ls-files --eol', {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    const offenders: string[] = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      // Format: "<index-eol> <worktree-eol>\t<path>", e.g. "i/lf w/lf\tpath/to/file".
      const tabIndex = line.indexOf('\t');
      if (tabIndex === -1) continue;
      const eolPart = line.slice(0, tabIndex);
      const path = line.slice(tabIndex + 1);
      const indexEol = eolPart.split(/\s+/)[0];
      if (indexEol === 'i/crlf' || indexEol === 'i/mixed') {
        offenders.push(`${indexEol}\t${path}`);
      }
    }

    expect(
      offenders,
      `The following tracked files have a non-LF index eol, which means ` +
        `.gitattributes' "* text=auto eol=lf" rule isn't normalizing them ` +
        `(run "git add --renormalize ." to fix):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it.skipIf(!gitAvailable)('.gitattributes declares the repo-wide LF rule', () => {
    const gitattributes = readFileSync(new URL('.gitattributes', repoRoot), 'utf8');

    expect(gitattributes).toMatch(/\*\s+text=auto\s+eol=lf/);
  });
});
