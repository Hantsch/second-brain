import { describe, expect, it } from 'vitest';
import { extractVersionSection, htmlReleaseNotesToMarkdown } from '@core/release/release-notes';

const CHANGELOG = `# Changelog

## Unreleased

- Work in progress

## [1.2.3] - 2026-10-20

### Added
- Thing one

## 1.2.2

- Older fix
`;

describe('extractVersionSection', () => {
  it('picks one version’s section without bleeding into the next', () => {
    const section = extractVersionSection(CHANGELOG, '1.2.3');
    expect(section).toContain('Thing one');
    expect(section).not.toContain('Older fix');
    expect(extractVersionSection(CHANGELOG, '1.2.2')).toBe('- Older fix');
  });

  it('returns null for an unknown version and for Unreleased', () => {
    expect(extractVersionSection(CHANGELOG, '9.9.9')).toBeNull();
    expect(extractVersionSection(CHANGELOG, 'Unreleased')).toBeNull();
    expect(extractVersionSection('## 1.0.0\n\n## 0.9.0\n- x', '1.0.0')).toBeNull();
  });
});

describe('htmlReleaseNotesToMarkdown', () => {
  it('maps GitHub release HTML to headings and list items', () => {
    const md = htmlReleaseNotesToMarkdown(
      '<h2>Fixes</h2><ul><li>A &amp; B</li><li>C</li></ul><p>Done<br>now</p>',
    );
    expect(md).toContain('### Fixes');
    expect(md).toContain('- A & B');
    expect(md).toContain('- C');
    expect(md).toContain('Done\nnow');
    expect(htmlReleaseNotesToMarkdown('- plain\n- markdown')).toBe('- plain\n- markdown');
  });

  it('keeps markdown autolinks instead of stripping them as tags', () => {
    expect(htmlReleaseNotesToMarkdown('- see <https://example.com/x>')).toBe(
      '- see <https://example.com/x>',
    );
  });

  it('keeps raw script and img markup out of the converted text as tags', () => {
    const md = htmlReleaseNotesToMarkdown(
      '<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>',
    );
    expect(md).not.toMatch(/<\s*(script|img)/i);
    expect(md).toContain('Hi');
  });

  it('caps oversized input without throwing', () => {
    const huge = '<li>x</li>'.repeat(100_000);
    expect(() => htmlReleaseNotesToMarkdown(huge)).not.toThrow();
    expect(htmlReleaseNotesToMarkdown(huge).length).toBeLessThanOrEqual(20_000);
    expect(extractVersionSection('x'.repeat(200_000), '1.0.0')).toBeNull();
  });
});
