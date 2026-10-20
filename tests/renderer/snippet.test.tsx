// @vitest-environment jsdom
/* Story 059, D5: `Snippet` turns `makeSnippet`'s `**term**` markers
 * (`src/core/index/snippet.ts`) into real `<strong>` elements — a small,
 * purpose-built parser, not a Markdown renderer, since a snippet only ever
 * carries this one marker. The design decision this test guards: the mark
 * must never carry the teal accent class/token, which belongs to the one
 * focal point per screen (the active roving row), not to every matched word
 * in every row.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Snippet } from '@renderer/components/Snippet';

describe('Snippet', () => {
  it('renders marked terms as <strong>, plain text around them unchanged', () => {
    render(<Snippet text="vor **Mitternacht** ins Bett wirkt mehr." />);
    const mark = screen.getByText('Mitternacht');
    expect(mark.tagName).toBe('STRONG');
    expect(screen.getByText(/vor/)).toBeTruthy();
    expect(screen.getByText(/ins Bett wirkt mehr\./)).toBeTruthy();
  });

  it('never gives the mark the teal accent class', () => {
    render(<Snippet text="**Schlafprotokoll** zwei Wochen." />);
    const mark = screen.getByText('Schlafprotokoll');
    expect(mark.className).not.toMatch(/accent/i);
  });

  it('renders plain text unchanged when nothing is marked', () => {
    render(<Snippet text="Kein Treffer in diesem Text." />);
    expect(screen.getByText('Kein Treffer in diesem Text.')).toBeTruthy();
  });

  it('handles more than one marked term', () => {
    render(<Snippet text="**eins** und **zwei** stehen beide." />);
    expect(screen.getByText('eins').tagName).toBe('STRONG');
    expect(screen.getByText('zwei').tagName).toBe('STRONG');
  });
});
