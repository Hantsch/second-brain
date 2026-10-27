/* Covers scripts/lib/release/plan.mjs: the pure release plan. */

import { describe, expect, it } from 'vitest';
import { ReleaseRefused, planRelease } from '../../../scripts/lib/release/plan.mjs';
import type { PlanInput } from '../../../scripts/lib/release/plan.mjs';

const PENDING = `# Changelog

## Unreleased

### Fixed

- Search no longer drops results.

## 1.2.3 — 2026-01-01

### Added

- First.
`;

const EMPTY = PENDING.replace('### Fixed\n\n- Search no longer drops results.\n', '<!-- none -->\n');

const PKG = '{\n  "name": "gaston",\n  "version": "1.2.3"\n}\n';
const LOCK =
  '{\n  "name": "gaston",\n  "version": "1.2.3",\n  "packages": {\n    "": {\n      "name": "gaston",\n      "version": "1.2.3"\n    }\n  }\n}\n';

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    changelogText: PENDING,
    pkgText: PKG,
    lockText: LOCK,
    tags: ['v1.2.3'],
    dryRun: false,
    isCi: true,
    today: '2026-10-20',
    ...over,
  };
}

function fileOf(plan: { writes: { path: string; content: string }[] }, path: string): string {
  const w = plan.writes.find((x) => x.path === path);
  if (!w) throw new Error(`no write for ${path}`);
  return w.content;
}

function refusal(fn: () => unknown): ReleaseRefused {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ReleaseRefused);
    return e as ReleaseRefused;
  }
  throw new Error('expected a refusal');
}

describe('planRelease', () => {
  it('an empty Unreleased section refuses with a reason and plans no writes', () => {
    const e = refusal(() => planRelease(input({ changelogText: EMPTY })));
    expect(e.kind).toBe('nothing-pending');
    expect(e.reason).toMatch(/Unreleased/);
  });

  it('a release promotes Unreleased into a dated section, writes the version to package.json and the lockfile, and plans one commit and one tag', () => {
    const plan = planRelease(input());
    expect(plan.version).toBe('1.2.4');
    const byPath = Object.fromEntries(plan.writes.map((w) => [w.path, w.content]));
    expect(Object.keys(byPath).sort()).toEqual(['CHANGELOG.md', 'package-lock.json', 'package.json']);
    expect(byPath['CHANGELOG.md']).toContain('## 1.2.4 — 2026-10-20');
    expect(byPath['CHANGELOG.md']).toMatch(/## Unreleased\s+<!--/);
    expect(JSON.parse(fileOf(plan, 'package.json')).version).toBe('1.2.4');
    expect(JSON.parse(fileOf(plan, 'package-lock.json')).packages[''].version).toBe('1.2.4');

    const lines = plan.commands.map((c) => [c.cmd, ...c.args].join(' '));
    expect(lines.filter((l) => l.startsWith('git commit'))).toEqual([
      'git commit -m release: 1.2.4 [skip ci]',
    ]);
    expect(lines.filter((l) => l.startsWith('git tag'))).toEqual([
      'git tag -a v1.2.4 -m Gaston 1.2.4',
    ]);
    expect(lines).toContain('git add package.json package-lock.json CHANGELOG.md');
    expect(lines).toContain('git push --atomic origin HEAD:main v1.2.4');
  });

  it('the gh call publishes every asset to Hantsch/second-brain with the promoted section as notes', () => {
    const plan = planRelease(input({ notesPath: 'notes.md' }));
    const gh = plan.commands.find((c) => c.cmd === 'gh');
    expect(gh?.args).toEqual([
      'release',
      'create',
      'v1.2.4',
      'gaston-1.2.4-setup.exe',
      'gaston-1.2.4-setup.exe.blockmap',
      'gaston-1.2.4-portable.exe',
      'latest.yml',
      '--title',
      'Gaston 1.2.4',
      '--notes-file',
      'notes.md',
      '--repo',
      'Hantsch/second-brain',
    ]);
    expect(plan.notes).toContain('Search no longer drops results.');
    expect(plan.notes).not.toContain('First.');

    const pre = planRelease(input({ requestedVersion: '2.0.0-beta.1' }));
    expect(pre.prerelease).toBe(true);
    expect(pre.commands.find((c) => c.cmd === 'gh')?.args).toContain('--prerelease');
  });

  it('a dry run yields the version and the notes but no commands', () => {
    const plan = planRelease(input({ dryRun: true, isCi: false }));
    expect(plan.version).toBe('1.2.4');
    expect(plan.notes).toContain('Search no longer drops results.');
    expect(plan.commands).toEqual([]);
  });

  it('an explicit version and an explicit bump each override the derived one', () => {
    expect(planRelease(input({ bump: 'major' })).version).toBe('2.0.0');
    expect(planRelease(input({ bump: 'minor' })).version).toBe('1.3.0');
    expect(planRelease(input({ requestedVersion: '3.0.0', bump: 'minor' })).version).toBe('3.0.0');
    expect(refusal(() => planRelease(input({ requestedVersion: 'x' }))).kind).toBe('bad-version');
    expect(
      refusal(() => planRelease(input({ bump: 'huge' as unknown as 'major' }))).kind,
    ).toBe('bad-bump');
  });

  it('a second run on an unchanged tree refuses: Unreleased is empty and the tag already exists', () => {
    const first = planRelease(input());
    const w = Object.fromEntries(first.writes.map((x) => [x.path, x.content]));
    const again = input({
      changelogText: w['CHANGELOG.md'],
      pkgText: w['package.json'],
      lockText: w['package-lock.json'],
      tags: ['v1.2.3', first.tag],
    });
    expect(refusal(() => planRelease(again)).kind).toBe('nothing-pending');
    // Even with new notes, the tag guard still stops a re-cut of the same version.
    expect(
      refusal(() => planRelease({ ...again, changelogText: PENDING, requestedVersion: '1.2.4' }))
        .kind,
    ).toBe('tag-exists');
  });

  it('a real release outside CI refuses', () => {
    const e = refusal(() => planRelease(input({ isCi: false })));
    expect(e.kind).toBe('outside-ci');
  });

  it('the current version comes from the top-level field, not a nested one', () => {
    const pkgText = '{\n  "config": {\n    "version": "9.9.9"\n  },\n  "version": "1.2.3"\n}\n';

    const plan = planRelease(input({ pkgText, bump: 'patch' }));

    expect(plan.version).toBe('1.2.4');
  });
});
