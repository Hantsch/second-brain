/* `promptClampNotice()` (Story 050, D6) ist aus `projectTruncationNotice()`
 * herausgezogen — beide teilen sich jetzt denselben Satz für "wegen des
 * Eingabe-Budgets gekürzt". Der Vertrag dabei ist hart: `projectTruncationNotice`
 * darf sich durch den Umbau kein Byte anders verhalten. Dieser Test haelt den
 * Wortlaut von vor dem Umbau fest, statt ihn nur "irgendwie unveraendert" zu
 * behaupten. */

import { describe, expect, it } from 'vitest';
import { projectTruncationNotice, promptClampNotice, TRUNCATION_MARKER } from '@core/condense';
import type { CondenseProjectTruncationReport } from '@core/condense';

describe('promptClampNotice', () => {
  it('ist leer, wenn nichts gekuerzt wurde', () => {
    expect(promptClampNotice(0, 'de')).toBe('');
    expect(promptClampNotice(-5, 'de')).toBe('');
  });

  it('nennt Marker und Zeichenzahl, wortwoertlich wie zuvor in projectTruncationNotice', () => {
    expect(promptClampNotice(120, 'de')).toBe(
      `${TRUNCATION_MARKER} Diese Verdichtung hat nicht alle verfügbaren Eingaben gelesen: ` +
        '120 Zeichen beim Einreichen ans Modell gekürzt, um dessen Eingabe-Budget einzuhalten blieben außen vor.',
    );
    expect(promptClampNotice(120, 'en')).toBe(
      `${TRUNCATION_MARKER} This condensation did not read every available input: ` +
        '120 characters trimmed from what was shown to the model, to fit its input budget were left out.',
    );
  });
});

describe('projectTruncationNotice: unveraendert seit dem Umbau auf promptClampNotice', () => {
  const report: CondenseProjectTruncationReport = {
    days: 2,
    sessions: 1,
    clampedSessions: 1,
    transcriptChars: 500,
    count: 4,
    reason: 'test fixture: days/sessions/transcript bounds exceeded',
  };

  it('ohne Prompt-Clamp: nur die Bericht-Teile, wie vor dem Umbau', () => {
    expect(projectTruncationNotice(report, 'de')).toBe(
      `${TRUNCATION_MARKER} Diese Verdichtung hat nicht alle verfügbaren Eingaben gelesen: ` +
        '2 Tageseinträge älter als 90 Tage, 1 Session jenseits der 3 jüngsten, ' +
        '500 Transkriptzeichen jenseits von 2000 je Session blieben außen vor.',
    );
  });

  it('mit Prompt-Clamp: haengt genau denselben Satz an wie promptClampNotice allein', () => {
    const withClamp = projectTruncationNotice(report, 'de', 300);
    expect(withClamp).toContain(
      '300 Zeichen beim Einreichen ans Modell gekürzt, um dessen Eingabe-Budget einzuhalten',
    );
    expect(withClamp.endsWith('blieben außen vor.')).toBe(true);
  });

  it('null-Bericht plus Prompt-Clamp: verhaelt sich wie promptClampNotice fuer sich allein, nur eingebettet', () => {
    expect(projectTruncationNotice(null, 'de', 300)).toBe(
      `${TRUNCATION_MARKER} Diese Verdichtung hat nicht alle verfügbaren Eingaben gelesen: ` +
        '300 Zeichen beim Einreichen ans Modell gekürzt, um dessen Eingabe-Budget einzuhalten blieben außen vor.',
    );
  });

  it('bleibt leer, wenn weder Bericht noch Prompt-Clamp etwas zu melden haben', () => {
    expect(projectTruncationNotice(null, 'de')).toBe('');
    expect(projectTruncationNotice(null, 'de', 0)).toBe('');
  });
});
