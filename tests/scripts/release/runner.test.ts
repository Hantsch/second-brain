/* Covers scripts/lib/release/runner.mjs: the side-effect layer of a release. Runs against a real
   temp directory; git, gh, npm and electron-builder are a fake exec that records each call and,
   for the two build steps, leaves the files a real build would. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeFs, runRelease } from '../../../scripts/lib/release/runner.mjs';
import type { ExecResult, ReleaseFs } from '../../../scripts/lib/release/runner.mjs';

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

interface Call {
  cmd: string;
  args: string[];
  shell?: boolean;
}

let dir: string;
let events: string[];
let calls: Call[];
let lines: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'release-runner-'));
  writeFileSync(join(dir, 'CHANGELOG.md'), PENDING);
  writeFileSync(join(dir, 'package.json'), PKG);
  writeFileSync(join(dir, 'package-lock.json'), LOCK);
  events = [];
  calls = [];
  lines = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function put(relative: string, content: string): void {
  mkdirSync(dirname(join(dir, relative)), { recursive: true });
  writeFileSync(join(dir, relative), content);
}

/** Real disk underneath; every call the runner makes is recorded in `events`. */
function recordingFs(): ReleaseFs {
  return {
    readFile: (path) => {
      events.push(`read ${path}`);
      return nodeFs.readFile(path);
    },
    exists: (path) => {
      events.push(`exists ${path}`);
      return nodeFs.exists(path);
    },
    listFiles: (path) => {
      events.push(`list ${path}`);
      return nodeFs.listFiles(path);
    },
    writeFile: (path, content) => {
      events.push(`write ${path}`);
      nodeFs.writeFile(path, content);
    },
    remove: (path) => {
      events.push(`remove ${path}`);
      nodeFs.remove(path);
    },
  };
}

interface ExecSetup {
  tags?: string;
  outFiles?: string[];
  fails?: (call: Call) => boolean;
}

function fakeExec({ tags = 'v1.2.3\n', outFiles = ['main/index.js'], fails }: ExecSetup = {}) {
  return (cmd: string, args: string[], options: { shell?: boolean }): ExecResult => {
    const call = { cmd, args, shell: options.shell };
    calls.push(call);
    events.push(`exec ${cmd} ${args.join(' ')}`);
    if (fails?.(call)) return { status: 1, stdout: '' };
    if (cmd === 'git' && args[0] === 'tag' && args[1] === '--list') return { status: 0, stdout: tags };
    if (cmd === 'npm') for (const file of outFiles) put(`out/${file}`, 'built');
    if (cmd === process.execPath) {
      const version = args.find((a) => a.startsWith('-c.extraMetadata.version='))?.split('=')[1];
      put(`dist/gaston-${version}-setup.exe`, 'exe');
      put(`dist/gaston-${version}-setup.exe.blockmap`, 'map');
      put(`dist/gaston-${version}-portable.exe`, 'exe');
      put('dist/latest.yml', `version: ${version}\npath: gaston-${version}-setup.exe\n`);
    }
    return { status: 0, stdout: '' };
  };
}

function run(argv: string[], { ci = false, exec = fakeExec() } = {}): number {
  return runRelease({
    argv,
    env: ci ? { CI: 'true' } : {},
    cwd: dir,
    exec,
    fs: recordingFs(),
    log: (line) => lines.push(line),
    today: () => '2026-10-20',
    builderCli: () => 'electron-builder-cli.js',
  });
}

const isTagList = (c: Call) => c.cmd === 'git' && c.args.join(' ') === 'tag --list';
const mutatingGitOrGh = () => calls.filter((c) => (c.cmd === 'git' && !isTagList(c)) || c.cmd === 'gh');
const writes = () => events.filter((e) => e.startsWith('write ') || e.startsWith('remove '));

describe('release runner', () => {
  it('a refused run builds nothing, writes no file and runs no git or gh command', () => {
    // An existing tag, and an empty Unreleased section on a dry run.
    expect(run(['--version', '1.3.0'], { ci: true, exec: fakeExec({ tags: 'v1.3.0\n' }) })).toBe(1);
    writeFileSync(join(dir, 'CHANGELOG.md'), EMPTY);
    expect(run(['--dry-run'])).toBe(1);

    expect(calls.every(isTagList)).toBe(true);
    expect(writes()).toEqual([]);
    expect(lines.filter((l) => l.startsWith('release refused:'))).toHaveLength(2);
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(PKG);
  });

  it('a dry run builds and checks the assets, prints version and notes, and writes nothing and runs no git or gh command', () => {
    put('dist/latest.yml', 'path: stale.exe\n');

    expect(run(['--dry-run', '--version', '1.3.0'])).toBe(0);

    expect(calls.map((c) => c.cmd)).toEqual(['git', 'npm', process.execPath]);
    expect(mutatingGitOrGh()).toEqual([]);
    const builder = calls[2]!;
    expect(builder.shell).toBe(false);
    expect(builder.args).toEqual([
      'electron-builder-cli.js',
      '--win',
      'nsis',
      'portable',
      '--publish',
      'never',
      '-c.extraMetadata.version=1.3.0',
    ]);
    // The stale latest.yml is the only thing touched, and only inside dist/.
    expect(writes()).toEqual([`remove ${join(dir, 'dist', 'latest.yml')}`]);
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toBe(PENDING);
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(PKG);
    expect(lines).toContain('version: 1.3.0');
    expect(lines.join('\n')).toContain('Search no longer drops results.');
  });

  it('with --if-pending only an empty Unreleased exits 0', () => {
    writeFileSync(join(dir, 'CHANGELOG.md'), EMPTY);
    expect(run(['--if-pending'], { ci: true })).toBe(0);
    expect(run([], { ci: true })).toBe(1);

    writeFileSync(join(dir, 'CHANGELOG.md'), PENDING);
    const tagged = fakeExec({ tags: 'v1.3.0\n' });
    expect(run(['--if-pending', '--version', '1.3.0'], { ci: true, exec: tagged })).toBe(1);

    expect(calls.every(isTagList)).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('a non-dry run without CI=true refuses before building', () => {
    expect(run(['--version', '1.3.0'])).toBe(1);

    expect(calls).toEqual([]);
    expect(events).toEqual([]);
    expect(lines.join('\n')).toMatch(/only runs in CI/);
  });

  it('a real run writes the plan files, then runs git and gh in order with the real notes and assets', () => {
    expect(run(['--version', '1.3.0'], { ci: true })).toBe(0);

    const notesPath = join(dir, 'dist', 'release-notes.md');
    const order = events.filter((e) => e.startsWith('write ') || /^exec (git|gh) /.test(e));
    expect(order.slice(0, 5)).toEqual([
      'exec git tag --list',
      `write ${notesPath}`,
      `write ${join(dir, 'package.json')}`,
      `write ${join(dir, 'package-lock.json')}`,
      `write ${join(dir, 'CHANGELOG.md')}`,
    ]);
    const published = calls.filter((c) => c.cmd === 'gh' || (c.cmd === 'git' && !isTagList(c)));
    expect(published.map((c) => `${c.cmd} ${c.args[0]}`)).toEqual([
      'git add',
      'git commit',
      'git tag',
      'git push',
      'gh release',
    ]);
    const gh = published[4]!;
    expect(gh.args).toContain(notesPath);
    expect(gh.args).toContain(join(dir, 'dist', 'gaston-1.3.0-portable.exe'));
    expect(readFileSync(notesPath, 'utf8')).toContain('Search no longer drops results.');
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"version": "1.3.0"');
  });

  it('a gh failure after the push exits 1 and prints the gh command to finish by hand', () => {
    const exec = fakeExec({ fails: (c) => c.cmd === 'gh' });

    expect(run(['--version', '1.3.0'], { ci: true, exec })).toBe(1);

    const output = lines.join('\n');
    expect(output).toContain('v1.3.0 is pushed but not published');
    const manual = lines.find((l) => l.trimStart().startsWith('gh release create v1.3.0'));
    expect(manual).toBeDefined();
    expect(manual).toContain('dist/release-notes.md');
    expect(manual).toContain('--notes-file');
  });

  it('a failed publish after the push points at the uploaded release files, not runner paths', () => {
    const exec = fakeExec({ fails: (c) => c.cmd === 'gh' });

    expect(run(['--version', '1.3.0'], { ci: true, exec })).toBe(1);

    const manual = lines.find((l) => l.trimStart().startsWith('gh release create v1.3.0'))!;
    expect(manual).toContain('dist/gaston-1.3.0-portable.exe');
    expect(manual).toContain('dist/latest.yml');
    expect(manual).toContain('dist/release-notes.md');
    expect(manual).not.toContain(dir);
    expect(lines).toContain('the files are in the "release-files" artifact of this workflow run');
  });

  it('a failed push exits 1 without running gh or offering a manual release', () => {
    const exec = fakeExec({ fails: (c) => c.cmd === 'git' && c.args[0] === 'push' });

    expect(run(['--version', '1.3.0'], { ci: true, exec })).toBe(1);

    expect(calls.some((c) => c.cmd === 'gh')).toBe(false);
    expect(lines.join('\n')).toContain('nothing was pushed or published');
  });

  it('forbidden files under out/ abort before electron-builder runs', () => {
    const exec = fakeExec({ outFiles: ['main/index.js', 'renderer/.env'] });

    expect(run(['--version', '1.3.0'], { ci: true, exec })).toBe(1);

    expect(calls.map((c) => c.cmd)).toEqual(['git', 'npm']);
    expect(writes()).toEqual([]);
    expect(lines.join('\n')).toContain("out/renderer/.env: contains forbidden pattern '.env'");
  });
});
