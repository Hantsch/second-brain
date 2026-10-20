/* Reads the real CHANGELOG.md and .claude/ai-scrum.md: the files the release flow actually consumes. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readUnreleased, validateUnreleased } from '../../../scripts/lib/release/changelog.mjs';

const root = resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf8');

describe('changelog files', () => {
  it("CHANGELOG.md is Keep-a-Changelog shaped and Unreleased carries the first release's entries", () => {
    const text = read('CHANGELOG.md');
    expect(text).toMatch(/^# Changelog\r?\n/);
    expect(text).toContain('keepachangelog.com');
    expect(validateUnreleased(text)).toBeNull();
    const { categories, bullets } = readUnreleased(text);
    expect(categories).toContain('Added');
    expect(bullets.length).toBeGreaterThanOrEqual(10);
  });

  it('changelog-path in .claude/ai-scrum.md points at CHANGELOG.md', () => {
    expect(read('.claude/ai-scrum.md')).toMatch(/^changelog-path:\s*CHANGELOG\.md\s*$/m);
  });
});
