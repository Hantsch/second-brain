/* 058, D-n / AC6: ARCHITECTURE.md's tray section drifted once already — this test
   is what keeps it from drifting again. It reads the doc's own text, extracts the
   file paths and setting names it claims, and checks them against the real
   filesystem and the real settings type, so a rename or a moved file fails here
   instead of silently going stale in prose nobody re-reads. */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const DOC_PATH = join(REPO_ROOT, 'docs', 'ARCHITECTURE.md');

/** The section this story added, isolated from the rest of the doc so a path
    named elsewhere in ARCHITECTURE.md can't paper over a drifted tray section. */
function traySection(): string {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const match = /## Window, tray and quit\n([\s\S]*?)\n## /.exec(doc);
  expect(match, 'ARCHITECTURE.md must have a "## Window, tray and quit" section').not.toBeNull();
  // The capture group always participates when the regex matches at all, so
  // this is safe despite noUncheckedIndexedAccess typing it as optional.
  return match![1]!;
}

/** Every inline-code span that looks like a repo-relative source path, pulled
    out programmatically so a future edit that adds or drops a path is covered
    without anyone updating this test by hand. */
function namedSourcePaths(section: string): string[] {
  const matches = [...section.matchAll(/`(src\/[\w./-]+\.tsx?)`/g)];
  // Same as above: the capture group always participates on a match.
  return matches.map((m) => m[1]!);
}

describe('ARCHITECTURE.md describes the tray lifecycle src/main actually wires', () => {
  it('names files that exist on disk', () => {
    const paths = namedSourcePaths(traySection());
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(existsSync(join(REPO_ROOT, path)), path).toBe(true);
    }
  });

  it('names both tray settings, and both are real settings keys', () => {
    const section = traySection();
    expect(section).toContain('closeToTray');
    expect(section).toContain('startMinimized');

    const settingsType = readFileSync(
      join(REPO_ROOT, 'src', 'shared', 'types', 'settings.ts'),
      'utf8',
    );
    expect(settingsType).toContain('closeToTray');
    expect(settingsType).toContain('startMinimized');

    const defaults = readFileSync(join(REPO_ROOT, 'src', 'main', 'settings-defaults.ts'), 'utf8');
    expect(defaults).toContain('closeToTray');
    expect(defaults).toContain('startMinimized');
  });

  it('names where the M13 close-during-run prompt fires', () => {
    const section = traySection();
    expect(section).toMatch(/close-guard\.ts/);
    expect(section).toMatch(/QuitDuringRunDialog/);
    // Covered again via namedSourcePaths' existsSync check, but asserted here
    // directly too: a drift that keeps the file but drops the sentence linking
    // it to the M13 prompt would otherwise pass silently.
    expect(existsSync(join(REPO_ROOT, 'src', 'main', 'close-guard.ts'))).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, 'src', 'renderer', 'components', 'QuitDuringRunDialog.tsx')),
    ).toBe(true);
  });
});
