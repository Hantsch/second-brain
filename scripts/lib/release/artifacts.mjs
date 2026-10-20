// The Windows release asset set and a check that a build directory produced all of it.
// `expectedAssets` is pure; `collectAssets` is the only function here that touches the disk.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * @param {string} version no leading `v`.
 * @returns {string[]} setup exe, its blockmap, portable exe, latest.yml - in that fixed order.
 */
export function expectedAssets(version) {
  return [
    `gaston-${version}-setup.exe`,
    `gaston-${version}-setup.exe.blockmap`,
    `gaston-${version}-portable.exe`,
    'latest.yml',
  ];
}

/**
 * Full paths of the expected assets in `dir`. Refuses rather than returning a partial set: the
 * auto-updater reads latest.yml, so publishing without the file it points at would break updates.
 *
 * @param {string} dir
 * @param {string} version
 * @returns {string[]}
 */
export function collectAssets(dir, version) {
  const expected = expectedAssets(version);
  const missing = expected.filter((name) => !existsSync(join(dir, name)));
  if (missing.length > 0) {
    throw new Error(`missing release asset(s) in "${dir}": ${missing.join(', ')}`);
  }
  const setup = expected[0];
  const meta = parse(readFileSync(join(dir, 'latest.yml'), 'utf8'));
  const path = meta && typeof meta === 'object' ? meta.path : undefined;
  if (path !== setup) {
    throw new Error(`latest.yml points at "${String(path)}", expected "${setup}"`);
  }
  return expected.map((name) => join(dir, name));
}
