// @vitest-environment jsdom
/* The condensation diff view (story 038, deliverable D7).
 *
 * The prüfsteine of this deliverable:
 *
 * - A proposal that only deletes still renders a visibly non-empty diff:
 *   the removed rows and the count line are the visible content, nothing
 *   is hidden because there happen to be zero added rows.
 * - A mixed proposal shows both kinds with distinguishable markers — the
 *   assertion is on the marker glyph, not on colour, since colour-blind
 *   users must be able to tell rows apart without it.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DiffRow } from '@core/condense/diff';
import { CondenseDiff } from '@renderer/components/CondenseDiff';
import { setLanguage } from '@renderer/i18n';

describe('CondenseDiff (Story 038, D7)', () => {
  it('zeigt bei einem reinen Löschvorschlag sichtbare entfernte Zeilen und die Zählung', () => {
    setLanguage('de');
    const rows: DiffRow[] = [
      { kind: 'removed', text: 'Alte Zeile eins.', beforeLine: 1 },
      { kind: 'removed', text: 'Alte Zeile zwei.', beforeLine: 2 },
    ];
    render(<CondenseDiff rows={rows} />);

    expect(screen.getByText('Alte Zeile eins.')).toBeTruthy();
    expect(screen.getByText('Alte Zeile zwei.')).toBeTruthy();
    expect(screen.getByText('2 entfernt, 0 hinzugefügt')).toBeTruthy();
  });

  it('unterscheidet hinzugefügte und entfernte Zeilen über das Markersymbol, nicht nur über Farbe', () => {
    setLanguage('de');
    const rows: DiffRow[] = [
      { kind: 'context', text: 'Unveränderte Zeile.', beforeLine: 1, afterLine: 1 },
      { kind: 'removed', text: 'Entfernte Zeile.', beforeLine: 2 },
      { kind: 'added', text: 'Neue Zeile.', afterLine: 2 },
    ];
    const { container } = render(<CondenseDiff rows={rows} />);

    expect(screen.getByText('1 entfernt, 1 hinzugefügt')).toBeTruthy();

    const removedRow = container.querySelector('.sb-condensediff-row--removed');
    const addedRow = container.querySelector('.sb-condensediff-row--added');
    const contextRow = container.querySelector('.sb-condensediff-row--context');
    expect(removedRow).toBeTruthy();
    expect(addedRow).toBeTruthy();
    expect(contextRow).toBeTruthy();

    /* Distinguishable via the marker glyph (an SVG icon), not only the class
       name — the row class alone would be colour information by proxy if the
       only visual difference were background colour. */
    expect(removedRow?.querySelector('svg')).toBeTruthy();
    expect(addedRow?.querySelector('svg')).toBeTruthy();
    expect(contextRow?.querySelector('svg')).toBeNull();
  });

  it('gibt hinzugefügten und entfernten Markern ein unterscheidbares Accessible-Label', () => {
    setLanguage('de');
    const rows: DiffRow[] = [
      { kind: 'removed', text: 'Entfernte Zeile.', beforeLine: 1 },
      { kind: 'added', text: 'Neue Zeile.', afterLine: 1 },
    ];
    const { container } = render(<CondenseDiff rows={rows} />);

    const removedIcon = container.querySelector('.sb-condensediff-row--removed svg');
    const addedIcon = container.querySelector('.sb-condensediff-row--added svg');

    expect(removedIcon?.getAttribute('aria-label')).toBe('entfernt');
    expect(addedIcon?.getAttribute('aria-label')).toBe('hinzugefügt');
  });
});
