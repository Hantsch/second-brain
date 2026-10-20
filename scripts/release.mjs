#!/usr/bin/env node
/* Cuts a release from CHANGELOG.md's Unreleased section.

   Usage:
     npm run release -- --dry-run [--version <v> | --bump <level>]   build and check, change nothing
     npm run release -- [--if-pending]                               real run; CI=true only

   All logic lives in scripts/lib/release/; this entry only wires the real process, disk and
   clock into the runner. */

import { fileURLToPath } from 'node:url';
import { nodeExec, nodeFs, runRelease } from './lib/release/runner.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

try {
  process.exitCode = runRelease({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: REPO_ROOT,
    exec: nodeExec,
    fs: nodeFs,
    log: (line) => console.log(line),
    today: () => new Date().toISOString().slice(0, 10),
  });
} catch (error) {
  console.error(`release failed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
}
