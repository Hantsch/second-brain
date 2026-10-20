/* Covers scripts/lib/release/changelog.mjs: pure text in, text/data out. */

import { describe, expect, it } from 'vitest';
import {
  notesFor,
  parseChangelog,
  promote,
  readUnreleased,
  validateUnreleased,
} from '../../../scripts/lib/release/changelog.mjs';

const FILLED = `# Changelog

## Unreleased

### Added

- First thing
- Wrapped bullet
  continues here

### Fixed

- A bug

## 0.4.0 — 2026-01-01

### Added

- Old thing
`;

describe('readUnreleased', () => {
  it('lists categories and bullets, keeping wrapped bullets whole', () => {
    const { categories, bullets } = readUnreleased(FILLED);
    expect(categories).toEqual(['Added', 'Fixed']);
    expect(bullets).toEqual(['First thing', 'Wrapped bullet\n  continues here', 'A bug']);
  });

  it('reads CRLF text the same as LF text', () => {
    expect(readUnreleased(FILLED.replace(/\n/g, '\r\n'))).toEqual(readUnreleased(FILLED));
  });
});

describe('validateUnreleased', () => {
  it('accepts an Unreleased with at least one bullet', () => {
    expect(validateUnreleased(FILLED)).toBeNull();
  });

  it('a comment-only or bullet-less Unreleased is invalid', () => {
    const empty = '# Changelog\n\n## Unreleased\n\n## 0.4.0 — 2026-01-01\n\n- x\n';
    const comment = '# Changelog\n\n## Unreleased\n\n<!-- nothing yet -->\n';
    const noBullet = '# Changelog\n\n## Unreleased\n\n### Added\n\nsome prose\n';
    for (const text of [empty, comment, noBullet]) {
      expect(validateUnreleased(text)).toEqual(expect.any(String));
    }
  });

  it('refuses a changelog without an Unreleased section', () => {
    expect(validateUnreleased('# Changelog\n\n## 0.4.0 — 2026-01-01\n')).toMatch(/Unreleased/);
  });
});

describe('promote', () => {
  it('promote leaves Unreleased empty and inserts the dated section below it', () => {
    const out = promote(FILLED, '0.5.0', '2026-02-02');
    expect(readUnreleased(out).bullets).toEqual([]);
    expect(validateUnreleased(out)).toEqual(expect.any(String));
    const headings = parseChangelog(out).sections.map((s) => s.heading);
    expect(headings).toEqual(['Unreleased', '0.5.0 — 2026-02-02', '0.4.0 — 2026-01-01']);
    expect(notesFor(out, '0.5.0')).toContain('Wrapped bullet\n  continues here');
    expect(notesFor(out, '0.4.0')).toContain('Old thing');
  });

  it('keeps the preamble and ends with a single newline', () => {
    const out = promote(FILLED, '0.5.0', '2026-02-02');
    expect(out.startsWith('# Changelog\n\n## Unreleased\n')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('refuses when there is no Unreleased section', () => {
    expect(() => promote('# Changelog\n', '1.0.0', '2026-01-01')).toThrow(/Unreleased/);
  });
});

describe('notesFor', () => {
  it('returns the section body without its heading', () => {
    expect(notesFor(FILLED, '0.4.0')).toBe('### Added\n\n- Old thing\n');
  });

  it('throws for a version that has no section', () => {
    expect(() => notesFor(FILLED, '9.9.9')).toThrow(/9\.9\.9/);
  });
});
