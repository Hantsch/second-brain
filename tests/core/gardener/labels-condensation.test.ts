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

/* Story 046, D1: dasselbe Satzpaar traegt jetzt auch den Projekt-Arm. Ein
 * Einheitenwort statt eines zweiten Satzpaars — gepruefte Folge davon ist, dass
 * ein Projektsatz vom Projekt spricht und nicht von einer Area.
 */
describe('condensationDue / condensationMissing fuer Projekte (story 046, D1)', () => {
  const PROJECT = 'Nyota';

  it('nennt auf Deutsch das Projekt, condensed_at und die Zahl geaenderter Eingaenge', () => {
    const text = GERMAN_GARDENER_LABELS.condensationDue(PROJECT, CONDENSED_AT, 3, 'project');
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(PROJECT);
    expect(text.title).toContain('Projekt');
    expect(combined).toContain(CONDENSED_AT);
    expect(text.detail).toContain('3');
    // Deutsche Konvention: „…“ statt eines geraden Schlusszeichens.
    expect(combined).toContain('„');
    expect(combined).toContain('“');
    expect(combined).not.toMatch(/["”]/);
  });

  it('spricht auf Deutsch bei fehlender Verdichtung vom Projekt, nicht von einer Area', () => {
    const text = GERMAN_GARDENER_LABELS.condensationMissing(PROJECT, 'project');
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(PROJECT);
    expect(combined).toContain('Projekt');
    expect(combined).not.toContain('Area');
    expect(combined).not.toContain(CONDENSED_AT);
    expect(combined).not.toMatch(/["”]/);
  });

  it('nennt auf Englisch dieselben drei Dinge, ohne U+201E', () => {
    const text = ENGLISH_GARDENER_LABELS.condensationDue(PROJECT, CONDENSED_AT, 3, 'project');
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(PROJECT);
    expect(text.title).toContain('project');
    expect(combined).toContain(CONDENSED_AT);
    expect(text.detail).toContain('3');
    expect(combined).not.toContain('„');
  });

  it('spricht auf Englisch bei fehlender Verdichtung vom Projekt, ohne U+201E', () => {
    const text = ENGLISH_GARDENER_LABELS.condensationMissing(PROJECT, 'project');
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(PROJECT);
    expect(combined).toContain('project');
    expect(combined).not.toContain('area');
    expect(combined).not.toContain('„');
  });

  it('bleibt ohne Einheit bei der Area — der Vorgabe aus story 039', () => {
    expect(GERMAN_GARDENER_LABELS.condensationMissing(AREA)).toEqual(
      GERMAN_GARDENER_LABELS.condensationMissing(AREA, 'area'),
    );
    expect(ENGLISH_GARDENER_LABELS.condensationDue(AREA, CONDENSED_AT, 2)).toEqual(
      ENGLISH_GARDENER_LABELS.condensationDue(AREA, CONDENSED_AT, 2, 'area'),
    );
  });
});

/* The module level reuses the same sentence pair with a third unit word. */
describe('condensationDue / condensationMissing for modules', () => {
  const MODULE = 'identity-management';

  it('names the module, condensed_at and the changed count in German, with low-high quotes', () => {
    const text = GERMAN_GARDENER_LABELS.condensationDue(MODULE, CONDENSED_AT, 3, 'module');
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(`Modul „${MODULE}“`);
    expect(combined).toContain(CONDENSED_AT);
    expect(text.detail).toContain('3');
    expect(combined).not.toMatch(/["”]/);
    expect(combined).not.toContain('Area');
  });

  it('speaks of the module, not of an area or project, when no condensation exists in German', () => {
    const text = GERMAN_GARDENER_LABELS.condensationMissing(MODULE, 'module');
    const combined = `${text.title} ${text.detail}`;

    expect(text.title).toContain(`Modul „${MODULE}“`);
    expect(text.detail).toContain('dieses Modul');
    expect(combined).not.toContain(CONDENSED_AT);
    expect(combined).not.toMatch(/Area|Projekt|["”]/);
  });

  it('names the same things in English without U+201E', () => {
    const due = ENGLISH_GARDENER_LABELS.condensationDue(MODULE, CONDENSED_AT, 3, 'module');
    const missing = ENGLISH_GARDENER_LABELS.condensationMissing(MODULE, 'module');
    const combined = `${due.title} ${due.detail} ${missing.title} ${missing.detail}`;

    expect(due.title).toContain(`module "${MODULE}"`);
    expect(due.detail).toContain(CONDENSED_AT);
    expect(due.detail).toContain('3');
    expect(missing.detail).toContain('module');
    expect(combined).not.toContain('„');
    expect(combined).not.toMatch(/area|project/);
  });
});
