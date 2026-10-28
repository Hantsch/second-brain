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

  it('every win target has a space-free artifact name, the package script builds exactly those targets without publishing, and releases publish to Hantsch/second-brain', () => {
    const { build, scripts } = JSON.parse(packageJsonRaw) as {
      build: Record<string, unknown> & {
        win: { target: unknown };
        portable: { artifactName: string };
        nsis: { artifactName: string; oneClick: boolean; perMachine: boolean };
      };
      scripts: Record<string, string>;
    };
    expect(build.artifactName).toBeUndefined();
    expect(build.portable.artifactName).toBe('gaston-${version}-portable.${ext}');
    expect(build.nsis).toEqual({
      artifactName: 'gaston-${version}-setup.${ext}',
      oneClick: true,
      perMachine: false,
    });
    expect(build.publish).toEqual({ provider: 'github', owner: 'Hantsch', repo: 'second-brain' });
    const targets = build.win.target;
    expect(Array.isArray(targets) && targets.length > 0).toBe(true);
    for (const t of targets as string[]) {
      expect(typeof t).toBe('string');
      const name = (build[t] as { artifactName?: unknown } | undefined)?.artifactName;
      expect(typeof name, `build.${t}.artifactName`).toBe('string');
      // A space breaks the asset URL that latest.yml records.
      expect(name as string).not.toMatch(/\s/);
    }
    const tokens = String(scripts.package).split(/\s+/);
    const winAt = tokens.indexOf('--win');
    expect(winAt).toBeGreaterThanOrEqual(0);
    const rest = tokens.slice(winAt + 1);
    const nextFlag = rest.findIndex((x) => x.startsWith('--'));
    expect(nextFlag === -1 ? rest : rest.slice(0, nextFlag)).toEqual(targets);
    expect(scripts.package).toContain('--publish never');
  });
});
