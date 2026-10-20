import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The real file, plus one released section so a version can be looked up without a real release.
vi.mock('../../CHANGELOG.md?raw', async (importOriginal) => ({
  default: `${(await importOriginal<{ default: string }>()).default}
## 9.9.9

- bundled entry
`,
}));

const { installedReleaseNotes } = await import('../../src/main/release-notes');

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function changelogFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sb-changelog-'));
  dirs.push(dir);
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, text);
  return file;
}

describe('installed release notes', () => {
  it('notes of a version come from the bundled text', () => {
    expect(installedReleaseNotes('9.9.9')).toEqual({
      version: '9.9.9',
      markdown: '- bundled entry',
    });
  });

  it('a version without a section yields null notes', () => {
    expect(installedReleaseNotes('1.2.3')).toEqual({ version: '1.2.3', markdown: null });
  });

  it('SB_E2E_CHANGELOG replaces the bundled text', () => {
    vi.stubEnv('SB_E2E_CHANGELOG', changelogFile('## 1.2.3\n\n- from the fixture\n'));
    expect(installedReleaseNotes('1.2.3').markdown).toBe('- from the fixture');
    expect(installedReleaseNotes('9.9.9').markdown).toBeNull();
  });

  it('an unreadable SB_E2E_CHANGELOG yields null notes, not a throw', () => {
    vi.stubEnv('SB_E2E_CHANGELOG', join(tmpdir(), 'sb-no-such-dir', 'CHANGELOG.md'));
    expect(installedReleaseNotes('9.9.9')).toEqual({ version: '9.9.9', markdown: null });
  });
});
