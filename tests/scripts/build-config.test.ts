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

  it('electron-builder builds nsis and portable, publishes to Hantsch/second-brain, and no artifact name has a space', () => {
    const { build, scripts } = JSON.parse(packageJsonRaw) as {
      build: Record<string, unknown> & {
        win: { target: unknown };
        portable: { artifactName: string };
        nsis: { artifactName: string; oneClick: boolean; perMachine: boolean };
      };
      scripts: Record<string, string>;
    };
    expect(build.win.target).toEqual(['nsis', 'portable']);
    expect(build.artifactName).toBeUndefined();
    expect(build.portable.artifactName).toBe('gaston-${version}-portable.${ext}');
    expect(build.nsis).toEqual({
      artifactName: 'gaston-${version}-setup.${ext}',
      oneClick: true,
      perMachine: false,
    });
    expect(build.publish).toEqual({ provider: 'github', owner: 'Hantsch', repo: 'second-brain' });
    expect(scripts.package).toBe(
      'npm run build && electron-builder --win nsis portable --publish never',
    );
    // A space breaks the asset URL that latest.yml records.
    expect(build.portable.artifactName).not.toMatch(/\s/);
    expect(build.nsis.artifactName).not.toMatch(/\s/);
  });
});
