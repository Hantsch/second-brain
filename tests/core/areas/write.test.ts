/* Pure write-side helpers for areas. Two of the three functions delegate to the
   filing path (`filingBlock`, `removeBlock`) rather than reimplement it — the
   tests assert that delegation literally, not just that the shape looks right. */

import { describe, expect, it } from 'vitest';
import { areaNoteBlock, moveNoteBlock, newAreaDocument } from '@core/areas';
import { filingBlock, removeBlock } from '@core/capture';

const FIXED_DATE = new Date(2026, 7, 18); // 2026-08-18, local time — matches isoDay's rules.

describe('newAreaDocument', () => {
  it('builds frontmatter and empty sections for a German area', () => {
    const doc = newAreaDocument('Haus', 'de', FIXED_DATE);

    expect(doc.path).toBe('areas/haus.md');
    expect(doc.content.startsWith('---\n')).toBe(true);
    expect(doc.content).toContain('type: area');
    expect(doc.content).toContain('title: Haus');
    expect(doc.content).toContain('scope: private');
    expect(doc.content).toContain('lang: de');
    expect(doc.content).toContain('## Notizen');
    expect(doc.content).toContain('## Todos');

    // Both sections are empty: no stray placeholder text under either heading.
    const afterNotes = doc.content.slice(doc.content.indexOf('## Notizen') + '## Notizen'.length);
    const betweenHeadings = afterNotes.slice(0, afterNotes.indexOf('## Todos'));
    expect(betweenHeadings.trim()).toBe('');
    const afterTodos = doc.content.slice(doc.content.indexOf('## Todos') + '## Todos'.length);
    expect(afterTodos.trim()).toBe('');
  });

  it('slugifies the path via areaPath, transliterating and dropping punctuation', () => {
    const doc = newAreaDocument('Home Projects!', 'en', FIXED_DATE);

    expect(doc.path).toBe('areas/home-projects.md');
    expect(doc.content).toContain('title: Home Projects!');
    expect(doc.content).toContain('## Notes');
    expect(doc.content).toContain('## Todos');
  });

  it('is deterministic given a fixed now', () => {
    const first = newAreaDocument('Garten', 'de', FIXED_DATE);
    const second = newAreaDocument('Garten', 'de', FIXED_DATE);

    expect(first.content).toBe(second.content);
    expect(first.content).toContain('created: 2026-08-18');
  });
});

describe('areaNoteBlock', () => {
  it('is byte-identical to filingBlock for the same content and date', () => {
    expect(areaNoteBlock('Some text', FIXED_DATE)).toBe(filingBlock('Some text', FIXED_DATE));
  });

  it('defaults the date the same way filingBlock does', () => {
    // Both leave `at` to its own default (`new Date()`); freezing time isn't
    // needed here — the point is that neither call is passed an explicit date,
    // so they exercise the exact same default path and must still agree.
    const now = new Date();
    expect(areaNoteBlock('No explicit date', now)).toBe(filingBlock('No explicit date', now));
  });
});

describe('moveNoteBlock', () => {
  it('removes exactly the one block and leaves the rest of the body untouched', () => {
    const block = filingBlock('Went for a walk.', FIXED_DATE);
    const body = ['## Notizen', '', 'Before.', '', block, '', 'After.', ''].join('\n');

    const result = moveNoteBlock(body, block);

    expect(result).not.toBeNull();
    expect(result).toBe(moveNoteBlockExpectation(body, block));
    expect(result).toContain('Before.');
    expect(result).toContain('After.');
    expect(result).not.toContain(block);
  });

  it('mirrors removeBlock exactly for the same inputs', () => {
    const block = filingBlock('Went for a walk.', FIXED_DATE);
    const body = ['## Notizen', '', 'Before.', '', block, '', 'After.', ''].join('\n');

    expect(moveNoteBlock(body, block)).toBe(removeBlock(body, block));
  });

  it('returns null without throwing when the block was hand-edited and no longer matches', () => {
    const block = filingBlock('Went for a walk.', FIXED_DATE);
    const body = ['## Notizen', '', 'Something else entirely.', ''].join('\n');

    expect(() => moveNoteBlock(body, block)).not.toThrow();
    expect(moveNoteBlock(body, block)).toBeNull();
  });
});

function moveNoteBlockExpectation(body: string, block: string): string | null {
  return removeBlock(body, block);
}
