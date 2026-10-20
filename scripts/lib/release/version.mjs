// Pure semver helpers for the release flow. Prerelease-aware: while the project sits on a
// prerelease (`1.0.0-beta.1`), a category-derived bump only ticks the counter, because the stable
// line has not shipped and a derived "major" must not announce a release that does not exist.

/** @typedef {'major' | 'minor' | 'patch'} Bump */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** @param {string} v */
export function isValidVersion(v) {
  return SEMVER.test(v);
}

/** @param {string} v */
export function isPrerelease(v) {
  const m = SEMVER.exec(v);
  return Boolean(m && m[4]);
}

/**
 * `### Removed` or a `**BREAKING**` bullet -> major; `### Added` / `### Changed` -> minor; else patch.
 *
 * @param {string[]} categories
 * @param {string[]} bullets
 * @returns {Bump}
 */
export function deriveBump(categories, bullets) {
  if (categories.includes('Removed') || bullets.some((b) => b.includes('**BREAKING**'))) {
    return 'major';
  }
  if (categories.includes('Added') || categories.includes('Changed')) return 'minor';
  return 'patch';
}

/**
 * An `explicit` bump (requested by a human) cuts a real release and drops the prerelease tag;
 * a derived one on a prerelease only increments the trailing counter.
 *
 * @param {string} current
 * @param {Bump} bump
 * @param {{ explicit?: boolean }} [options]
 * @returns {string}
 */
export function nextVersion(current, bump, options = {}) {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`nextVersion: "${current}" is not a valid version`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] && !options.explicit) {
    const pre = /^(.*\.)(\d+)$/.exec(m[4]);
    if (!pre) throw new Error(`nextVersion: prerelease "${m[4]}" does not end in ".<number>"`);
    return `${major}.${minor}.${patch}-${pre[1]}${Number(pre[2]) + 1}`;
  }
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`nextVersion: unknown bump "${bump}"`);
}

/**
 * Rewrites only the project's own version fields by regex, so formatting and line endings stay
 * byte-identical (no JSON round-trip). Own fields are the top-level `version` (indent of one
 * level) and the lockfile's `packages[""]` entry; dependency versions are indented deeper.
 *
 * @param {string} pkgText
 * @param {string} lockText
 * @param {string} version
 * @returns {{ pkgText: string, lockText: string }}
 */
export function applyVersion(pkgText, lockText, version) {
  const top = /^((?: {2}|\t)"version":\s*")[^"]*(")/m;
  if (!top.test(pkgText)) throw new Error('applyVersion: no top-level "version" in package.json');
  if (!top.test(lockText)) throw new Error('applyVersion: no top-level "version" in lockfile');
  const self = /("packages":\s*\{\s*"":\s*\{[^}]*?"version":\s*")[^"]*(")/;
  const swap = (/** @type {string} */ _m, /** @type {string} */ a, /** @type {string} */ b) =>
    `${a}${version}${b}`;
  return {
    pkgText: pkgText.replace(top, swap),
    lockText: lockText.replace(top, swap).replace(self, swap),
  };
}
