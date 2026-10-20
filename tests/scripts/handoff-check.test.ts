/* Covers the check from scripts/lib/handoff-check.mjs — see the rationale
   there. Pure functions over path lists, so no fs fixtures are needed: the
   paths themselves are the fixtures. */

import { describe, expect, it } from 'vitest';
import { checkBundleContents, checkHandoffContents } from '../../scripts/lib/handoff-check.mjs';

const VERSION = '0.4.0';
const EXE = `gaston-${VERSION}-portable.exe`;
const README = 'README.txt';

/* Every forbidden pattern from handoff-check.mjs, each with a deeply nested
   path that contains it — the rule here is "anywhere in the path", not just
   as a full file name. */
const FORBIDDEN_CASES: Array<[pattern: string, path: string]> = [
  ['.env', 'foo/.env'],
  ['.secondbrain', 'foo/.secondbrain/vault.json'],
  ['.demo-vault', '.demo-vault/README.md'],
  ['.screenshots', 'sub/.screenshots/shot.png'],
  ['node_modules', 'sub/dir/node_modules/pkg/index.js'],
  ['*.key', 'certs/foo.key'],
  ['settings.json', 'sub/dir/settings.json'],
];

describe('checkHandoffContents', () => {
  it('reports nothing for exactly the expected two files', () => {
    expect(checkHandoffContents([EXE, README], { version: VERSION })).toEqual([]);
  });

  it('flags an extra unexpected file', () => {
    const findings = checkHandoffContents([EXE, README, 'notes.txt'], { version: VERSION });
    expect(findings.some((finding) => finding.includes('notes.txt'))).toBe(true);
  });

  it('flags a missing expected file', () => {
    const findings = checkHandoffContents([EXE], { version: VERSION });
    expect(findings.some((finding) => finding.includes(README))).toBe(true);
  });

  it('flags a wrong version in the exe name', () => {
    const findings = checkHandoffContents(['gaston-0.0.1-portable.exe', README], {
      version: VERSION,
    });
    expect(findings.some((finding) => finding.includes('0.0.1'))).toBe(true);
  });

  it.each(FORBIDDEN_CASES)('flags forbidden pattern %s in a nested path', (_pattern, path) => {
    const findings = checkHandoffContents([EXE, README, path], { version: VERSION });
    expect(findings.some((finding) => finding.includes(path))).toBe(true);
  });
});

describe('checkBundleContents', () => {
  it('reports nothing for a clean out/** file list', () => {
    expect(
      checkBundleContents(['out/main/index.cjs', 'out/renderer/index.html', 'package.json']),
    ).toEqual([]);
  });

  it('does not expect the exe/README shape at all', () => {
    expect(checkBundleContents(['out/main/index.cjs'])).toEqual([]);
  });

  it.each(FORBIDDEN_CASES)(
    'flags forbidden pattern %s anywhere in the path list',
    (_pattern, path) => {
      const findings = checkBundleContents(['out/main/index.cjs', path]);
      expect(findings.some((finding) => finding.includes(path))).toBe(true);
    },
  );
});
