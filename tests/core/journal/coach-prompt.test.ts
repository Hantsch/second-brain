/* Die drei Haltungen des Coachs — geprüft am erzeugten System-Prompt.
 *
 * Warum so: ohne Modell lässt sich keine Antwort prüfen, wohl aber der Auftrag.
 * Deshalb zwei Richtungen, beide hart:
 *
 * 1. **Pflichtbestandteile**: jede Haltung nennt, was sie tun muss.
 * 2. **Verbote**: `listen` nennt jede Wendung aus `LISTEN_FORBIDDEN` ausdrücklich
 *    als verboten und enthält keine der Formulierungen, mit denen `tips` zu
 *    Vorschlägen auffordert. Damit ist „gibt keine Ratschläge" nachweisbar und
 *    nicht bloß behauptet.
 *
 * Der Prompt selbst ist in `src/core/llm/prompts/journal-chat.ts`; die Verbote
 * dort und die Liste hier sind dieselbe Konstante. */

import { describe, expect, it } from 'vitest';
import {
  JOURNAL_CLOSE_SCHEMA,
  LISTEN_FORBIDDEN,
  journalChatPrompt,
  journalChatSystemPrompt,
  journalClosePrompt,
} from '@core/llm/prompts';
import type { ChatTurn } from '@shared/types';

const BASE = { message: 'Der Sprint fühlt sich unmöglich an.', date: '2026-08-10' };

/** Formulierungen, die nur der Modus `tips` haben darf. */
const TIPS_ONLY = ['höchstens drei Vorschläge', 'heute machbar', 'halben Satz Begründung'];

/** Formulierungen, die nur der Modus `analyze` haben darf. */
const ANALYZE_ONLY = ['Muster über die Zeit', 'Datum des Eintrags', 'Keine Diagnosen'];

function systemOf(turns: ChatTurn[]): string {
  return turns.find((turn) => turn.role === 'system')?.content ?? '';
}

function lastUserOf(turns: ChatTurn[]): string {
  return [...turns].reverse().find((turn) => turn.role === 'user')?.content ?? '';
}

describe('journalChatSystemPrompt: listen', () => {
  const system = journalChatSystemPrompt('listen', 'de');

  it('nennt jede verbotene Wendung ausdrücklich als verboten', () => {
    expect(system).toContain('Verboten sind Wendungen wie');
    for (const phrase of LISTEN_FORBIDDEN) {
      expect(system).toContain(`"${phrase}"`);
    }
    expect(LISTEN_FORBIDDEN.length).toBeGreaterThan(5);
  });

  it('verbietet Rat, Umdeutung und Listen', () => {
    expect(system).toContain('nur zuhören');
    expect(system).toContain('Gib keine Ratschläge');
    expect(system).toContain('keine Handlungsvorschläge');
    expect(system).toContain('Keine Umdeutung ins Positive');
    expect(system).toContain('Keine Liste');
    expect(system).toContain('auch nicht als Frage verpackt');
  });

  it('verlangt Spiegelung, Bestätigung, höchstens eine Rückfrage und Kürze', () => {
    expect(system).toContain('Spiegele');
    expect(system).toContain('Bestätige die Anstrengung');
    expect(system).toContain('höchstens eine offene Rückfrage');
    expect(system).toContain('Zwei bis fünf Sätze');
    expect(system).toContain('Du-Form');
  });

  it('fordert nirgends zu Vorschlägen oder zur Musteranalyse auf', () => {
    for (const phrase of [...TIPS_ONLY, ...ANALYZE_ONLY]) {
      expect(system).not.toContain(phrase);
    }
  });
});

describe('journalChatSystemPrompt: tips', () => {
  const system = journalChatSystemPrompt('tips', 'de');

  it('hört erst zu und schlägt dann höchstens drei kleine Schritte vor', () => {
    expect(system).toContain('konkret helfen');
    expect(system).toContain('Spiegelung');
    for (const phrase of TIPS_ONLY) {
      expect(system).toContain(phrase);
    }
    expect(system).toContain('keine Ratgeber-Floskeln');
  });

  it('trägt nicht das Ratschlag-Verbot des Zuhören-Modus', () => {
    expect(system).not.toContain('Gib keine Ratschläge');
    expect(system).not.toContain('Keine Umdeutung ins Positive');
  });
});

describe('journalChatSystemPrompt: analyze', () => {
  const system = journalChatSystemPrompt('analyze', 'de');

  it('verlangt Belege mit Datum, Veränderung und keine Diagnose', () => {
    for (const phrase of ANALYZE_ONLY) {
      expect(system).toContain(phrase);
    }
    expect(system).toContain('was sich verändert hat');
    expect(system).toContain('Ohne Eintrag keine Behauptung');
    expect(system).toContain('Ferndeutung der Psyche');
  });

  it('lässt nur zählen, was dasteht', () => {
    expect(system).toContain('Zähle nur, was du zählen kannst');
    expect(system).toContain('das dritte Mal in drei Wochen');
  });
});

describe('journalChatPrompt', () => {
  it('unterscheidet die drei Haltungen deutlich', () => {
    const stances = (['listen', 'tips', 'analyze'] as const).map((mode) =>
      journalChatSystemPrompt(mode, 'de'),
    );
    expect(new Set(stances).size).toBe(3);
    /* Kein Modus ist eine Teilmenge eines anderen — sonst wäre es eine Nuance. */
    expect(stances[0]).not.toContain('Vorschläge, als kurze Liste');
    expect(stances[1]).not.toContain('nur zuhören');
    expect(stances[2]).not.toContain('nur zuhören');
  });

  it('sagt, dass die Antwort in den Tageseintrag geschrieben wird', () => {
    expect(journalChatSystemPrompt('listen', 'de')).toContain(
      'wird wortwörtlich in den Tageseintrag geschrieben',
    );
  });

  it('trennt Dokumentsprache und Antwortsprache', () => {
    const system = journalChatSystemPrompt('listen', 'de', 'en');
    expect(system).toContain('Antworte dem Nutzer auf Englisch');
    expect(system).toContain('auf Deutsch');
  });

  it('gibt Eintrag, Vorgeschichte und frühere Tage in dieser Reihenfolge mit', () => {
    const turns = journalChatPrompt(
      {
        ...BASE,
        mode: 'analyze',
        entry: 'Zäher Tag im Sprint.',
        history: [{ role: 'user', content: 'Gestern war auch viel.' }],
        earlierDays: [{ date: '2026-08-03', excerpt: 'Auch letzte Woche zu viel.' }],
      },
      'de',
    );

    expect(turns.map((turn) => turn.role)).toEqual(['system', 'user', 'user']);
    expect(turns[1]?.content).toBe('Gestern war auch viel.');
    const user = lastUserOf(turns);
    expect(user).toContain('Tag: 2026-08-10');
    expect(user).toContain('Zäher Tag im Sprint.');
    expect(user).toContain('- 2026-08-03: Auch letzte Woche zu viel.');
    expect(user.endsWith(BASE.message)).toBe(true);
  });

  it('nimmt frühere Tage nur im Modus analyze mit', () => {
    const turns = journalChatPrompt(
      { ...BASE, mode: 'tips', earlierDays: [{ date: '2026-08-03', excerpt: 'egal' }] },
      'de',
    );
    expect(lastUserOf(turns)).not.toContain('2026-08-03');
  });

  it('steht auch ohne Eintrag und ohne Vorgeschichte', () => {
    const turns = journalChatPrompt({ ...BASE, mode: 'listen' }, 'de');
    expect(turns).toHaveLength(2);
    expect(systemOf(turns).length).toBeGreaterThan(200);
  });
});

describe('journalClosePrompt', () => {
  const input = {
    text: 'Nachmittags mit Miriam das Abnahmeprotokoll durchgegangen.',
    date: '2026-08-10',
    projects: [{ slug: 'kundenportal-relaunch', title: 'Kundenportal Relaunch' }],
    people: ['Miriam'],
    tags: ['stress'],
  };

  it('verlangt nur, was dasteht — und keine Deutung', () => {
    const system = systemOf(journalClosePrompt(input, 'de'));
    expect(system).toContain('Zulässige Projekt-Slugs: kundenportal-relaunch');
    expect(system).toContain('mit der Schreibweise aus dem Text');
    expect(system).toContain('nicht, was du vermutest');
    expect(system).toContain('Keine Diagnose, keine Deutung, kein Rat');
    expect(system).toContain('Findest du nichts, gib leere Listen und null zurück');
  });

  it('gibt Bestand und Eintrag mit', () => {
    const user = lastUserOf(journalClosePrompt(input, 'de'));
    expect(user).toContain('- kundenportal-relaunch: Kundenportal Relaunch');
    expect(user).toContain('Bekannte Personen: Miriam');
    expect(user).toContain('Gebräuchliche Tags: stress');
    expect(user).toContain(input.text);
  });

  it('sagt ausdrücklich, wenn es keine Projekte gibt', () => {
    const system = systemOf(journalClosePrompt({ text: 'Kurz.', date: '2026-08-10' }, 'de'));
    expect(system).toContain('Es gibt keine Projekte');
  });

  it('beschreibt die Antwortform mit Grenzen 1 bis 5', () => {
    const properties = JOURNAL_CLOSE_SCHEMA['properties'] as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(['people', 'projects', 'mood', 'energy', 'tags']);
    expect(properties['mood']).toMatchObject({ type: ['integer', 'null'], minimum: 1, maximum: 5 });
  });
});
