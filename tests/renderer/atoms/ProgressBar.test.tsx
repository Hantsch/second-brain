// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from '@renderer/atoms/ProgressBar';

describe('ProgressBar', () => {
  it('renders value and accessible name', () => {
    render(<ProgressBar value={40} label="Indexing" fillClassName="fill" />);
    const bar = screen.getByRole('progressbar', { name: 'Indexing' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect((bar.querySelector('.fill') as HTMLElement).style.width).toBe('40%');
  });

  it('indeterminate omits aria-valuenow', () => {
    render(<ProgressBar value={null} label="Indexing" />);
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });
});
