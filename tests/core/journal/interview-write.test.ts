/* Der Fragebogen (012), D2: `recordAnswer` schreibt ein beantwortetes Paar in
   den Tagesstrom. Geprüft wird, was in den Acceptance Criteria von 012/D2 steht
   — und vor allem die Zusicherung aus 011, die dabei nicht brechen darf:

   - Frage und Antwort landen in **einem** Schreibvorgang im „Tag"-Abschnitt,
     kein zweiter Abschnitt, kein zweites Blockzitat-Format.
   - Eine leere Antwort wird abgewiesen, und dann steht nichts in der Datei —
     auch nicht die Frage.
   - Roundtrip: `parseStream` liest das Paar als `answer` + `entry` zurück.
   - „Meine Worte und seine Worte verschwimmen nie": im rohen Dateitext steht
     die Frage als Blockzitat mit Sprecher „Second Brain", die Antwort als
     Prosa ohne Anführungszeichen.
   - Der Schluss zu D1: was `recordAnswer` schreibt, zählt `planInterview`
     danach als abgedeckt. Genau hier würde ein abweichendes Format auffallen. */

import { describe, expect, it } from 'vitest';
import {
  JournalError,
  formatAnswer,
  parseStream,
  planInterview,
  readDay,
  recordAnswer,
} from '@core/journal';
import type { InterviewStep, JournalBlock, JournalStore } from '@core/journal';
import { NOW_MS } from '../../helpers/time';
import { journalFile, journalFixture, journalPathOf } from './fixtures';

const DATE = '2026-08-11';
const PATH = journalPathOf(DATE);
/** Uhrzeit, die `timeOf(NOW_MS)` liefert — die Fixture-Uhr steht auf 14:32. */
const AT = '14:32';

/** Eine Fixture ohne jede Datei: `recordAnswer` legt den Tag selbst an. */
async function freshFixture() {
  return journalFixture({ sample: false });
}

/**
 * Die offenen Schritte eines leeren Tages. Der Fragetext kommt aus
 * `planInterview`, damit er im Test nicht ein zweites Mal erfunden wird — er
 * ist die Kopplung zwischen D1 und D2.
 */
async function openSteps(count: number): Promise<InterviewStep[]> {
  const fixture = await journalFixture({ sample: false, files: { [PATH]: journalFile(DATE, '') } });
  const day = await readDay(fixture.store, DATE);
  if (day === null) throw new Error(`Tag fehlt in der Fixture: ${DATE}`);
  const steps = planInterview(day, 'de', 'fixed').steps.slice(0, count);
  if (steps.length < count) throw new Error(`Erwartete ${count} offene Schritte.`);
  return steps;
}

async function firstStep(): Promise<InterviewStep> {
  const [step] = await openSteps(1);
  if (step === undefined) throw new Error('Erwartete einen offenen Schritt.');
  return step;
}

/** Die Blöcke des „Tag"-Stroms, so wie sie in der Datei stehen. */
async function streamOf(store: JournalStore): Promise<JournalBlock[]> {
  const day = await readDay(store, DATE);
  if (day === null) throw new Error(`Tag fehlt: ${DATE}`);
  return parseStream(day.doc.body);
}

describe('recordAnswer', () => {
  it('hängt Frage und Antwort als ein Paar unter „Tag" an', async () => {
    const fixture = await freshFixture();
    const step = await firstStep();

    const result = await recordAnswer(fixture.store, DATE, step, 'Am Auth0-Umzug.', {
      now: NOW_MS,
    });

    expect(result.path).toBe(PATH);
    expect(result.at).toBe(AT);

    const blocks = await streamOf(fixture.store);
    const [question, answer] = blocks.slice(-2);
    expect(question).toMatchObject({ kind: 'answer', text: step.question, at: AT });
    expect(answer).toMatchObject({ kind: 'entry', text: 'Am Auth0-Umzug.' });

    /* Kein neuer Abschnitt: die Datei hat genau die zwei Abschnitte, die
       `newDayBody` anlegt, und das Paar steht im ersten davon. */
    const content = await fixture.text(PATH);
    expect(content.match(/^## .*$/gm)).toEqual(['## Tag', '## Fakten']);
    expect(content.indexOf('> **Second Brain**')).toBeLessThan(content.indexOf('## Fakten'));
    expect(content.indexOf('Am Auth0-Umzug.')).toBeLessThan(content.indexOf('## Fakten'));
  });

  it('schreibt die Frage als Blockzitat der App und die Antwort als eigene Prosa', async () => {
    const fixture = await freshFixture();
    const step = await firstStep();

    await recordAnswer(fixture.store, DATE, step, 'Am Auth0-Umzug.', { now: NOW_MS });

    /* Genau das Blockzitat von `formatAnswer` — kein zweites Format (011). */
    const content = await fixture.text(PATH);
    expect(content).toContain(formatAnswer(step.question, AT, 'de'));
    expect(content).toContain(`> **Second Brain** — ${AT}\n> ${step.question}\n\nAm Auth0-Umzug.`);

    /* Und die Gegenprobe auf dem rohen Text: die Frage steht in einer
       Zitatzeile, die Antwort in einer Zeile ohne '>' — genau das Bild aus
       docs/VAULT-FORMAT.md, „Daily entry". */
    const lines = content.split('\n');
    const speaker = lines.findIndex((line) => line.startsWith('> **Second Brain**'));
    expect(speaker).toBeGreaterThan(-1);
    expect(lines[speaker + 1]).toBe(`> ${step.question}`);
    expect(lines[speaker + 2]).toBe('');
    expect(lines[speaker + 3]).toBe('Am Auth0-Umzug.');
  });

  it('weist eine leere Antwort ab und schreibt nichts — auch nicht die Frage', async () => {
    const fixture = await freshFixture();
    const step = await firstStep();

    await expect(recordAnswer(fixture.store, DATE, step, '  \n ')).rejects.toThrow(JournalError);
    await expect(recordAnswer(fixture.store, DATE, step, '')).rejects.toMatchObject({
      code: 'invalid',
    });

    /* Die Datei ist nicht einmal entstanden: eine Frage ohne Antwort würde
       `planInterview` als „gestellt, aber unbeantwortet" wiederfinden. */
    expect(await fixture.store.readText(PATH)).toBeNull();
  });

  it('hängt ein zweites Paar hinter das erste, in Schreibreihenfolge', async () => {
    const fixture = await freshFixture();
    const [first, second] = await openSteps(2);
    if (first === undefined || second === undefined) {
      throw new Error('Erwartete zwei offene Schritte.');
    }

    await recordAnswer(fixture.store, DATE, first, 'Am Auth0-Umzug.', { at: '09:00' });
    await recordAnswer(fixture.store, DATE, second, 'Der Build war zweimal rot.', { at: '09:04' });

    const blocks = await streamOf(fixture.store);
    expect(blocks).toMatchObject([
      { kind: 'answer', text: first.question, at: '09:00' },
      { kind: 'entry', text: 'Am Auth0-Umzug.' },
      { kind: 'answer', text: second.question, at: '09:04' },
      { kind: 'entry', text: 'Der Build war zweimal rot.' },
    ]);
  });

  it('übersteht eine Bearbeitung von außen zwischen zwei Antworten (Datei-Rundreise)', async () => {
    /* CLAUDE.md, Pflichttest: write → von außen editiert → re-read, ohne
       Verlust. `recordAnswer` trägt kein `expectedHash` (Decisions: ein
       Konflikt hier wäre reine Reibung) — genau deshalb muss eine Bearbeitung
       von außen zwischen zwei Antworten stehen bleiben, statt von der
       zweiten überschrieben zu werden. */
    const fixture = await freshFixture();
    const [first, second] = await openSteps(2);
    if (first === undefined || second === undefined) {
      throw new Error('Erwartete zwei offene Schritte.');
    }

    await recordAnswer(fixture.store, DATE, first, 'Am Auth0-Umzug.', { at: '09:00' });

    /* Von außen bearbeitet, wie in Obsidian oder einem Texteditor: ein
       eigener Absatz mitten in den „Tag"-Abschnitt, direkt vor „## Fakten"
       (ein frischer Tag trägt beide Abschnitte schon von `ensureDay` an) —
       ohne `recordAnswer` und ohne Hash. */
    const before = await fixture.text(PATH);
    expect(before).toContain('## Fakten');
    const edited = before.replace(
      '## Fakten',
      'Von Hand ergänzt, zwischen den beiden Antworten.\n\n## Fakten',
    );
    await fixture.store.writeText(PATH, edited);

    await recordAnswer(fixture.store, DATE, second, 'Der Build war zweimal rot.', { at: '09:04' });

    const content = await fixture.text(PATH);
    expect(content).toContain('Von Hand ergänzt, zwischen den beiden Antworten.');
    expect(content).toContain(first.question);
    expect(content).toContain('Am Auth0-Umzug.');
    expect(content).toContain(second.question);
    expect(content).toContain('Der Build war zweimal rot.');

    /* Reihenfolge: erste Antwort, dann die Handschrift, dann die zweite —
       nichts wurde überschrieben, nur angehängt. */
    const firstAt = content.indexOf(first.question);
    const handAt = content.indexOf('Von Hand ergänzt');
    const secondAt = content.indexOf(second.question);
    expect(firstAt).toBeLessThan(handAt);
    expect(handAt).toBeLessThan(secondAt);
  });

  it('macht das Thema für planInterview abgedeckt (dasselbe Format auf beiden Seiten)', async () => {
    const fixture = await freshFixture();
    const step = await firstStep();

    await recordAnswer(fixture.store, DATE, step, 'Am Auth0-Umzug.', { now: NOW_MS });

    const day = await readDay(fixture.store, DATE);
    if (day === null) throw new Error(`Tag fehlt: ${DATE}`);
    const plan = planInterview(day, 'de', 'fixed');
    expect(plan.steps.map((open) => open.topic)).not.toContain(step.topic);
    expect(plan.finished).toBe(false);
  });
});
