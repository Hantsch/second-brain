import { describe, expect, it } from 'vitest';

/* Vite inlines every renderer source as text, so this needs no filesystem access. */
const sources = import.meta.glob<string>('../../src/renderer/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('update boundary', () => {
  it('the renderer neither imports the updater nor compares versions', () => {
    const entries = Object.entries(sources);
    expect(entries.length).toBeGreaterThan(0);
    for (const [file, text] of entries) {
      expect(text, file).not.toMatch(/from\s+['"](electron-updater|semver)['"]/);
      expect(text, file).not.toMatch(
        /\b(compareVersions?|semverGt|isNewerVersion|versionGreater)\b/,
      );
    }
  });
});
