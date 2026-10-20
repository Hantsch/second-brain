/* Ablegen in der Dokumentsprache (Story 024).
 *
 * Zwei Zusagen werden hier geprüft, und sie hängen zusammen:
 *
 * 1. Hat die Zieldatei den Abschnitt noch nicht, entscheidet die Sprache —
 *    `en` schreibt „## Notes", `de` schreibt „## Notizen".
 * 2. Hat sie ihn schon, gewinnt **die Datei**, in welcher Sprache auch immer sie
 *    geschrieben ist. Und zwar auch dann, wenn der Vorschlag etwas anderes
 *    ankündigt: der Vorschlag ist eine Vorschau aus dem Index, der Abschnitt
 *    wird beim Schreiben gegen den frisch gelesenen Rumpf neu bestimmt. Ein
 *    veralteter Index darf keinen zweiten Notizen-Abschnitt anlegen.
 *
 * Der Bestand ist echt (Fixture-Vault im Speicher-Store) plus zwei Projekte, die
 * es dort nicht gibt: eines ohne Notizen-Abschnitt und ein englisches. */

import { beforeEach, describe, expect, it } from 'vitest';
import { applyProposal, classifyDump, heuristicProposal, undoFiling } from '@core/capture';
import { parse } from '@core/vault/frontmatter';
import type { DocLanguage, FilingProposal } from '@shared/types';
import { emptyGateway } from '../../helpers/llm';
import { NOW_MS, TODAY } from '../../helpers/time';
import type { CaptureFixture } from './fixtures';
import { JOURNAL_PATH, WORK_PROJECT_PATH, captureFixture } from './fixtures';

/** Ein Projekt mit den Abschnitten, die es tatsächlich trägt — mehr nicht. */
function projectFile(title: string, slug: string, sections: readonly string[]): string {
  return [
    '---',
    'type: project',
    `title: ${title}`,
    `slug: ${slug}`,
    'scope: work',
    'status: active',
    'priority: 3',
    'started: 2026-07-01',
    'tags: []',
    'modules: []',
    'repos: []',
    'created: 2026-07-01',
    'updated: 2026-08-08',
    '---',
    '',
    ...sections.flatMap((heading) => [`## ${heading}`, '', 'Bestandstext.', '']),
  ].join('\n');
}

/* Ein Projekt ohne Notizen-Abschnitt: hier entscheidet die Sprache. */
const BARE_PATH = 'projects/work/latenzmessung/project.md';
const BARE_TEXT = 'Latenzmessung: die Antwortzeit liegt jetzt bei 80 ms im Mittel.';

/* Ein englisch geschriebenes Projekt: hier entscheidet die Datei. */
const ENGLISH_PATH = 'projects/work/schemaabgleich/project.md';
const ENGLISH_TEXT = 'Schemaabgleich: die beiden Feldlisten sind jetzt deckungsgleich.';

/* Und die deutsche Projektdatei aus dem Fixture-Vault („## Notizen"). */
const GERMAN_TEXT = 'Kundenportal: die Angebotsliste zeigt jetzt alle Positionen.';

const EXTRA = {
  [BARE_PATH]: projectFile('Latenzmessung', 'latenzmessung', ['Stand']),
  [ENGLISH_PATH]: projectFile('Schemaabgleich', 'schemaabgleich', ['Status', 'Todos', 'Notes']),
};

let fixture: CaptureFixture;

beforeEach(async () => {
  fixture = await captureFixture(EXTRA);
});

async function body(path: string): Promise<string> {
  const content = await fixture.store.readText(path);
  expect(content).not.toBeNull();
  return parse(content ?? '').body;
}

/** Wie oft dieser Abschnitt in der Datei steht. Zweimal ist der Fehler dieser Story. */
function headings(text: string, heading: string): number {
  return text.split('\n').filter((line) => line.trim() === `## ${heading}`).length;
}

async function proposalFor(text: string, docLanguage: DocLanguage): Promise<FilingProposal> {
  const dump = await fixture.dump(text);
  return heuristicProposal({
    dumpPath: dump.path,
    text,
    context: fixture.context,
    now: NOW_MS,
    docLanguage,
  });
}

/** Ablegen von Anfang bis Ende, in einer Sprache. */
async function file(text: string, docLanguage: DocLanguage): Promise<FilingProposal> {
  const proposal = await proposalFor(text, docLanguage);
  await applyProposal(fixture.store, proposal, { now: NOW_MS, docLanguage });
  return proposal;
}

describe('Ablegen ohne bestehenden Notizen-Abschnitt', () => {
  it('legt unter „en" einen Abschnitt „Notes" an', async () => {
    const proposal = await file(BARE_TEXT, 'en');
    expect(proposal.primary.path).toBe(BARE_PATH);

    const text = await body(BARE_PATH);
    expect(headings(text, 'Notes')).toBe(1);
    expect(headings(text, 'Notizen')).toBe(0);
    expect(text.indexOf(`### ${TODAY}`)).toBeGreaterThan(text.indexOf('## Notes'));
  });

  it('legt unter „de" einen Abschnitt „Notizen" an', async () => {
    await file(BARE_TEXT, 'de');

    const text = await body(BARE_PATH);
    expect(headings(text, 'Notizen')).toBe(1);
    expect(headings(text, 'Notes')).toBe(0);
  });

  /* Ohne Sprache bleibt es beim Hausbrauch: Deutsch. Die Vorgabe darf sich mit
     dieser Story nicht verschieben — alte Aufrufer schreiben weiter, was sie
     immer geschrieben haben. */
  it('bleibt ohne Angabe bei „Notizen"', async () => {
    const dump = await fixture.dump(BARE_TEXT);
    const proposal = heuristicProposal({
      dumpPath: dump.path,
      text: BARE_TEXT,
      context: fixture.context,
      now: NOW_MS,
    });
    expect(proposal.primary.section).toBe('Notizen');
    await applyProposal(fixture.store, proposal, { now: NOW_MS });

    expect(headings(await body(BARE_PATH), 'Notizen')).toBe(1);
  });
});

describe('Die bestehende Überschrift gewinnt', () => {
  /* Der Kern der Story: der Vorschlag kündigt „Notes" an (die Sprache), die Datei
     trägt „## Notizen" — geschrieben wird in die Datei, ohne zweiten Abschnitt. */
  it('hängt unter „en" an ein bestehendes „## Notizen" an', async () => {
    const proposal = await file(GERMAN_TEXT, 'en');
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.primary.section).toBe('Notes');

    const text = await body(WORK_PROJECT_PATH);
    expect(headings(text, 'Notes')).toBe(0);
    expect(headings(text, 'Notizen')).toBe(1);
    expect(text.indexOf('Angebotsliste zeigt jetzt alle Positionen')).toBeGreaterThan(
      text.indexOf('## Notizen'),
    );
  });

  it('hängt unter „de" an ein bestehendes „## Notes" an', async () => {
    const proposal = await file(ENGLISH_TEXT, 'de');
    expect(proposal.primary.path).toBe(ENGLISH_PATH);
    expect(proposal.primary.section).toBe('Notizen');

    const text = await body(ENGLISH_PATH);
    expect(headings(text, 'Notizen')).toBe(0);
    expect(headings(text, 'Notes')).toBe(1);
    expect(text.indexOf('Feldlisten sind jetzt deckungsgleich')).toBeGreaterThan(
      text.indexOf('## Notes'),
    );
  });

  /* Eine Datei mit beiden Überschriften ist kein Sonderfall, sondern der Bestand
     nach einem Sprachwechsel. docs/VAULT-FORMAT.md: die erste im Dokument gilt. */
  it('nimmt bei zwei Notizen-Abschnitten den ersten im Dokument', async () => {
    const path = 'projects/work/zwiespalt/project.md';
    fixture = await captureFixture({
      ...EXTRA,
      [path]: projectFile('Zwiespalt', 'zwiespalt', ['Stand', 'Notes', 'Notizen']),
    });
    await file('Zwiespalt: der Ausschnitt ist jetzt eindeutig.', 'de');

    const text = await body(path);
    expect(headings(text, 'Notes')).toBe(1);
    expect(headings(text, 'Notizen')).toBe(1);
    const notes = text.indexOf('## Notes');
    const notizen = text.indexOf('## Notizen');
    const written = text.indexOf('der Ausschnitt ist jetzt eindeutig');
    expect(written).toBeGreaterThan(notes);
    expect(written).toBeLessThan(notizen);
  });

  /* Der Tageseintrag trägt „## Tag" und „## Fakten" — auch die bleiben stehen. */
  it('hängt unter „en" an das bestehende „## Tag" an', async () => {
    const text = 'Fühlt sich zäh an heute, alles gleichzeitig und wenig davon fertig.';
    const proposal = await file(text, 'en');
    expect(proposal.primary.path).toBe(JOURNAL_PATH);
    expect(proposal.primary.section).toBe('Day');

    const day = await body(JOURNAL_PATH);
    expect(headings(day, 'Day')).toBe(0);
    expect(headings(day, 'Tag')).toBe(1);
    expect(day.indexOf('Fühlt sich zäh an heute')).toBeGreaterThan(day.indexOf('## Tag'));
  });
});

describe('Neue Projektdatei', () => {
  it('trägt unter „en" Status, Todos und Notes', async () => {
    const path = 'projects/work/neues-vorhaben/project.md';
    const dump = await fixture.dump('Egal.');
    const base = await proposalFor(BARE_TEXT, 'en');
    const proposal: FilingProposal = {
      ...base,
      dumpPath: dump.path,
      title: 'Neues Vorhaben',
      primary: { target: 'new-project', path, section: 'Status', content: 'Erster Stand.' },
      extras: [],
      todos: [],
    };
    await applyProposal(fixture.store, proposal, { now: NOW_MS, docLanguage: 'en' });

    const text = await body(path);
    expect(headings(text, 'Status')).toBe(1);
    expect(headings(text, 'Todos')).toBe(1);
    expect(headings(text, 'Notes')).toBe(1);
    expect(headings(text, 'Notizen')).toBe(0);
    expect(text.indexOf('## Status')).toBeLessThan(text.indexOf('## Todos'));
    expect(text.indexOf('## Todos')).toBeLessThan(text.indexOf('## Notes'));
  });

  it('trägt unter „de" Stand, Todos und Notizen', async () => {
    const path = 'projects/work/anderes-vorhaben/project.md';
    const dump = await fixture.dump('Egal.');
    const base = await proposalFor(BARE_TEXT, 'de');
    const proposal: FilingProposal = {
      ...base,
      dumpPath: dump.path,
      title: 'Anderes Vorhaben',
      primary: { target: 'new-project', path, section: 'Stand', content: 'Erster Stand.' },
      extras: [],
      todos: [],
    };
    await applyProposal(fixture.store, proposal, { now: NOW_MS, docLanguage: 'de' });

    const text = await body(path);
    expect(headings(text, 'Stand')).toBe(1);
    expect(headings(text, 'Notizen')).toBe(1);
    expect(headings(text, 'Notes')).toBe(0);
  });
});

describe('Ohne Modell', () => {
  /* Guardrail 1: kein Modell konfiguriert heißt nicht „keine Ablage". Es ist
     derselbe Weg — die Heuristik entscheidet, die Sprache benennt. */
  it('legt mit „kein Modell konfiguriert" genauso in der Dokumentsprache ab', async () => {
    const dump = await fixture.dump(BARE_TEXT);
    const proposal = await classifyDump(
      {
        store: fixture.store,
        index: fixture.index,
        gateway: emptyGateway(),
        docLanguage: 'en',
        now: NOW_MS,
      },
      dump.path,
    );

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(BARE_PATH);
    expect(proposal.primary.section).toBe('Notes');

    await applyProposal(fixture.store, proposal, { now: NOW_MS, docLanguage: 'en' });
    const text = await body(BARE_PATH);
    expect(headings(text, 'Notes')).toBe(1);
    expect(headings(text, 'Notizen')).toBe(0);
  });
});

describe('Rückweg', () => {
  /* Das Protokoll hält den Block, nicht die Überschrift. Wenn beim Schreiben eine
     andere Überschrift gewonnen hat als der Vorschlag ankündigte, muss das
     Rückgängig den Block trotzdem finden — sonst wäre eine Ablage in eine
     fremdsprachige Datei nicht mehr zurückzunehmen. */
  it('nimmt eine Ablage zurück, deren Überschrift beim Schreiben neu bestimmt wurde', async () => {
    const before = await body(WORK_PROJECT_PATH);
    const proposal = await proposalFor(GERMAN_TEXT, 'en');
    const result = await applyProposal(fixture.store, proposal, {
      now: NOW_MS,
      docLanguage: 'en',
    });
    expect(result.undoToken).not.toBeNull();

    const touched = await undoFiling(fixture.store, result.undoToken ?? '');

    expect(touched).toContain(WORK_PROJECT_PATH);
    expect(await body(WORK_PROJECT_PATH)).toBe(before);
  });

  it('nimmt einen neu angelegten Abschnitt mitsamt Block zurück', async () => {
    const before = await body(BARE_PATH);
    const proposal = await proposalFor(BARE_TEXT, 'en');
    const result = await applyProposal(fixture.store, proposal, {
      now: NOW_MS,
      docLanguage: 'en',
    });

    await undoFiling(fixture.store, result.undoToken ?? '');

    const text = await body(BARE_PATH);
    expect(text).not.toContain('80 ms im Mittel');
    /* Die leere Überschrift bleibt stehen — sie ist jetzt Teil der Datei, und
       nichts an dieser Story entfernt Überschriften aus Nutzerdateien. */
    expect(text.startsWith(before.trimEnd())).toBe(true);
  });
});
