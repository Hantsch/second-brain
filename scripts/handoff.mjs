#!/usr/bin/env node
/* Builds the handoff package: one ZIP a Windows user can unpack and
   double-click, with nothing in it that isn't meant to travel.

   Usage:
     npm run handoff

   Every step either succeeds or ends the whole run — a partial handoff is
   worse than none, because it looks finished. The two content checks come
   from scripts/lib/handoff-check.mjs: `out/**` is swept BEFORE
   electron-builder packages it (afterwards the tree is inside an exe and no
   longer inspectable), and the ZIP's file list is checked twice — once as
   staged, once read back out of the written archive. Any finding, any
   non-zero child process, any failed write: no ZIP is left behind and the
   exit code is 1. */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { electronBuilderCli } from './lib/electron-builder-cli.mjs';
import { checkBundleContents, checkHandoffContents } from './lib/handoff-check.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(REPO_ROOT, 'out');
const DIST_DIR = join(REPO_ROOT, 'dist');
const STAGE_DIR = join(DIST_DIR, 'handoff');
const README_TEMPLATE = join(REPO_ROOT, 'scripts/handoff/README.txt');

/** Carries the step that failed — the failure output has to name it. */
class HandoffError extends Error {
  constructor(step, message, details = []) {
    super(message);
    this.step = step;
    this.details = details;
  }
}

function note(step, text) {
  console.log(`  ${step.padEnd(13)} ${text}`);
}

function mib(path) {
  return `${(statSync(path).size / 1024 / 1024).toFixed(1)} MiB`;
}

/**
 * Runs a child process and turns everything that isn't a clean exit 0 into a
 * `HandoffError` — a swallowed exit code here would ship an unchecked
 * artifact. Output goes straight to the terminal: the user should see the
 * verify run and the electron-builder run as they happen.
 *
 * `shell` defaults to the Windows-shell behaviour npm needs (see below) but
 * must be passed as `false` for a real executable — see the call site.
 */
function runStep(step, command, args, { shell = process.platform === 'win32' } = {}) {
  const shown = [command, ...args].join(' ');
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    /* npm is a .cmd shim on Windows and cannot be spawned without a shell.
       A real .exe like the electron-builder invocation below must NOT go
       through a shell: spawnSync with shell: true on Windows builds a single
       command-line string for cmd.exe without quoting it, and a Node install
       path containing a space (`C:\Program Files\nodejs\node.exe`, the
       common default) then breaks unquoted shell command-line parsing. */
    shell,
  });
  if (result.error) throw new HandoffError(step, `${shown} did not start: ${result.error.message}`);
  if (result.signal) throw new HandoffError(step, `${shown} was killed by signal ${result.signal}`);
  if (result.status !== 0)
    throw new HandoffError(step, `${shown} exited with code ${result.status}`);
}

/** Every file below `root`, as relative paths with `/` separators, sorted. */
function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listFiles(join(root, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

/**
 * Substitutes `${name}` placeholders. A placeholder left over is a failure,
 * not a cosmetic flaw: a README telling the recipient to double-click
 * `${exe}` is worse than no README, and a typo in a template must not pass
 * silently.
 */
function render(step, template, values) {
  const filled = template.replace(/\$\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
  const left = filled.match(/\$\{\w+\}/g);
  if (left !== null) {
    throw new HandoffError(step, `unresolved placeholders: ${[...new Set(left)].join(', ')}`);
  }
  return filled;
}

/** The electron-builder CLI, with a failure reported as the step that needed it. */
function locateElectronBuilder(step) {
  try {
    return electronBuilderCli();
  } catch (error) {
    throw new HandoffError(
      step,
      `electron-builder could not be located: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Writes the ZIP from an explicit entry list — what goes in is what was
 * checked, not whatever a shell glob happened to match. Archiver reports a
 * missing input file as a `warning` and still finalizes, so warnings are
 * collected and raised: a ZIP short one file would otherwise look fine.
 */
async function writeZip(step, zipPath, entries) {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const warnings = [];
  archive.on('warning', (error) => warnings.push(error.message ?? String(error)));
  const closed = new Promise((done, fail) => {
    output.on('close', done);
    output.on('error', fail);
    archive.on('error', fail);
  });
  archive.pipe(output);
  for (const entry of entries) archive.file(entry.path, { name: entry.name });
  try {
    await archive.finalize();
    await closed;
  } catch (error) {
    throw new HandoffError(
      step,
      `writing ${zipPath} failed: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (warnings.length > 0) throw new HandoffError(step, `writing ${zipPath} warned`, warnings);
}

/**
 * Reads the entry names back out of the written ZIP, from its central
 * directory. This is the second of the two checks: the first one looks at
 * the staging folder, this one at the file that will actually be handed
 * over. No zip reader dependency for it — the central directory is a flat
 * record list, and parsing it here beats trusting the writer's own account
 * of what it wrote.
 */
function readZipEntryNames(step, zipPath) {
  const fd = openSync(zipPath, 'r');
  try {
    const fill = (length, position) => {
      const buffer = Buffer.alloc(length);
      const read = readSync(fd, buffer, 0, length, position);
      if (read !== length) {
        throw new HandoffError(step, `${zipPath}: read ${read} of ${length} bytes at ${position}`);
      }
      return buffer;
    };
    const size = fstatSync(fd).size;
    /* The end-of-central-directory record is 22 bytes plus a comment of at
       most 65535 — so it always starts within the last ~64 KiB. */
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = fill(tailLength, size - tailLength);
    let eocd = -1;
    for (let at = tail.length - 22; at >= 0; at -= 1) {
      if (tail.readUInt32LE(at) === 0x06054b50) {
        eocd = at;
        break;
      }
    }
    if (eocd === -1) throw new HandoffError(step, `${zipPath}: no end-of-central-directory record`);
    const total = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (total === 0xffff || directoryOffset === 0xffffffff) {
      throw new HandoffError(step, `${zipPath}: zip64 archive, entry list not readable here`);
    }
    const directory = fill(directorySize, directoryOffset);
    const names = [];
    let at = 0;
    while (at + 46 <= directory.length) {
      if (directory.readUInt32LE(at) !== 0x02014b50) {
        throw new HandoffError(step, `${zipPath}: corrupt central directory at byte ${at}`);
      }
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      names.push(directory.toString('utf8', at + 46, at + 46 + nameLength));
      at += 46 + nameLength + extraLength + commentLength;
    }
    if (names.length !== total) {
      throw new HandoffError(
        step,
        `${zipPath}: central directory claims ${total} entries, ${names.length} readable`,
      );
    }
    return names;
  } finally {
    closeSync(fd);
  }
}

function raiseFindings(step, what, findings) {
  if (findings.length === 0) return;
  throw new HandoffError(step, `${what}: ${findings.length} finding(s)`, findings);
}

/* The version is threaded from exactly one place — package.json — into the
   exe name, the ZIP name, the README and both checks. */
const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const version = manifest.version;
const zipPath =
  typeof version === 'string' && version !== ''
    ? join(DIST_DIR, `${manifest.name}-${version}-windows.zip`)
    : null;

async function main() {
  if (zipPath === null) throw new HandoffError('version', 'package.json carries no version');
  /* From the same manifest electron-builder reads, so a renamed artifact
     cannot silently diverge from what gets staged and checked. */
  const exeName = render('version', manifest.build.portable.artifactName, { version, ext: 'exe' });
  const exePath = join(DIST_DIR, exeName);

  console.log(`Handoff package for ${manifest.build.productName} ${version}`);
  console.log('');

  runStep('verify', 'npm', ['run', 'verify']);
  note('verify', 'npm run verify green (format, lint, typecheck, tests, build)');

  /* A re-run replaces its predecessor instead of piling up next to it — and
     the exe of this exact version goes too, so what gets staged in step 5 can
     only be the one this run built. */
  const removed = [];
  rmSync(STAGE_DIR, { recursive: true, force: true });
  rmSync(exePath, { force: true });
  if (existsSync(DIST_DIR)) {
    for (const entry of readdirSync(DIST_DIR)) {
      if (!entry.startsWith(`${manifest.name}-`) || !entry.endsWith('-windows.zip')) continue;
      rmSync(join(DIST_DIR, entry), { force: true });
      removed.push(entry);
    }
  }
  note('clean', `staging folder and ${removed.length} previous ZIP(s) removed`);

  if (!existsSync(OUT_DIR)) throw new HandoffError('bundle-check', 'out/ does not exist');
  const bundleFiles = listFiles(OUT_DIR).map((file) => `out/${file}`);
  raiseFindings('bundle-check', 'out/', checkBundleContents(bundleFiles));
  note('bundle-check', `${bundleFiles.length} files under out/, no findings`);

  /* Not `npm run package`: that would compile a second time. The build from
     the verify run above is what gets packaged. */
  runStep('package', process.execPath, [locateElectronBuilder('package'), '--win', 'portable'], {
    shell: false,
  });
  if (!existsSync(exePath)) {
    throw new HandoffError('package', `electron-builder produced no ${exeName}`);
  }
  note('package', `${exeName} (${mib(exePath)})`);

  mkdirSync(STAGE_DIR, { recursive: true });
  copyFileSync(exePath, join(STAGE_DIR, exeName));
  const readme = render('stage', readFileSync(README_TEMPLATE, 'utf8'), {
    version,
    exe: exeName,
  });
  /* CRLF: the recipient opens this in Notepad, not in an editor of ours. */
  writeFileSync(join(STAGE_DIR, 'README.txt'), readme.replace(/\r?\n/g, '\r\n'), 'utf8');
  note('stage', `${exeName} and README.txt in dist/handoff`);

  const staged = listFiles(STAGE_DIR);
  raiseFindings('stage-check', 'staging folder', checkHandoffContents(staged, { version }));
  note('stage-check', `${staged.length} staged files, no findings`);

  await writeZip(
    'zip',
    zipPath,
    staged.map((name) => ({ name, path: join(STAGE_DIR, name) })),
  );
  note('zip', `${manifest.name}-${version}-windows.zip (${mib(zipPath)})`);

  const written = readZipEntryNames('zip-check', zipPath);
  raiseFindings('zip-check', 'written ZIP', checkHandoffContents(written, { version }));
  note('zip-check', `${written.length} entries read back from the archive, no findings`);

  console.log('');
  console.log(`Handoff ready: dist/${manifest.name}-${version}-windows.zip`);
  console.log(`Contents: ${written.join(', ')}`);
}

try {
  await main();
} catch (error) {
  const step = error instanceof HandoffError ? error.step : 'handoff';
  console.error('');
  console.error(
    `Handoff failed at step "${step}": ${error instanceof Error ? error.message : String(error)}`,
  );
  for (const detail of error instanceof HandoffError ? error.details : []) {
    console.error(`  - ${detail}`);
  }
  /* The message first, the cleanup second: a ZIP that cannot be removed must
     not cost the reason for the failure. Nothing shippable may survive. */
  let leftover = null;
  if (zipPath !== null && existsSync(zipPath)) {
    try {
      rmSync(zipPath, { force: true });
    } catch (removeError) {
      leftover = removeError instanceof Error ? removeError.message : String(removeError);
    }
  }
  console.error(
    leftover === null
      ? 'No ZIP was written — nothing to hand over from this run.'
      : `WARNING: ${zipPath} is still there and was NOT checked — remove it by hand (${leftover}).`,
  );
  process.exitCode = 1;
}
