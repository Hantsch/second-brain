// Shared by the release runner and the handoff packager so both launch the same CLI.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

/** The electron-builder CLI, resolved through its own manifest rather than a guessed path. */
export function electronBuilderCli() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('electron-builder/package.json');
  const bin = JSON.parse(readFileSync(manifestPath, 'utf8')).bin?.['electron-builder'];
  if (typeof bin !== 'string') throw new Error('its manifest declares no electron-builder bin');
  return resolve(dirname(manifestPath), bin);
}
