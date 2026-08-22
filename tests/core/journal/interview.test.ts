/* Der Fragebogen als Starthilfe (012), D1: `planInterview` ist rein — kein
   Dateizugriff, kein Modell. Geprüft wird, was in den Acceptance Criteria von
   012/D1 steht:

   - Ein leerer Tag liefert alle fünf Themen, in der verlangten Dokumentsprache,
     Groß-/Kleinschreibung im Satzstil, ohne Emoji.
   - Frontmatter mit `people`/`projects` unterdrückt genau diese zwei Fragen.
   - `mode` kommt unverändert zurück — der Kern entscheidet ihn nicht selbst.
   - `finished` ist erst wahr, wenn kein Thema mehr offen ist.
   - Guardrail 3 (CLAUDE.md): eine gestellte, aber unbeantwortete Frage
     unterdrückt ihr Thema nicht — sonst würde eine Vermutung genügen. */

import { describe, expect, it } from 'vitest';
import { INTERVIEW_TOPICS, formatAnswer, planInterview, readDay } from '@core/journal';
import type { InterviewStep } from '@core/journal';
import { journalFile, journalFixture, journalPathOf } from './fixtures';

const DATE = '2026-08-11';

/** Liest die einzige Datei einer frischen, isolierten Fixture als `JournalDayDoc`. */
async function readInterviewDay(body: string, date: string = DATE) {
  const fixture = await journalFixture({ sample: false, files: { [journalPathOf(date)]: body } });
  const found = await readDay(fixture.store, date);
  if (found === null) throw new Error(`Tag fehlt in der Fixture: ${date}`);
  return found;
}

function topicsOf(steps: readonly InterviewStep[]): string[] {
  return steps.map((step) => step.topic);
}

describe('planInterview', () => {
  it('liefert fünf Schritte für einen leeren Tag, in der Dokumentsprache', async () => {
    const day = await readInterviewDay(journalFile(DATE, ''));

    const de = planInterview(day, 'de', 'fixed');
    const en = planInterview(day, 'en', 'fixed');

    expect(topicsOf(de.steps)).toEqual([...INTERVIEW_TOPICS]);
    expect(topicsOf(en.steps)).toEqual([...INTERVIEW_TOPICS]);
    expect(de.finished).toBe(false);
    expect(en.finished).toBe(false);

    /* Beide Sprachtabellen sind gefüllt, unterscheiden sich, und jede Frage
       hält sich an den Ton aus CLAUDE.md: Satzstil, kein Emoji, eine Frage. */
    for (const [language, plan] of [
      ['de', de],
      ['en', en],
    ] as const) {
      for (const step of plan.steps) {
        expect(step.question.length).toBeGreaterThan(0);
        expect(step.question).toMatch(/^[A-ZÄÖÜ]/);
        expect(step.question.trim().endsWith('?')).toBe(true);
        expect(step.question).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      }
      const otherLanguage = language === 'de' ? en : de;
      expect(plan.steps.map((step) => step.question)).not.toEqual(
        otherLanguage.steps.map((step) => step.question),
      );
    }
  });

  it('unterdrückt people und work, wenn das Frontmatter beides schon trägt', async () => {
    const day = await readInterviewDay(
      journalFile(DATE, '', {
        people: ['Anna'],
        projects: ['nyota-auth0-migration'],
      }),
    );

    const plan = planInterview(day, 'de', 'fixed');

    expect(topicsOf(plan.steps)).toEqual(['events', 'open', 'feeling']);
    expect(plan.finished).toBe(false);
  });

  it('unterdrückt feeling, wenn Stimmung oder Energie im Frontmatter stehen', async () => {
    const day = await readInterviewDay(journalFile(DATE, '', { mood: 3 }));

    expect(topicsOf(planInterview(day, 'de', 'fixed').steps)).toEqual([
      'work',
      'events',
      'people',
      'open',
    ]);
  });

  it('gibt den übergebenen Modus unverändert zurück', async () => {
    const day = await readInterviewDay(journalFile(DATE, ''));

    expect(planInterview(day, 'de', 'fixed').mode).toBe('fixed');
    expect(planInterview(day, 'de', 'model').mode).toBe('model');
  });

  it('ist fertig, sobald jedes Thema abgedeckt ist — Frontmatter plus schon beantwortete Fragen', async () => {
    /* Erster Lauf: Frontmatter deckt drei der fünf Themen ab (people, work,
       feeling); die Fragen zu den zwei übrigen Themen kommen aus genau diesem
       Aufruf, statt im Test ein zweites Mal den Fragetext zu erfinden. */
    const partial = await readInterviewDay(
      journalFile(DATE, '', {
        people: ['Anna'],
        projects: ['nyota-auth0-migration'],
        mood: 3,
        energy: 2,
      }),
    );
    const firstPlan = planInterview(partial, 'de', 'fixed');
    expect(topicsOf(firstPlan.steps)).toEqual(['events', 'open']);
    expect(firstPlan.finished).toBe(false);

    const [eventsStep, openStep] = firstPlan.steps;
    if (eventsStep === undefined || openStep === undefined) {
      throw new Error('Erwartete zwei offene Schritte.');
    }

    /* Zweiter Lauf, derselbe Tag: die zwei restlichen Fragen stehen jetzt im
       Strom, jede gefolgt von einer eigenen Antwort — genau das Muster, das D2
       schreiben wird (Frage als App-Blockzitat, Antwort als eigene Prosa). */
    const body = [
      '---',
      'type: journal',
      "title: 'Tag'",
      `date: ${DATE}`,
      'mood: 3',
      'energy: 2',
      'people: [Anna]',
      'projects: [nyota-auth0-migration]',
      'tags: []',
      'lang: de',
      '---',
      '',
      '## Tag',
      '',
      formatAnswer(eventsStep.question, '09:00', 'de'),
      '',
      'Ein ruhiger Tag, nichts Besonderes.',
      '',
      formatAnswer(openStep.question, '09:05', 'de'),
      '',
      'Noch die Rechnung fertig machen.',
      '',
    ].join('\n');

    const covered = await readInterviewDay(body);
    const secondPlan = planInterview(covered, 'de', 'fixed');

    expect(secondPlan.steps).toEqual([]);
    expect(secondPlan.finished).toBe(true);
  });

  it('zählt eine gestellte, aber unbeantwortete Frage nicht als abgedeckt (Guardrail: keine Vermutung)', async () => {
    const empty = await readInterviewDay(journalFile(DATE, ''));
    const question = planInterview(empty, 'de', 'fixed').steps.find(
      (step) => step.topic === 'events',
    );
    if (question === undefined) throw new Error('Erwartete eine offene Frage zu "events".');

    /* Die Frage steht im Strom, aber niemand hat geantwortet — der Tag endet
       direkt danach. Das darf das Thema nicht unterdrücken. */
    const body = [
      '---',
      'type: journal',
      "title: 'Tag'",
      `date: ${DATE}`,
      'tags: []',
      'lang: de',
      '---',
      '',
      '## Tag',
      '',
      formatAnswer(question.question, '09:00', 'de'),
      '',
    ].join('\n');

    const day = await readInterviewDay(body);
    expect(topicsOf(planInterview(day, 'de', 'fixed').steps)).toContain('events');
  });

  // ── Die eine Zusatzfrage zu einem losen Ende (020, D8) ───────────────────

  const LOOSE_END_A = {
    id: 'loose-end:aaaa',
    day: '2026-08-05',
    quote: 'Morgen bin ich beim Notar.',
  };
  const LOOSE_END_B = {
    id: 'loose-end:bbbb',
    day: '2026-08-03',
    quote: 'Übermorgen ruf ich Klara an.',
  };

  it('haengt genau eine Frage zu einem offenen losen Ende an, ohne die fuenf Themen anzutasten', async () => {
    const day = await readInterviewDay(journalFile(DATE, ''));

    const plan = planInterview(day, 'de', 'fixed', [LOOSE_END_A]);

    expect(topicsOf(plan.steps)).toEqual([...INTERVIEW_TOPICS]);
    expect(plan.looseEnd).toEqual(LOOSE_END_A);
    /* Die feste Themenmenge bleibt unberuehrt: weder `finished` noch die
       Schrittzahl haengen von der Zusatzfrage ab. */
    expect(plan.finished).toBe(false);
  });

  it('haengt bei mehreren offenen losen Enden nur eine Frage an — die erste der uebergebenen Liste', async () => {
    const day = await readInterviewDay(journalFile(DATE, ''));

    const plan = planInterview(day, 'de', 'fixed', [LOOSE_END_A, LOOSE_END_B]);

    expect(plan.looseEnd).toEqual(LOOSE_END_A);
  });

  it('haengt keine Frage an, wenn keine losen Enden uebergeben werden', async () => {
    const day = await readInterviewDay(journalFile(DATE, ''));

    expect(planInterview(day, 'de', 'fixed').looseEnd).toBeNull();
    expect(planInterview(day, 'de', 'fixed', []).looseEnd).toBeNull();
  });

  it('gibt das Zitat wortwoertlich weiter, ohne es umzuformulieren', async () => {
    const day = await readInterviewDay(journalFile(DATE, ''));

    const plan = planInterview(day, 'en', 'fixed', [LOOSE_END_A]);

    expect(plan.looseEnd?.quote).toBe(LOOSE_END_A.quote);
    expect(plan.looseEnd?.id).toBe(LOOSE_END_A.id);
    expect(plan.looseEnd?.day).toBe(LOOSE_END_A.day);
  });
});
