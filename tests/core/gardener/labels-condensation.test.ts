/* Story 039, D3: die Saetze fuer "Verdichtung faellig"/"noch keine
 * Verdichtung" muessen die Area, `condensed_at` und die Zahl der geaenderten
 * Eingaenge nennen (deutsch), bzw. dieselben drei Dinge ohne U+201E
 * (englisch) — siehe die Deliverable-Beschreibung in
 * docs/requirements/039-maintenance-says-a-condensation-is-due.md.
 */

import { describe, expect, it } from 'vitest';
import { GERMAN_GARDENER_LABELS } from '@core/gardener';
import { ENGLISH_GARDENER_LABELS } from '../../../src/main/gardener-labels';

const AREA = 'Fitness';
const CONDENSED_AT = '2026-08-01T09:00:00+02:00';

describe('condensationDue / condensationMissing labels (story 039, D3)', () => {
  it('nennt auf Deutsch die Area, condensed_at und die Zahl geaenderter Eingaenge', () => {
    const text = GERMAN_GARDENER_LABELS.condensationDue(AREA, CONDENSED_AT, 3);

    expect(text.title).toContain(AREA);
    expect(`${text.title} ${text.detail}`).toContain(CONDENSED_AT);
    expect(text.detail).toContain('3');
  });

  it('behandelt Singular und Plural der geaenderten Eingaenge unterschiedlich', () => {
    const one = GERMAN_GARDENER_LABELS.condensationDue(AREA, CONDENSED_AT, 1);
    const many = GERMAN_GARDENER_LABELS.condensationDue(AREA, CONDENSED_AT, 2);

    expect(one.detail).not.toBe(many.detail);
  });

  it('nennt auf Deutsch bei fehlender Verdichtung nur die Area, kein condensed_at', () => {
    const text = GERMAN_GARDENER_LABELS.condensationMissing(AREA);

    expect(text.title).toContain(AREA);
    expect(`${text.title} ${text.detail}`).not.toContain(CONDENSED_AT);
  });

  it('nennt auf Englisch dieselben drei Dinge, ohne das deutsche Anfuehrungszeichen U+201E', () => {
    const text = ENGLISH_GARDENER_LABELS.condensationDue(AREA, CONDENSED_AT, 3);
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(AREA);
    expect(combined).toContain(CONDENSED_AT);
    expect(text.detail).toContain('3');
    expect(combined).not.toContain('„');
  });

  it('nennt auf Englisch bei fehlender Verdichtung die Area, ohne U+201E', () => {
    const text = ENGLISH_GARDENER_LABELS.condensationMissing(AREA);
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(AREA);
    expect(combined).not.toContain('„');
  });
});
