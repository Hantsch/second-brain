/* Der Tagesabschluss. Zwei Fragen entscheiden hier alles:

   - **Erkennt er, was dasteht?** Todos mit Frist, Warte-auf, genannte Personen und
     Projekte, Stimmung und Energie — aus einem echten deutschen Tageseintrag,
     ohne Modell (die Heuristik ist die Untergrenze, nicht der Notfall).
   - **Schreibt er wirklich nichts?** Der Vault wird vor und nach dem Lauf
     verglichen: kein Byte darf sich ändern, solange niemand bestätigt hat. */

import { describe, expect, it } from 'vitest';
import { GERMAN_CLOSE_LABELS, closeDay, formatAnswer, heuristicMood } from '@core/journal';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { DAY_PATH, journalFile, journalFixture, journalPathOf } from './fixtures';

const DATE = '2026-08-09';
const PATH = journalPathOf(DATE);

/* Ein Tag, wie er wirklich geschrieben wird: Bericht, zwei Absichten mit Frist,
   ein Warte-auf, zwei Personen, ein Projekt, am Ende die Stimmung. */
const ENTRY = [
  'Zäher Tag im Sprint.',
  'Nachmittags mit Miriam das Abnahmeprotokoll durchgegangen; zwei Punkte sind noch offen.',
  'Ich muss morgen die Ladezeiten der Angebotsliste messen.',
  'Ich muss noch den doppelten Interceptor im Kundenportal zusammenlegen, bis 17.08.',
  'Warte auf Jonas wegen des Sitzungs-Fallbacks.',
  'Abends war ich müde und ziemlich gestresst.',
].join('\n');

async function fixtureWithEntry() {
  return journalFixture({ files: { [PATH]: journalFile(DATE, ENTRY) } });
}

describe('closeDay', () => {
  it('zieht Todos mit Fristen, Warte-auf, Personen und Projekte aus dem Eintrag', async () => {
    const fixture = await fixtureWithEntry();

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(suggestion).not.toBeNull();
    const proposal = suggestion?.proposal;
    expect(proposal?.heuristic).toBe(true);
    expect(proposal?.title).toBe('Sonntag, 9. August 2026');
    expect(proposal?.scope).toBe('work');

    const todos = proposal?.todos ?? [];
    expect(todos.map((todo) => todo.text)).toEqual([
      'Morgen die Ladezeiten der Angebotsliste messen',
      'Den doppelten Interceptor im Kundenportal zusammenlegen, bis 17.08',
    ]);
    /* „morgen" zählt vom Tag des Eintrags, nicht von heute. */
    expect(todos[0]?.due).toBe('2026-08-10');
    expect(todos[0]?.project).toBeNull();
    expect(todos[1]?.due).toBe('2026-08-17');
    expect(todos[1]?.project).toBe('kundenportal-relaunch');
    expect(todos[1]?.scope).toBe('work');

    expect(proposal?.waitingOn.map((entry) => entry.who)).toEqual(['Jonas']);
    expect(proposal?.waitingOn[0]?.since).toBe(DATE);

    expect(suggestion?.frontmatter.people).toEqual(['Jonas', 'Miriam']);
    expect(suggestion?.frontmatter.projects).toEqual(['kundenportal-relaunch']);
    /* Bereiche werden nie geraten — ohne Modell bleibt die Liste leer, auch wenn
       ein Bereichsname im Text vorkäme. */
    expect(suggestion?.frontmatter.areas).toEqual([]);
    expect(suggestion?.frontmatter.mood).toBe(2);
    expect(suggestion?.frontmatter.energy).toBe(2);
  });

  it('schlägt für jedes Todo ein Ziel vor: Projektdatei oder Tageseintrag', async () => {
    const fixture = await fixtureWithEntry();

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    const primary = suggestion?.proposal.primary;
    expect(primary?.target).toBe('journal');
    expect(primary?.path).toBe(PATH);
    expect(primary?.section).toBe('Fakten');
    expect(primary?.content).toContain('- [ ] Morgen die Ladezeiten');
    expect(primary?.content).toContain('@due:2026-08-10');
    expect(primary?.content).not.toContain('Interceptor');

    const extras = suggestion?.proposal.extras ?? [];
    expect(extras).toHaveLength(1);
    expect(extras[0]?.path).toBe('projects/work/kundenportal-relaunch/project.md');
    expect(extras[0]?.section).toBe('Todos');
    expect(extras[0]?.content).toContain('@due:2026-08-17');
  });

  it('schreibt nichts — kein Byte im Vault ändert sich', async () => {
    const fixture = await fixtureWithEntry();
    const before = fixture.store.allFiles();

    await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(fixture.store.allFiles()).toEqual(before);
  });

  it('begründet den Vorschlag mit Zahlen und sagt, dass kein Modell beteiligt war', async () => {
    const fixture = await fixtureWithEntry();

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(suggestion?.proposal.reason).toBe(
      'Ohne Modell im Tageseintrag erkannt: 2 Todos, 1 Warte-auf, 2 Personen, 1 Projekt und Stimmung.',
    );
    expect(suggestion?.proposal.confidence).toBeLessThanOrEqual(0.6);
  });

  it('lässt die Begründung von außen setzen — der Kern kennt die Oberflächensprache nicht', async () => {
    const fixture = await fixtureWithEntry();
    const labels = { reason: (found: { todos: number }) => `found ${found.todos} todos` };

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway(), { labels }), DATE);

    expect(suggestion?.proposal.reason).toBe('found 2 todos');
  });

  it('liest den Gesprächsabschnitt nicht mit', async () => {
    const dialogue = [
      '> **Second Brain** — 21:05',
      '> Du solltest morgen die Rechnung an Svenja schicken.',
    ].join('\n');
    const fixture = await journalFixture({
      files: { [PATH]: journalFile(DATE, 'Ruhiger Tag.', { dialogue }) },
    });

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(suggestion?.proposal.todos).toEqual([]);
    expect(suggestion?.frontmatter.people).toEqual([]);
  });

  it('liest eine eingebettete Antwort im Tag-Abschnitt nicht mit (011: Strom statt Gespräch)', async () => {
    /* Analog zu 'liest den Gesprächsabschnitt nicht mit' oben, aber im neuen
       Format: die Antwort steht nicht mehr in einem eigenen Abschnitt, sondern
       als Blockzitat mitten in "Tag". Todo-artige Sprache darin darf trotzdem
       nicht als Vorschlag der Nutzerin erscheinen. */
    const answer = formatAnswer('Du solltest morgen die Rechnung an Svenja schicken.', '21:05');
    const tag = ['Ruhiger Tag.', '', answer].join('\n');
    const fixture = await journalFixture({ files: { [PATH]: journalFile(DATE, tag) } });

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(suggestion?.proposal.todos).toEqual([]);
    expect(suggestion?.frontmatter.people).toEqual([]);
  });

  it('nimmt die Felder des Modells, prüft sie aber gegen Text und Bestand', async () => {
    const fixture = await fixtureWithEntry();
    const { gateway } = gatewayWithReplies({
      'extract-tasks': JSON.stringify({
        people: ['Miriam', 'Kerstin'],
        projects: ['kundenportal-relaunch', 'erfundenes-projekt'],
        areas: ['gesundheit', 'erfundener-bereich'],
        mood: 2,
        energy: 1,
        tags: ['#Stress', 'abnahme'],
      }),
    });

    const suggestion = await closeDay(fixture.closeDeps(gateway), DATE);

    /* Kerstin steht nicht im Text, das Projekt gibt es nicht: beides fällt weg. */
    expect(suggestion?.frontmatter.people).not.toContain('Kerstin');
    expect(suggestion?.frontmatter.people).toContain('Miriam');
    expect(suggestion?.frontmatter.projects).toEqual(['kundenportal-relaunch']);
    /* 'gesundheit' gibt es im Bestand, 'erfundener-bereich' nicht: nur der
       bekannte Slug bleibt übrig. */
    expect(suggestion?.frontmatter.areas).toEqual(['gesundheit']);
    expect(suggestion?.frontmatter.energy).toBe(1);
    expect(suggestion?.frontmatter.tags).toContain('stress');
    expect(suggestion?.heuristic).toBe(false);
    expect(suggestion?.proposal.confidence).toBeGreaterThan(0.6);
  });

  it('ist null für einen Tag ohne Datei und für einen Tag ohne Text', async () => {
    const fixture = await journalFixture({
      files: { [journalPathOf('2026-08-07')]: journalFile('2026-08-07', '') },
    });

    expect(await closeDay(fixture.closeDeps(emptyGateway()), '2026-08-06')).toBeNull();
    expect(await closeDay(fixture.closeDeps(emptyGateway()), '2026-08-07')).toBeNull();
  });

  it('liefert auch einen leeren Vorschlag, statt still nichts zu tun', async () => {
    const fixture = await journalFixture({
      files: { [PATH]: journalFile(DATE, 'Freier Abend in der Werkstatt, nichts notiert.') },
    });

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(suggestion?.proposal.todos).toEqual([]);
    expect(suggestion?.proposal.reason).toContain('nichts');
    expect(suggestion?.proposal.primary.content).toBe('');
  });

  it('behält Stimmung und Energie aus der Datei, wenn der Text an diesem Tag nichts hergibt', async () => {
    const fixture = await journalFixture({
      files: {
        [PATH]: journalFile(DATE, 'Freier Abend in der Werkstatt, nichts notiert.', {
          mood: 4,
          energy: 3,
        }),
      },
    });

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), DATE);

    expect(suggestion?.frontmatter.mood).toBe(4);
    expect(suggestion?.frontmatter.energy).toBe(3);
  });

  it('arbeitet auch am Tageseintrag des Fixture-Vaults, ohne ihn anzufassen', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    const suggestion = await closeDay(fixture.closeDeps(emptyGateway()), '2026-08-10');

    expect(suggestion?.path).toBe(DAY_PATH);
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });
});

describe('heuristicMood', () => {
  it('meldet nur, was der Text hergibt', () => {
    expect(heuristicMood('Ich war müde.')).toEqual({ mood: null, energy: 2 });
    expect(heuristicMood('Dankbar für den Abend.')).toEqual({ mood: 4, energy: null });
    expect(heuristicMood('Guter Tag, nichts Besonderes.')).toEqual({ mood: null, energy: null });
  });

  it('entscheidet nicht, wenn beide Richtungen vorkommen', () => {
    expect(heuristicMood('Viel Stress, aber am Ende erleichtert.')).toEqual({
      mood: null,
      energy: null,
    });
  });
});

describe('GERMAN_CLOSE_LABELS', () => {
  it('nennt Zahlen und sagt, ob ein Modell beteiligt war', () => {
    expect(
      GERMAN_CLOSE_LABELS.reason({
        todos: 1,
        waitingOn: 0,
        people: 0,
        projects: 0,
        mood: false,
        usedLlm: true,
      }),
    ).toBe('Im Tageseintrag erkannt: 1 Todo.');
    expect(
      GERMAN_CLOSE_LABELS.reason({
        todos: 0,
        waitingOn: 0,
        people: 0,
        projects: 0,
        mood: false,
        usedLlm: false,
      }),
    ).toBe('Ohne Modell im Tageseintrag erkannt: nichts.');
  });
});
