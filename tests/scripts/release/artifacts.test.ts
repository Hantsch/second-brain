/* Covers scripts/lib/release/artifacts.mjs: the Windows release asset set. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectAssets, expectedAssets } from '../../../scripts/lib/release/artifacts.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function buildDir(version: string, skip: string[] = [], latestPath?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gaston-assets-'));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  for (const name of expectedAssets(version)) {
    if (skip.includes(name)) continue;
    const body =
      name === 'latest.yml' ? `version: ${version}\npath: ${latestPath ?? `gaston-${version}-setup.exe`}\n` : 'x';
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

describe('release assets', () => {
  it('the asset set is setup exe, its blockmap, portable exe and latest.yml, and a missing one refuses', () => {
    expect(expectedAssets('1.2.4')).toEqual([
      'gaston-1.2.4-setup.exe',
      'gaston-1.2.4-setup.exe.blockmap',
      'gaston-1.2.4-portable.exe',
      'latest.yml',
    ]);

    const full = buildDir('1.2.4');
    expect(collectAssets(full, '1.2.4')).toEqual(expectedAssets('1.2.4').map((n) => join(full, n)));

    const gaps = buildDir('1.2.4', ['gaston-1.2.4-portable.exe', 'gaston-1.2.4-setup.exe.blockmap']);
    expect(() => collectAssets(gaps, '1.2.4')).toThrow(
      /gaston-1\.2\.4-setup\.exe\.blockmap.*gaston-1\.2\.4-portable\.exe/,
    );

    const wrong = buildDir('1.2.4', [], 'gaston-1.2.3-setup.exe');
    expect(() => collectAssets(wrong, '1.2.4')).toThrow(/latest\.yml/);
  });
});
