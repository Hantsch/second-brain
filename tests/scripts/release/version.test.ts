/* Covers scripts/lib/release/version.mjs: pure semver helpers. */

import { describe, expect, it } from 'vitest';
import {
  applyVersion,
  deriveBump,
  isPrerelease,
  isValidVersion,
  nextVersion,
} from '../../../scripts/lib/release/version.mjs';

describe('deriveBump', () => {
  it('the bump follows the changelog categories', () => {
    expect(deriveBump(['Fixed', 'Security'], ['a'])).toBe('patch');
    expect(deriveBump(['Fixed', 'Added'], ['a'])).toBe('minor');
    expect(deriveBump(['Changed'], ['a'])).toBe('minor');
    expect(deriveBump(['Added', 'Removed'], ['a'])).toBe('major');
    expect(deriveBump(['Changed'], ['**BREAKING** drops the old format'])).toBe('major');
  });
});

describe('nextVersion', () => {
  it('applies the bump to a stable version', () => {
    expect(nextVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('only ticks the counter on a prerelease when the bump is derived', () => {
    expect(nextVersion('1.0.0-beta.1', 'major')).toBe('1.0.0-beta.2');
  });

  it('cuts a stable release when the bump is explicit', () => {
    expect(nextVersion('1.0.0-beta.1', 'major', { explicit: true })).toBe('2.0.0');
  });

  it('rejects an invalid current version', () => {
    expect(() => nextVersion('nope', 'patch')).toThrow(/valid/);
  });
});

describe('isValidVersion / isPrerelease', () => {
  it('classifies versions', () => {
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('1.0.0-beta.1')).toBe(true);
    expect(isValidVersion('v1.0.0')).toBe(false);
    expect(isValidVersion('1.0')).toBe(false);
    expect(isPrerelease('1.0.0-beta.1')).toBe(true);
    expect(isPrerelease('1.0.0')).toBe(false);
    expect(isPrerelease('junk')).toBe(false);
  });
});

describe('applyVersion', () => {
  const pkg = [
    '{',
    '  "name": "gaston",',
    '  "version": "0.4.0",',
    '  "dependencies": {',
    '    "x": "1.0.0"',
    '  }',
    '}',
    '',
  ].join('\n');
  const lock = [
    '{',
    '  "name": "gaston",',
    '  "version": "0.4.0",',
    '  "lockfileVersion": 3,',
    '  "packages": {',
    '    "": {',
    '      "name": "gaston",',
    '      "version": "0.4.0",',
    '      "dependencies": {',
    '        "x": "1.0.0"',
    '      }',
    '    },',
    '    "node_modules/x": {',
    '      "version": "0.4.0"',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');

  it('changes only the project versions and keeps the formatting', () => {
    const out = applyVersion(pkg, lock, '0.5.0');
    expect(out.pkgText).toBe(pkg.replace('0.4.0', '0.5.0'));
    const expectedLock = lock
      .replace('  "version": "0.4.0",\n  "lockfileVersion"', '  "version": "0.5.0",\n  "lockfileVersion"')
      .replace('      "version": "0.4.0",\n      "dependencies"', '      "version": "0.5.0",\n      "dependencies"');
    expect(out.lockText).toBe(expectedLock);
    expect(out.lockText).toContain('"node_modules/x": {\n      "version": "0.4.0"');
  });

  it('preserves CRLF line endings', () => {
    const out = applyVersion(pkg.replace(/\n/g, '\r\n'), lock.replace(/\n/g, '\r\n'), '0.5.0');
    expect(out.pkgText).toContain('"version": "0.5.0",\r\n');
    expect(out.lockText).toContain('"version": "0.5.0",\r\n  "lockfileVersion"');
  });

  it('throws when package.json has no version', () => {
    expect(() => applyVersion('{}', lock, '1.0.0')).toThrow(/version/);
  });
});
