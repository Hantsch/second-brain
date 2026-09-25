import { describe, expect, it } from 'vitest';
import {
  CLASSIFY_DUMP_SCHEMA,
  NO_EVIDENCE_MARKER,
  TITLE_TAGS_SCHEMA,
  classifyDumpPrompt,
  journalChatPrompt,
  queryAnswerPrompt,
  titleTagsPrompt,
} from '@core/llm';
import type { ChatTurn } from '@shared/types';

function systemOf(turns: ChatTurn[]): string {
  return turns.find((turn) => turn.role === 'system')?.content ?? '';
}

function lastUserOf(turns: ChatTurn[]): string {
  return [...turns].reverse().find((turn) => turn.role === 'user')?.content ?? '';
}

describe('titleTagsPrompt', () => {
  it('nennt die Dokumentsprache und die Tag-Grenze', () => {
    const turns = titleTagsPrompt({ text: 'Ein Gedanke', knownTags: ['auth0'], maxTags: 3 }, 'en');
    expect(systemOf(turns)).toContain('Englisch');
    expect(systemOf(turns)).toContain('Höchstens 3 Tags');
    expect(systemOf(turns)).toContain('auth0');
    expect(lastUserOf(turns)).toContain('Ein Gedanke');
  });

  it('kürzt sehr lange Texte', () => {
    const turns = titleTagsPrompt({ text: 'x'.repeat(5000) }, 'de');
    expect(lastUserOf(turns)).toContain('gekürzt');
    expect(lastUserOf(turns).length).toBeLessThan(4200);
  });

  it('hat ein Schema mit Titel und Tags', () => {
    expect(TITLE_TAGS_SCHEMA).toMatchObject({ required: ['title', 'tags'] });
  });
});

describe('classifyDumpPrompt', () => {
  const input = {
    text: 'Stefan muss bis Freitag das Rollenkonzept freigeben.',
    today: '2026-08-10',
    projects: [
      { slug: 'nyota-auth0-migration', title: 'Nyota Auth0 Migration', scope: 'work' as const },
    ],
    modules: ['identity-management'],
  };

  it('gibt Datum, Projekte und Module mit', () => {
    const turns = classifyDumpPrompt(input, 'de');
    expect(systemOf(turns)).toContain('2026-08-10');
    expect(lastUserOf(turns)).toContain('nyota-auth0-migration');
    expect(lastUserOf(turns)).toContain('identity-management');
    expect(lastUserOf(turns)).toContain('Stefan');
  });

  it('verlangt Zurückhaltung statt Raten', () => {
    const system = systemOf(classifyDumpPrompt(input, 'de'));
    expect(system).toContain('inbox');
    expect(system).toContain('Erfinde keine');
  });

  it('deckt im Schema die Kernfelder eines Ablage-Vorschlags ab', () => {
    const properties = Object.keys(
      (CLASSIFY_DUMP_SCHEMA as { properties: Record<string, unknown> }).properties,
    );
    expect(properties).toEqual(
      expect.arrayContaining([
        'title',
        'scope',
        'tags',
        'target',
        'reason',
        'confidence',
        'todos',
        'waitingOn',
        'entities',
      ]),
    );
  });
});

describe('queryAnswerPrompt', () => {
  const input = {
    question: 'Was weiß ich über Auth0-Rollen?',
    excerpts: [
      {
        path: 'modules/identity/wiki/concepts/rbac.md',
        title: 'RBAC',
        snippet: 'Rollen erben Berechtigungen.',
      },
    ],
  };

  it('verbietet Weltwissen und verlangt Belege als [[pfad]]', () => {
    const system = systemOf(queryAnswerPrompt(input, 'de'));
    expect(system).toContain('ausschließlich die mitgegebenen Ausschnitte');
    expect(system).toContain('Kein Weltwissen');
    expect(system).toContain('[[');
  });

  it('schreibt vor, was bei fehlendem Beleg zu sagen ist', () => {
    expect(systemOf(queryAnswerPrompt(input, 'de'))).toContain(NO_EVIDENCE_MARKER);
  });

  it('the no-evidence marker follows the reply language', () => {
    const enReply = systemOf(queryAnswerPrompt(input, 'de', 'en'));
    expect(enReply).toContain('Nothing in the vault covers that.');
    expect(enReply).not.toContain('Dazu steht nichts im Vault.');

    const deReply = systemOf(queryAnswerPrompt(input, 'en', 'de'));
    expect(deReply).toContain('Dazu steht nichts im Vault.');
  });

  it('trennt Dokumentsprache und Antwortsprache', () => {
    const system = systemOf(queryAnswerPrompt(input, 'en', 'de'));
    expect(system).toContain('Antworte dem Nutzer auf Deutsch');
    expect(system).toContain('gespeichert werden (Titel, Tags, Notizen), auf Englisch');
  });

  it('reicht die Ausschnitte mit Pfad und Titel durch', () => {
    const user = lastUserOf(queryAnswerPrompt(input, 'de'));
    expect(user).toContain('pfad: modules/identity/wiki/concepts/rbac.md');
    expect(user).toContain('Rollen erben Berechtigungen.');
    expect(user).toContain('Frage: Was weiß ich über Auth0-Rollen?');
  });

  it('sagt ausdrücklich, wenn es keine Ausschnitte gibt', () => {
    const user = lastUserOf(queryAnswerPrompt({ ...input, excerpts: [] }, 'de'));
    expect(user).toContain('(keine Ausschnitte)');
  });

  it('stellt die Vorgeschichte vor die aktuelle Frage', () => {
    const turns = queryAnswerPrompt(
      { ...input, history: [{ role: 'user', content: 'Frühere Frage' }] },
      'de',
    );
    expect(turns.map((turn) => turn.role)).toEqual(['system', 'user', 'user']);
    expect(turns[1]?.content).toBe('Frühere Frage');
    expect(turns[2]).toBeDefined();
    expect(turns[2]?.content).toContain('Frage: Was weiß ich');
  });
});

describe('journalChatPrompt', () => {
  const base = { message: 'Der Sprint fühlt sich unmöglich an.', date: '2026-08-10' };

  /* `listen` hat seit 011 keinen Prompt mehr — die Haltung fragt kein Modell
     (`tests/core/journal/coach.test.ts`), und der Typ lässt sie hier nicht zu. */

  it('fordert im Modus tips konkrete Vorschläge', () => {
    const system = systemOf(journalChatPrompt({ ...base, mode: 'tips' }, 'de'));
    expect(system).toContain('konkret helfen');
    expect(system).not.toContain('Datum des Eintrags');
  });

  it('verlangt im Modus analyze Belege über Daten', () => {
    const turns = journalChatPrompt(
      {
        ...base,
        mode: 'analyze',
        earlierDays: [{ date: '2026-08-03', excerpt: 'Auch letzte Woche zu viel.' }],
      },
      'de',
    );
    expect(systemOf(turns)).toContain('was sich wiederholt');
    expect(systemOf(turns)).toContain('Datum des Eintrags');
    expect(lastUserOf(turns)).toContain('2026-08-03');
  });

  it('unterscheidet die beiden Haltungen deutlich', () => {
    const stances = (['tips', 'analyze'] as const).map((mode) =>
      systemOf(journalChatPrompt({ ...base, mode }, 'de')),
    );
    expect(new Set(stances).size).toBe(2);
  });

  it('nimmt frühere Tage nur im Modus analyze mit', () => {
    const turns = journalChatPrompt(
      { ...base, mode: 'tips', earlierDays: [{ date: '2026-08-03', excerpt: 'egal' }] },
      'de',
    );
    expect(lastUserOf(turns)).not.toContain('2026-08-03');
  });

  it('trennt Dokumentsprache und Antwortsprache', () => {
    const system = systemOf(journalChatPrompt({ ...base, mode: 'tips' }, 'de', 'en'));
    expect(system).toContain('Antworte dem Nutzer auf Englisch');
    expect(system).toContain('auf Deutsch');
  });

  it('hängt die Vorgeschichte vor die aktuelle Nachricht', () => {
    const turns = journalChatPrompt(
      {
        ...base,
        mode: 'tips',
        history: [
          { role: 'user', content: 'Gestern war auch viel.' },
          { role: 'assistant', content: 'Ich höre.' },
        ],
      },
      'de',
    );
    expect(turns.map((turn) => turn.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(lastUserOf(turns)).toContain('unmöglich');
  });
});
