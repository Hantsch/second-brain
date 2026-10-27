// Pure planning step of the release: everything the shell layer would fetch from disk, git or CI
// arrives as an argument, so a plan can be produced and tested without a repository.
import { notesFor, promote, readUnreleased, validateUnreleased } from './changelog.mjs';
import { expectedAssets } from './artifacts.mjs';
import { TOP_LEVEL_VERSION, applyVersion, deriveBump, isPrerelease, isValidVersion, nextVersion } from './version.mjs';

const REPO = 'Hantsch/second-brain';
const BUMPS = ['major', 'minor', 'patch'];

export class ReleaseRefused extends Error {
  /** @param {string} kind @param {string} reason */
  constructor(kind, reason) {
    super(reason);
    this.name = 'ReleaseRefused';
    this.kind = kind;
    this.reason = reason;
  }
}

/** @param {string} text */
function currentVersion(text) {
  const match = TOP_LEVEL_VERSION.exec(text);
  if (!match) throw new Error('no "version" field found in package.json text');
  // The pattern's two groups wrap the value, so what lies between them is the version.
  return match[0].slice(match[1].length, match[0].length - match[2].length);
}

/**
 * @param {{ changelogText: string, pkgText: string, lockText: string, tags: string[],
 *   requestedVersion?: string, bump?: string, dryRun: boolean, isCi: boolean, today: string,
 *   notesPath?: string, assets?: string[] }} input
 */
export function planRelease({
  changelogText,
  pkgText,
  lockText,
  tags,
  requestedVersion,
  bump,
  dryRun,
  isCi,
  today,
  notesPath = '<notes-file>',
  assets,
}) {
  // A real release publishes; only CI may do that. Checked first so a laptop never gets as far
  // as a half-believable plan.
  if (!dryRun && !isCi) {
    throw new ReleaseRefused('outside-ci', 'a real release only runs in CI; use --dry-run locally');
  }
  const pending = validateUnreleased(changelogText);
  if (pending) throw new ReleaseRefused('nothing-pending', pending);

  if (requestedVersion !== undefined && !isValidVersion(requestedVersion)) {
    throw new ReleaseRefused('bad-version', `"${requestedVersion}" is not a valid version`);
  }
  if (bump !== undefined && !BUMPS.includes(bump)) {
    throw new ReleaseRefused('bad-bump', `"${bump}" is not one of major, minor, patch`);
  }

  const unreleased = readUnreleased(changelogText);
  const version =
    requestedVersion ??
    nextVersion(currentVersion(pkgText), bump ?? deriveBump(unreleased.categories, unreleased.bullets), {
      explicit: bump !== undefined,
    });
  const tag = `v${version}`;
  if (tags.includes(tag)) throw new ReleaseRefused('tag-exists', `tag ${tag} already exists`);

  const promoted = promote(changelogText, version, today);
  const next = applyVersion(pkgText, lockText, version);
  const writes = [
    { path: 'package.json', content: next.pkgText },
    { path: 'package-lock.json', content: next.lockText },
    { path: 'CHANGELOG.md', content: promoted },
  ];

  const commands = dryRun
    ? []
    : [
        { cmd: 'git', args: ['add', ...writes.map((w) => w.path)] },
        { cmd: 'git', args: ['commit', '-m', `release: ${version} [skip ci]`] },
        { cmd: 'git', args: ['tag', '-a', tag, '-m', `Gaston ${version}`] },
        { cmd: 'git', args: ['push', '--atomic', 'origin', 'HEAD:main', tag] },
        {
          cmd: 'gh',
          args: [
            'release',
            'create',
            tag,
            ...(assets ?? expectedAssets(version)),
            '--title',
            `Gaston ${version}`,
            '--notes-file',
            notesPath,
            '--repo',
            REPO,
            ...(isPrerelease(version) ? ['--prerelease'] : []),
          ],
        },
      ];

  return {
    version,
    tag,
    notes: notesFor(promoted, version),
    prerelease: isPrerelease(version),
    writes,
    commands,
  };
}
