/* Einordnen ohne Modell. Das ist die Untergrenze der App: was hier nicht
   funktioniert, funktioniert bei einem Nutzer ohne LLM überhaupt nicht.

   Geprüft wird an realistischen deutschen Dumps — Idee, Arbeitsstand,
   Einkaufsliste, Gefühlsdump, Link, Termin mit Frist, Warte-auf. Jeder Fall
   nennt sein erwartetes Ziel, den Scope, die Todos und das Datum. */

import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_CONFIDENCE, findProjectMentions, heuristicProposal } from '@core/capture';
import type { FilingContext } from '@core/capture';
import type { FilingProposal } from '@shared/types';
import type { CaptureFixture } from './fixtures';
import {
  AREA_PATH,
  HOME_PROJECT,
  HOME_PROJECT_PATH,
  JOURNAL_PATH,
  MODULE_SLUG,
  WORK_PROJECT,
  WORK_PROJECT_PATH,
  captureFixture,
} from './fixtures';
import { NOW_MS, TODAY } from '../../helpers/time';

const DUMP_PATH = 'inbox/2026-08-10-1432-gedanke.md';

let fixture: CaptureFixture;

function propose(text: string, context?: FilingContext): FilingProposal {
  return heuristicProposal({
    dumpPath: DUMP_PATH,
    text,
    context: context ?? fixture.context,
    now: NOW_MS,
  });
}

beforeAll(async () => {
  fixture = await captureFixture();
});

describe('heuristicProposal — realistische Dumps', () => {
  it('legt einen Arbeitsstand mit Projektbezug beim Projekt ab', () => {
    const proposal = propose(
      'Testlauf im Kundenportal war ok, aber die Suche über Kundennummern hängt bei 400 Angeboten.',
    );

    expect(proposal.primary.target).toBe('project');
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.primary.section).toBe('Notizen');
    expect(proposal.scope).toBe('work');
    expect(proposal.reason).toBe('Erwähnt "Kundenportal".');
    expect(proposal.heuristic).toBe(true);
  });

  it('nennt in der Begründung den echten Grund: Projekt und Termin', () => {
    const proposal = propose(
      'Abnahmeprotokoll mit Miriam bis 15.08. durchgehen. Betrifft das Kundenportal.',
    );

    expect(proposal.reason).toBe('Erwähnt "Kundenportal" und einen Termin am 15.08.');
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.todos).toHaveLength(1);
    expect(proposal.todos[0]?.due).toBe('2026-08-15');
    expect(proposal.todos[0]?.project).toBe(WORK_PROJECT);
    expect(proposal.todos[0]?.scope).toBe('work');
  });

  it('erkennt ein Projekt auch an einem gebeugten Titelwort', () => {
    const proposal = propose('Noppenfolie fürs Hochbeets besorgen, dazu zwei Querstreben.');

    expect(proposal.primary.path).toBe(HOME_PROJECT_PATH);
    expect(proposal.scope).toBe('private');
    expect(proposal.todos[0]?.project).toBe(HOME_PROJECT);
  });

  it('schickt einen Gefühlsdump ins Journal und macht daraus keine Aufgaben', () => {
    const proposal = propose(
      'Der Sprint fühlt sich unmöglich an. Ich bin müde und habe zu viel offen.',
    );

    expect(proposal.primary.target).toBe('journal');
    expect(proposal.primary.path).toBe(JOURNAL_PATH);
    expect(proposal.primary.section).toBe('Tag');
    expect(proposal.reason).toContain('Gefühlsworte');
    expect(proposal.reason).toContain('müde');
    expect(proposal.todos).toEqual([]);
  });

  it('führt einen Link zum Modul, weil daraus eine Quelle wird', () => {
    const proposal = propose('Guter Artikel über Token-Lebensdauern: https://example.com/tokens');

    expect(proposal.primary.target).toBe('module');
    expect(proposal.primary.path).toBe(`modules/${MODULE_SLUG}/module.md`);
    expect(proposal.reason).toContain('example.com');
  });

  it('lässt einen Link liegen, wenn es kein Modul gibt', () => {
    const proposal = propose('Lesen: https://example.com/rost', {
      ...fixture.context,
      modules: [],
    });

    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.primary.path).toBe(DUMP_PATH);
    expect(proposal.reason).toContain('kein Modul');
  });

  it('erkennt einen Warte-auf-Hinweis mit Person und Sache', () => {
    const proposal = propose(
      'Ich warte noch auf Jonas wegen des Fallbacks für abgelaufene Sitzungen. Kundenportal.',
    );

    expect(proposal.waitingOn).toEqual([
      {
        who: 'Jonas',
        what: 'wegen des Fallbacks für abgelaufene Sitzungen',
        since: TODAY,
      },
    ]);
    expect(proposal.primary.path).toBe(WORK_PROJECT_PATH);
  });

  it('erkennt Warte-auf auch an „Rückmeldung von X" mit Frist', () => {
    const proposal = propose('Rückmeldung von Miriam fehlt, brauche sie bis morgen.');

    expect(proposal.waitingOn[0]?.who).toBe('Miriam');
    expect(proposal.waitingOn[0]?.what).toBe('Rückmeldung');
    expect(proposal.waitingOn[0]?.due).toBe('2026-08-11');
  });

  it('macht aus einer Einkaufsliste Todos und lässt sie ehrlich liegen', () => {
    const proposal = propose('Einkaufsliste:\n- Kaffee\n- Hefe\n- Zitronen');

    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.scope).toBe('private');
    expect(proposal.todos.map((todo) => todo.text)).toEqual(['Kaffee', 'Hefe', 'Zitronen']);
    expect(proposal.reason).toContain('bleibt liegen');
  });

  it('lässt eine Idee ohne Bezug liegen, statt sie irgendwohin zu schieben', () => {
    const proposal = propose(
      'Idee: ein Wochenrückblick jeden Freitag, damit die Woche nicht verschwindet.',
    );

    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.todos).toEqual([]);
    expect(proposal.title).toBe('Idee: ein Wochenrückblick jeden Freitag, damit die Woche nicht…');
  });

  /* Ein gemeinsamer Tag sagt „gleiches Themenfeld", nicht „dieses Projekt". Sonst
     landet jeder Text, der mit „Idee:" anfängt, in einem Projekt, das 'idee'
     unter seinen Tags trägt — im Demo-Vault genau so passiert. */
  it('nimmt einen Treffer, der nur auf einem Tag beruht, nicht als Projektbezug', () => {
    const text = 'Im Garten wäre noch Platz für einen Kompost, mal nachmessen.';
    const mentions = findProjectMentions(text, fixture.context.projects);
    expect(mentions[0]?.project.slug).toBe(HOME_PROJECT);
    expect(mentions[0]?.score).toBe(1);

    const proposal = propose(text);

    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.reason).toContain('Kein Projektbezug');
  });

  it('legt einen Dump mit Bereichsbezug beim Bereich ab', () => {
    const proposal = propose('Gesundheit: Termin beim Physiotherapeuten machen.');

    expect(proposal.primary.target).toBe('area');
    expect(proposal.primary.path).toBe(AREA_PATH);
    expect(proposal.scope).toBe('private');
    expect(proposal.extras).toHaveLength(1);
    expect(proposal.extras[0]?.path).toBe(AREA_PATH);
    expect(proposal.extras[0]?.section).toBe('Todos');
  });

  it('rechnet eine Kalenderwoche in einen Kalendertag um', () => {
    const proposal = propose('Release in KW 34 einplanen. Kundenportal Relaunch.');

    expect(proposal.todos[0]?.due).toBe('2026-08-17');
    expect(proposal.reason).toContain('17.08.');
  });

  it('nimmt Scope-Signalwörter, wenn kein Projekt greift', () => {
    const work = propose('Im Meeting kam raus, dass der Deployment-Ablauf niemandem klar ist.');
    const home = propose('Für den Balkon noch Blumenerde und einen Eimer besorgen.');

    expect(work.scope).toBe('work');
    expect(home.scope).toBe('private');
  });
});

describe('heuristicProposal — Form des Vorschlags', () => {
  it('bleibt in der Zuversicht konservativ', () => {
    const proposal = propose(
      'Kundenportal Relaunch: Abnahmeprotokoll mit Miriam bis 15.08. durchgehen, Ladezeiten prüfen.',
    );

    expect(proposal.confidence).toBeLessThanOrEqual(MAX_CONFIDENCE);
    expect(proposal.confidence).toBeGreaterThan(0.3);
  });

  it('schreibt den Datumskopf in den Inhalt einer Projektnotiz', () => {
    const proposal = propose('Kundenportal: Suche über Kundennummern hängt.');

    expect(proposal.primary.content.startsWith(`### ${TODAY}\n\n`)).toBe(true);
    expect(proposal.primary.content).toContain('Kundennummern');
  });

  it('lässt den Tageseintrag ohne Datumskopf, weil die Datei schon der Tag ist', () => {
    const proposal = propose('Ich bin müde, der Tag war zu voll.');

    expect(proposal.primary.target).toBe('journal');
    expect(proposal.primary.content.startsWith('###')).toBe(false);
  });

  it('bietet „bleibt liegen" immer an — als Ziel oder als Alternative', () => {
    const cases = ['Kundenportal: Ladezeiten prüfen.', 'Ich bin müde.', 'Einkaufsliste:\n- Kaffee'];
    for (const text of cases) {
      const proposal = propose(text);
      const targets = [proposal.primary, ...proposal.alternatives].map((action) => action.target);
      expect(targets).toContain('inbox');
      expect(proposal.alternatives.length).toBeLessThanOrEqual(3);
    }
  });

  it('führt Todos in die Datei des Projekts, zu dem sie gehören', () => {
    const proposal = propose('Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen.');

    expect(proposal.extras).toHaveLength(1);
    expect(proposal.extras[0]?.path).toBe(WORK_PROJECT_PATH);
    expect(proposal.extras[0]?.section).toBe('Todos');
    expect(proposal.extras[0]?.content).toBe(
      '- [ ] Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen @due:2026-08-11',
    );
  });

  it('übernimmt Tags aus dem Vault, statt neue zu erfinden', () => {
    const proposal = propose('Kundenportal: das Frontend braucht eine zweite Runde.');

    expect(proposal.tags).toContain('kundenportal');
    expect(proposal.tags).toContain('frontend');
  });

  it('lässt einen Dump liegen, wenn das genannte Projekt nicht mehr existiert', () => {
    const proposal = propose('Kundenportal: Ladezeiten prüfen.', {
      ...fixture.context,
      projects: [],
    });

    expect(proposal.primary.target).toBe('inbox');
    expect(proposal.primary.path).toBe(DUMP_PATH);
  });
});

describe('findProjectMentions', () => {
  it('wertet einen ganzen Titel höher als ein einzelnes Titelwort', () => {
    const full = findProjectMentions('Kundenportal Relaunch steht an.', fixture.context.projects);
    const partial = findProjectMentions('Kundenportal hängt.', fixture.context.projects);

    expect(full[0]?.project.slug).toBe(WORK_PROJECT);
    expect(partial[0]?.project.slug).toBe(WORK_PROJECT);
    expect(full[0]?.score).toBeGreaterThan(partial[0]?.score ?? 0);
  });

  it('trifft nur auf Wortgrenzen', () => {
    expect(findProjectMentions('Hochbeetplanung', fixture.context.projects)).toEqual([]);
    expect(findProjectMentions('Das Hochbeet steht.', fixture.context.projects)).toHaveLength(1);
  });

  it('erkennt einen Slug auch mit Leerzeichen geschrieben', () => {
    const mentions = findProjectMentions('hochbeet bauen ist dran', fixture.context.projects);
    expect(mentions[0]?.project.slug).toBe(HOME_PROJECT);
  });
});
