/* Every BrowserWindow takes the verification-run flags from one place
   (src/main/window-shared.ts). The window that forgot is the one that pops up
   on the developer's desktop during a run — and quick capture is always on top,
   so it would cover everything. This reads the sources instead of launching
   anything, so a new window that skips the module fails on `npm test`. */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAIN_DIR = join(import.meta.dirname, '..', '..', 'src', 'main');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const windowFiles = sourceFiles(MAIN_DIR).filter((file) =>
  /new BrowserWindow\(/.test(readFileSync(file, 'utf8')),
);

describe('every BrowserWindow uses the shared harness flags', () => {
  it('finds the windows it guards', () => {
    expect(windowFiles.length).toBeGreaterThanOrEqual(2);
  });

  it.each(windowFiles.map((file) => relative(MAIN_DIR, file)))('%s', (name) => {
    const source = readFileSync(join(MAIN_DIR, name), 'utf8');
    expect(source, 'must import from ./window-shared').toMatch(/from '\.\/window-shared'/);
    expect(source, 'must spread harnessWindowOptions()').toMatch(/\.\.\.harnessWindowOptions\(\)/);
    expect(source, 'must use rendererWebPreferences()').toMatch(
      /webPreferences: rendererWebPreferences\(\)/,
    );
  });
});
