/* Guards the "no native module" guardrail from CLAUDE.md's tech-stack table: the app must
   stay installable/portable (USB stick, external drive) without prebuilt binaries or a
   native toolchain. A production dependency that ships an install script, a gypfile, or
   platform-specific os/cpu fields is a native module (or fetches one) — and would silently
   break that promise on the next `npm install`. Dev-only tooling (electron, esbuild,
   fsevents, ...) is exempt: it never ships in the app, only compiles/tests it locally. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageLockRaw = readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8');

type LockPackage = {
  dev?: boolean;
  hasInstallScript?: boolean;
  gypfile?: boolean;
  os?: string[];
  cpu?: string[];
};

type PackageLock = {
  packages: Record<string, LockPackage>;
};

const packageLock = JSON.parse(packageLockRaw) as PackageLock;

const productionPackages = Object.entries(packageLock.packages).filter(
  ([key, pkg]) => key !== '' && pkg.dev !== true,
);

describe('no native module is in the production dependency tree', () => {
  it('no native module is in the production dependency tree', () => {
    for (const [key, pkg] of productionPackages) {
      expect(pkg.hasInstallScript, `${key} has an install script`).not.toBeTruthy();
      expect(pkg.gypfile, `${key} has a gypfile (native addon)`).toBeUndefined();
      expect(pkg.os, `${key} has an os field (platform-specific binary)`).toBeUndefined();
      expect(pkg.cpu, `${key} has a cpu field (platform-specific binary)`).toBeUndefined();
      expect(key, `${key} looks like a native N-API module`).not.toMatch(/@napi-rs\//);
      expect(key, `${key} looks like a native canvas module`).not.toMatch(/canvas/);
    }
  });

  it('unpdf is present as a production dependency', () => {
    expect(productionPackages.some(([key]) => key === 'node_modules/unpdf')).toBe(true);
  });
});
