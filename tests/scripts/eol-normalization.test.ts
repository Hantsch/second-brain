/* Guards that `.gitattributes` normalizes every tracked file to LF on
   checkout (see the rationale block at the top of .gitattributes). Without a
   test, a future edit that narrows or removes the `* text=auto eol=lf` rule —
   or a file checked in with CRLF before that rule existed — would silently let
   CRLF back into the index, and `prettier --check` (which expects LF) would
   fail on machines with `core.autocrlf=true`. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { eolGuardPlan, indexEolLines } from '../helpers/git-checkout';

const repoRoot = new URL('../../', import.meta.url);

/* The repo also ships as a downloaded zip, which has no `.git` entry; that is
   the only skip. A checkout where git is not runnable fails instead, so the
   guard can never pass unchecked. */
const plan = eolGuardPlan(repoRoot);
const skipReason = plan.run ? '' : plan.reason;

describe.skipIf(!plan.run)(
  `line-ending normalization${skipReason ? ` (skipped: ${skipReason})` : ''}`,
  () => {
    it('no tracked file has a CRLF or mixed index eol', () => {
      const offenders: string[] = [];
      for (const line of indexEolLines(repoRoot)) {
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

    it('.gitattributes declares the repo-wide LF rule', () => {
      const gitattributes = readFileSync(new URL('.gitattributes', repoRoot), 'utf8');

      expect(gitattributes).toMatch(/\*\s+text=auto\s+eol=lf/);
    });
  },
);

describe('git checkout detection', () => {
  const dirs: string[] = [];
  const makeTmp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'eol-guard-'));
    dirs.push(dir);
    return dir;
  };

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('a .git entry with git not runnable fails instead of skipping', () => {
    const tmp = makeTmp();
    mkdirSync(join(tmp, '.git'));

    expect(eolGuardPlan(tmp)).toEqual({ run: true });
    expect(() => indexEolLines(tmp, 'git-missing-for-test')).toThrow();
  });

  it('no .git entry skips with a stated reason', () => {
    const plan = eolGuardPlan(makeTmp());

    expect(plan.run).toBe(false);
    expect(plan.run ? '' : plan.reason).not.toBe('');
  });
});
