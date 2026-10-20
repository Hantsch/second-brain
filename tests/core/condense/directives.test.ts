/* Recording a rejection in the directives section (story 038, D3).

   The section belongs to the human, so the two ways this can go wrong are both
   silent: appending could rewrite something else in the file, or a reason typed
   into a free-text field could carry Markdown structure and change where the
   *next* run thinks the sections are. Both are asserted here on the raw output
   string, not on the parsed shape — a parse would happily agree with a file
   whose boundaries have already moved. */

import { describe, expect, it } from 'vitest';
import { appendDirective } from '@core/condense/directives';
import { composeCondensedArtifact, parseCondensedArtifact } from '@core/condense/artifact';

/** Any ATX heading line, whatever its spelling. */
const HEADING_LINE = /^ {0,3}#{1,6}\s+(.*)$/;

const RAW = [
  '---',
  'type: condensed',
  'title: Gesundheit',
  'custom_field: x',
  'condensed_at: 2026-08-10T09:15:00+02:00',
  'sources: [areas/gesundheit.md]',
  '---',
  '',
  '## Status',
  '',
  'Current state.',
  '',
  'From: areas/gesundheit.md',
  '',
  '## Patterns',
  '',
  '## Open',
  '',
  '## Directives',
  '',
  'First reason.',
  '',
  '## Custom',
  '',
  'Handwritten.',
  '',
].join('\n');

/** The fixture in the exact shape the composer writes, so `toBe` means something. */
const EXISTING = composeCondensedArtifact(parseCondensedArtifact(RAW), 'en');

function headings(content: string): string[] {
  return content
    .split('\n')
    .map((line) => HEADING_LINE.exec(line)?.[1] ?? null)
    .filter((heading): heading is string => heading !== null);
}

function linesOf(content: string, section: 'directives'): string[] {
  const text = parseCondensedArtifact(content)[section].content;
  return text.length === 0 ? [] : text.split('\n');
}

describe('appendDirective', () => {
  it('adds the reason as a new line and changes nothing else in the file', () => {
    const result = appendDirective(EXISTING, 'Second reason.', 'en');

    expect(result).toBe(EXISTING.replace('First reason.', 'First reason.\nSecond reason.'));
    // Spelled out, because the assertion above only bites while the fixture holds them.
    expect(result).toContain('custom_field: x');
    expect(result).toContain('Handwritten.');
    expect(linesOf(result, 'directives')).toEqual(['First reason.', 'Second reason.']);
  });

  it('keeps two rejections in the order they happened, oldest first', () => {
    const once = appendDirective(EXISTING, 'Second reason.', 'en');
    const twice = appendDirective(once, 'Third reason.', 'en');

    expect(linesOf(twice, 'directives')).toEqual([
      'First reason.',
      'Second reason.',
      'Third reason.',
    ]);
  });

  it('writes only the directives section when no artifact exists yet', () => {
    const result = appendDirective(null, 'Nothing was condensed here yet.', 'en');

    // Absent, not empty: an empty "## Status" would claim a state no run produced.
    expect(headings(result)).toEqual(['Directives']);
    expect(result).toContain('Nothing was condensed here yet.');
    expect(result).toContain('type: condensed');
    expect(result).not.toContain('condensed_at:');
    expect(result).not.toContain('sources:');
    expect(result).not.toContain('title:');
  });

  it('uses the document language for the heading of a file that has none yet', () => {
    expect(headings(appendDirective(null, 'Grund.', 'de'))).toEqual(['Direktiven']);
  });

  it('stores a reason with line breaks and a ## sequence as one single line', () => {
    const result = appendDirective(EXISTING, 'Too vague.\n## Status\n\nInjected.', 'en');

    expect(linesOf(result, 'directives')).toEqual([
      'First reason.',
      'Too vague. ## Status Injected.',
    ]);
    // The `##` sequence stayed inside the line: no new heading, and the file
    // still has exactly the sections it had before.
    expect(headings(result)).toEqual(headings(EXISTING));
    expect(parseCondensedArtifact(result).sections.state.text).toBe('Current state.');
  });

  it('escapes a reason that would otherwise become a heading of its own', () => {
    const result = appendDirective(EXISTING, '## Injected heading', 'en');

    expect(headings(result)).toEqual(headings(EXISTING));
    expect(linesOf(result, 'directives')).toEqual(['First reason.', '\\## Injected heading']);
  });

  it('escapes a reason that would otherwise open a code fence', () => {
    // An unclosed fence hides every heading after it, so the section below would
    // be swallowed into the directives on the next read.
    const result = appendDirective(EXISTING, '```js', 'en');

    expect(headings(result)).toEqual(headings(EXISTING));
    expect(parseCondensedArtifact(result).extraSections).toHaveLength(1);
  });

  it('leaves the file alone when the reason is blank once collapsed', () => {
    expect(appendDirective(EXISTING, '  \n  ', 'en')).toBe(EXISTING);
  });

  it('does not rewrite a German artifact into English when rejecting with the other language', () => {
    const rawDe = [
      '---',
      'type: condensed',
      'title: Gesundheit',
      'custom_field: x',
      'condensed_at: 2026-08-10T09:15:00+02:00',
      'sources: [areas/gesundheit.md]',
      '---',
      '',
      '## Stand',
      '',
      'Aktueller Stand.',
      '',
      'Aus: areas/gesundheit.md',
      '',
      '## Muster',
      '',
      '## Offen',
      '',
      '## Direktiven',
      '',
      'Erster Grund.',
      '',
      '## Custom',
      '',
      'Handwritten.',
      '',
    ].join('\n');
    const existingDe = composeCondensedArtifact(parseCondensedArtifact(rawDe), 'de');

    // Called with 'en' — the opposite of the artifact's own language — to
    // simulate a vault whose document-language setting differs from what a
    // careless recompose would default to.
    const result = appendDirective(existingDe, 'Zweiter Grund.', 'en');

    expect(result).toBe(existingDe.replace('Erster Grund.', 'Erster Grund.\nZweiter Grund.'));
    // Spelled out: every German heading and source line survives untouched,
    // and the directives heading keeps its own (German) spelling rather than
    // switching to "Directives".
    expect(result).toContain('## Stand');
    expect(result).toContain('## Muster');
    expect(result).toContain('## Offen');
    expect(result).toContain('## Direktiven');
    expect(result).toContain('Aus: areas/gesundheit.md');
    expect(result).toContain('custom_field: x');
    expect(result).toContain('Handwritten.');
    expect(result).not.toContain('## Status');
    expect(result).not.toContain('## Patterns');
    expect(result).not.toContain('## Open');
    expect(result).not.toContain('## Directives');
    expect(result).not.toContain('From:');
  });

  it('adds a directive when both the artifact and the call already agree on German', () => {
    const rawDe = [
      '---',
      'type: condensed',
      'title: Gesundheit',
      '---',
      '',
      '## Stand',
      '',
      'Aktueller Stand.',
      '',
      '## Muster',
      '',
      '## Offen',
      '',
      '## Direktiven',
      '',
      'Erster Grund.',
      '',
    ].join('\n');
    const existingDe = composeCondensedArtifact(parseCondensedArtifact(rawDe), 'de');

    const result = appendDirective(existingDe, 'Zweiter Grund.', 'de');

    expect(result).toBe(existingDe.replace('Erster Grund.', 'Erster Grund.\nZweiter Grund.'));
    expect(result).toContain('## Stand');
    expect(result).toContain('## Muster');
    expect(result).toContain('## Offen');
  });
});
