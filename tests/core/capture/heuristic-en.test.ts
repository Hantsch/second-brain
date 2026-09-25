/* Einordnen ohne Modell, wenn die Dokumentsprache Englisch ist (Story 061, D3).
 *
 * Deutsch bleibt die Grundlage: `heuristicDraft` laesst bei `docLanguage: 'en'`
 * die deutschen Lexika und Datumsformen mitlaufen, ergaenzt sie aber um die
 * englischen und uebersetzt die Begruendung. Dieser Test prueft die englische
 * Seite sowie — als Regressionsnetz — dass Deutsch mit `docLanguage: 'de'`
 * unveraendert bleibt (die gleichen Begruendungen wie in heuristic.test.ts). */

import { beforeAll, describe, expect, it } from 'vitest';
import { classifyDump, heuristicProposal } from '@core/capture';
import type { FilingContext } from '@core/capture';
import type { DocLanguage, FilingProposal } from '@shared/types';
import { emptyGateway } from '../../helpers/llm';
import { NOW_MS } from '../../helpers/time';
import type { CaptureFixture } from './fixtures';
import { JOURNAL_PATH, WORK_PROJECT_PATH, captureFixture } from './fixtures';

const DUMP_PATH = 'inbox/2026-08-10-1432-gedanke.md';

let fixture: CaptureFixture;

function propose(text: string, docLanguage: DocLanguage, context?: FilingContext): FilingProposal {
  return heuristicProposal({
    dumpPath: DUMP_PATH,
    text,
    context: context ?? fixture.context,
    now: NOW_MS,
    docLanguage,
  });
}

beforeAll(async () => {
  fixture = await captureFixture();
});

describe('heuristicProposal — English dumps', () => {
  it('files an English work dump to the mentioned project with an English reason', () => {
    const proposal = propose('Kundenportal search is still slow above 400 offers.', 'en');

    expect(proposal.primary.target).toBe('project');
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.reason).toBe('Mentions "Kundenportal".');
    expect(proposal.reason).not.toContain('„');
    expect(proposal.heuristic).toBe(true);
  });

  it('names project and date in English: ISO date', () => {
    const proposal = propose('Kundenportal review is due on 2026-08-15.', 'en');

    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.reason).toBe('Mentions "Kundenportal" and a date on 2026-08-15');
  });

  it('sends an English mood dump to the journal without todos', () => {
    const proposal = propose('I feel tired and overwhelmed, today was too much.', 'en');

    expect(proposal.primary.target).toBe('journal');
    expect(proposal.primary.path).toBe(JOURNAL_PATH);
    expect(proposal.reason).toContain('mood words');
    expect(proposal.reason).toContain('tired');
    expect(proposal.reason).not.toContain('„');
    expect(proposal.todos).toEqual([]);
  });

  it('picks the private scope from English signal words', () => {
    const proposal = propose('Thinking about the garden and the weekend plans.', 'en');

    expect(proposal.scope).toBe('private');
  });

  it('stays in the inbox with an English reason when nothing matches', () => {
    const proposal = propose('A random thought that connects to nothing else here.', 'en');

    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.reason).toBe(
      'No project reference, no day reference and no source recognizable — stays in the inbox.',
    );
    expect(proposal.reason).not.toContain('„');
  });

  it('German behaviour is unchanged when docLanguage is de', () => {
    const project = propose(
      'Testlauf im Kundenportal war ok, aber die Suche über Kundennummern hängt bei 400 Angeboten.',
      'de',
    );
    expect(project.reason).toBe('Erwähnt "Kundenportal".');

    const withDate = propose(
      'Abnahmeprotokoll mit Miriam bis 15.08. durchgehen. Betrifft das Kundenportal.',
      'de',
    );
    expect(withDate.reason).toBe('Erwähnt "Kundenportal" und einen Termin am 15.08.');

    const mood = propose(
      'Der Sprint fühlt sich unmöglich an. Ich bin müde und habe zu viel offen.',
      'de',
    );
    expect(mood.reason).toContain('Gefühlsworte');
    expect(mood.reason).toContain('müde');

    const noMatch = propose(
      'Idee: ein Wochenrückblick jeden Freitag, damit die Woche nicht verschwindet.',
      'de',
    );
    expect(noMatch.reason).toContain('Kein Projektbezug');
  });
});

describe('classifyDump — ohne Modell, Dokumentsprache Englisch', () => {
  it('without a model, an English dump gets English detection and reasons', async () => {
    const dump = await fixture.dump('Kundenportal search is still slow above 400 offers.');

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
    expect(proposal.primary.target).toBe('project');
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.reason).toBe('Mentions "Kundenportal".');
    expect(proposal.reason).not.toContain('„');
  });
});
