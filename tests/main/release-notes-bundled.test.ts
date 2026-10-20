import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLED_CHANGELOG } from '../../src/main/release-notes';

describe('bundled changelog', () => {
  it("is the repository's CHANGELOG.md byte for byte", () => {
    const onDisk = readFileSync(join(__dirname, '../../CHANGELOG.md'), 'utf8');
    expect(BUNDLED_CHANGELOG).toBe(onDisk);
    expect(BUNDLED_CHANGELOG).toContain('## Unreleased');
  });
});
