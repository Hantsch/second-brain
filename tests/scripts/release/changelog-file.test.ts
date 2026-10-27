/* Reads the real CHANGELOG.md and .claude/ai-scrum.md: the files the release flow actually consumes. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseChangelog,
  readUnreleased,
  UNRELEASED_PLACEHOLDER,
  validateUnreleased,
} from '../../../scripts/lib/release/changelog.mjs';

const root = resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf8');

describe('changelog files', () => {
  // Whether Unreleased has entries depends on where the branch stands in the release cycle (it is
  // empty right after a release), so only the shape is asserted here, plus the released 0.2.0.
  it('CHANGELOG.md is Keep-a-Changelog shaped and 0.2.0 carries the first release entries', () => {
    const text = read('CHANGELOG.md');
    expect(text).toMatch(/^# Changelog\r?\n/);
    expect(text).toContain('keepachangelog.com');
    const [unreleased, ...released] = parseChangelog(text).sections;
    expect(unreleased?.heading).toBe('Unreleased');
    for (const section of released) {
      expect(section.heading).toMatch(/^\d+\.\d+\.\d+ — \d{4}-\d{2}-\d{2}$/);
    }
    const first = released.find((s) => s.heading.startsWith('0.2.0 —'));
    const added = first?.categories.find((c) => c.name === 'Added');
    expect(added?.bullets.length ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('Unreleased is either releasable or only the placeholder a release leaves behind', () => {
    const text = read('CHANGELOG.md');
    const { bullets } = readUnreleased(text);
    if (bullets.length > 0) expect(validateUnreleased(text)).toBeNull();
    else expect(text).toContain(UNRELEASED_PLACEHOLDER);
  });

  it('changelog-path in .claude/ai-scrum.md points at CHANGELOG.md', () => {
    expect(read('.claude/ai-scrum.md')).toMatch(/^changelog-path:\s*CHANGELOG\.md\s*$/m);
  });
});
