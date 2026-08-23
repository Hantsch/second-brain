/* Guards package.json's electron-builder configuration against a widening of
   `files`/`extraResources`: that is exactly the allowlist that decides what
   from the repo ends up in the shipped .exe. A widening — say a recursive
   glob over the whole repo instead of "out/**", or an extra extraResources
   entry without a filter — would pull private vault content, .env files, or
   node_modules leftovers into the package without checkBundleContents
   (scripts/lib/handoff-check.mjs) ever seeing it: the handoff check scans
   the `out/**` tree that electron-builder packages, not the
   electron-builder configuration itself. So any change to these two fields
   must be deliberately reflected here — a silently widened allowlist field
   must not survive this test. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJsonRaw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
const packageJson = JSON.parse(packageJsonRaw) as {
  build: { files: unknown; extraResources: unknown };
};

describe('electron-builder file allowlist in package.json', () => {
  it('ships exactly out/** and package.json — nothing wider', () => {
    expect(packageJson.build.files).toEqual(['out/**', 'package.json']);
  });

  it('extraResources only carries the app-icons entry, filtered to png/ico', () => {
    expect(packageJson.build.extraResources).toEqual([
      {
        from: 'assets/app-icons',
        to: 'assets/app-icons',
        filter: ['*.png', '*.ico'],
      },
    ]);
  });
});
