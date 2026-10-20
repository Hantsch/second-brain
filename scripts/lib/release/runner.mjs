// The release runner: the only part of the release pipeline that touches git, gh, the build and
// the disk. Every decision lives in plan.mjs; this file orders the side effects around it.
//
// Its effects are irreversible (a pushed tag on main, a public GitHub release), so every one goes
// through an injected `exec` or `fs`. That makes the no-mutation paths provable in a test rather
// than argued: a refusal returns before the build, a dry run returns before the first write, and
// the only git command either may run is the read-only `git tag --list`.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { checkBundleContents } from '../handoff-check.mjs';
import { collectAssets, expectedAssets } from './artifacts.mjs';
import { ReleaseRefused, planRelease } from './plan.mjs';

const USAGE = 'usage: npm run release -- [--dry-run] [--version <v> | --bump <level>] [--if-pending]';

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ dryRun: boolean, ifPending: boolean, version?: string, bump?: string }} */
  const args = { dryRun: false, ifPending: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--if-pending') args.ifPending = true;
    else if (arg === '--version' || arg === '--bump') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--version') args.version = value;
      else args.bump = value;
      i += 1;
    } else throw new Error(`unknown argument "${arg}"`);
  }
  return args;
}

/** Shell-quoted so the printed line can be pasted as is. @param {{cmd: string, args: string[]}} c */
function formatCommand({ cmd, args }) {
  const quote = (part) => (/^[\w@%+=:,./\\-]+$/.test(part) ? part : `"${part.replace(/"/g, '\\"')}"`);
  return [cmd, ...args].map(quote).join(' ');
}

/** @param {{ status: number | null, error?: Error }} result */
function failed(result) {
  return result.error !== undefined || result.status !== 0;
}

/** @param {{ status: number | null, error?: Error }} result */
function describeFailure(result) {
  return result.error ? `did not start: ${result.error.message}` : `exited with code ${result.status}`;
}

/** The electron-builder CLI, resolved through its own manifest rather than a guessed path. */
export function electronBuilderCli() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('electron-builder/package.json');
  const bin = JSON.parse(readFileSync(manifestPath, 'utf8')).bin?.['electron-builder'];
  if (typeof bin !== 'string') throw new Error('electron-builder declares no bin');
  return resolve(dirname(manifestPath), bin);
}

/** Real process runner. Never throws: a failed start comes back as `error`. */
export function nodeExec(cmd, args, { cwd, shell = false, capture = false }) {
  const result = spawnSync(cmd, args, {
    cwd,
    shell,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  return { status: result.status, stdout: result.stdout ?? '', error: result.error };
}

/** @param {string} root @param {string} prefix @returns {string[]} */
function listFilesUnder(root, prefix = '') {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listFilesUnder(join(root, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

export const nodeFs = {
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile: (path, content) => writeFileSync(path, content, 'utf8'),
  exists: (path) => existsSync(path),
  remove: (path) => rmSync(path, { force: true }),
  listFiles: (dir) => listFilesUnder(dir),
  // Outside the repo: the notes are a gh input and must not land in the release commit.
  writeTempFile: (name, content) => {
    const file = join(mkdtempSync(join(tmpdir(), 'gaston-release-')), name);
    writeFileSync(file, content, 'utf8');
    return file;
  },
};

/**
 * @param {{ argv: string[], env: Record<string, string | undefined>, cwd: string,
 *   exec: typeof nodeExec, fs: typeof nodeFs, log: (line: string) => void, today: () => string,
 *   builderCli?: () => string }} deps
 * @returns {number} exit code
 */
export function runRelease({
  argv,
  env,
  cwd,
  exec,
  fs,
  log,
  today,
  builderCli = electronBuilderCli,
}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    log(`release: ${error instanceof Error ? error.message : String(error)}`);
    log(USAGE);
    return 1;
  }
  const isCi = env.CI === 'true';

  // planRelease refuses this too, but only after the tags were read; outside CI not even the
  // read-only git call should run when nothing can legitimately follow.
  if (!args.dryRun && !isCi) {
    log('release refused: a real release only runs in CI; use --dry-run locally');
    return 1;
  }

  const changelogPath = join(cwd, 'CHANGELOG.md');
  if (!fs.exists(changelogPath)) {
    log('release refused: CHANGELOG.md does not exist');
    return 1;
  }
  const tagList = exec('git', ['tag', '--list'], { cwd, capture: true });
  if (failed(tagList)) {
    log(`release: git tag --list ${describeFailure(tagList)}`);
    return 1;
  }
  const input = {
    changelogText: fs.readFile(changelogPath),
    pkgText: fs.readFile(join(cwd, 'package.json')),
    lockText: fs.readFile(join(cwd, 'package-lock.json')),
    tags: tagList.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    requestedVersion: args.version,
    bump: args.bump,
    dryRun: args.dryRun,
    isCi,
    today: today(),
  };

  let plan;
  try {
    plan = planRelease(input);
  } catch (error) {
    if (!(error instanceof ReleaseRefused)) throw error;
    if (args.ifPending && error.kind === 'nothing-pending') {
      log(`release: nothing to release (${error.reason})`);
      return 0;
    }
    log(`release refused: ${error.reason}`);
    return 1;
  }

  const build = exec('npm', ['run', 'build'], { cwd, shell: process.platform === 'win32' });
  if (failed(build)) {
    log(`release: npm run build ${describeFailure(build)}`);
    return 1;
  }

  // Swept before packaging: once inside the exe the tree can no longer be inspected.
  const outDir = join(cwd, 'out');
  if (!fs.exists(outDir)) {
    log('release: out/ does not exist after the build');
    return 1;
  }
  const findings = checkBundleContents(fs.listFiles(outDir).map((file) => `out/${file}`));
  if (findings.length > 0) {
    log(`release: out/ has ${findings.length} forbidden file(s), nothing was packaged`);
    for (const finding of findings) log(`  - ${finding}`);
    return 1;
  }

  // A leftover asset from an earlier build would otherwise pass collectAssets unbuilt.
  const distDir = join(cwd, 'dist');
  for (const name of expectedAssets(plan.version)) {
    if (fs.exists(join(distDir, name))) fs.remove(join(distDir, name));
  }

  // The version reaches electron-builder as metadata, so a dry run builds the right file names
  // without bumping package.json on disk. Spawned without a shell: a node path with a space in it
  // breaks unquoted cmd.exe parsing.
  const packaging = exec(
    process.execPath,
    [
      builderCli(),
      '--win',
      'nsis',
      'portable',
      '--publish',
      'never',
      `-c.extraMetadata.version=${plan.version}`,
    ],
    { cwd, shell: false },
  );
  if (failed(packaging)) {
    log(`release: electron-builder ${describeFailure(packaging)}`);
    return 1;
  }

  let assets;
  try {
    assets = collectAssets(distDir, plan.version);
  } catch (error) {
    log(`release: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  log(`version: ${plan.version}${plan.prerelease ? ' (prerelease)' : ''}`);
  log(`tag: ${plan.tag}`);
  log(`assets: ${assets.join(', ')}`);
  log('notes:');
  log(plan.notes);

  if (args.dryRun) {
    log('dry run: nothing written, committed, tagged or published.');
    return 0;
  }

  const notesPath = fs.writeTempFile('release-notes.md', plan.notes);
  // Same inputs, so the same plan; this pass only fills in the real notes file and asset paths.
  const final = planRelease({ ...input, notesPath, assets });
  for (const write of final.writes) fs.writeFile(join(cwd, write.path), write.content);

  const pushIndex = final.commands.findIndex((c) => c.cmd === 'git' && c.args[0] === 'push');
  for (const [index, command] of final.commands.entries()) {
    const result = exec(command.cmd, command.args, { cwd, shell: false });
    if (!failed(result)) continue;
    log(`release: ${command.cmd} ${command.args[0]} ${describeFailure(result)}`);
    if (index > pushIndex) {
      // The tag is public by now; a quiet exit would leave a tag without a release.
      log(`release: ${final.tag} is pushed but not published. Finish by hand with:`);
      for (const remaining of final.commands.slice(index)) log(`  ${formatCommand(remaining)}`);
    } else {
      log('release: nothing was pushed or published.');
    }
    return 1;
  }

  log(`released ${final.tag}.`);
  return 0;
}
