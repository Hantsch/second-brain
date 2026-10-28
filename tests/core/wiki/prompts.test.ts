/* Die Prompts des Wissens-Kerns. Geprueft wird, was der Vault von ihnen verlangt:
   Dokumentsprache, feste Abschnitte, Belegpflicht, und die harte Regel „nur Seiten
   aus der Liste". Ein Prompt ohne diese Saetze waere eine Einladung zum Erfinden. */

import { describe, expect, it } from 'vitest';
import {
  WIKI_INGEST_SCHEMA,
  mergeSummariesClampedChars,
  mergeSummariesPrompt,
  summarizeSourcePrompt,
  wikiIngestPrompt,
} from '@core/llm';
import { QUERY_RERANK_SCHEMA, applyOrder, rerankPrompt, summarySections } from '@core/wiki';
import type { ChatTurn } from '@shared/types';

function systemOf(turns: ChatTurn[]): string {
  return turns.find((turn) => turn.role === 'system')?.content ?? '';
}

function userOf(turns: ChatTurn[]): string {
  return [...turns].reverse().find((turn) => turn.role === 'user')?.content ?? '';
}

const SECTIONS = summarySections('de');

describe('summarySections', () => {
  it('folgt der Dokumentsprache', () => {
    expect(SECTIONS.contradictions).toBe('Widersprüche');
    expect(summarySections('en').contradictions).toBe('Contradictions');
  });
});

describe('summarizeSourcePrompt', () => {
  const input = { title: 'Kurze Token', text: 'Ein Praxisbericht.', sections: SECTIONS };

  it('verlangt die vier Abschnitte, Belege und benannte Widersprueche', () => {
    const system = systemOf(summarizeSourcePrompt(input, 'de'));
    expect(system).toContain('## Worum es geht');
    expect(system).toContain('## Tragende Aussagen');
    expect(system).toContain('## Was neu ist');
    expect(system).toContain('## Widersprüche');
    expect(system).toContain('Ohne Belegstelle keine Aussage');
    expect(system).toContain('benannt, nicht geglaettet');
    expect(system).toContain('Erfinde nichts');
  });

  it('nennt die Dokumentsprache und die Ueberschriften darin', () => {
    const system = systemOf(
      summarizeSourcePrompt({ ...input, sections: summarySections('en') }, 'en'),
    );
    expect(system).toContain('Englisch');
    expect(system).toContain('## Load-bearing claims');
  });

  /* `languages.translateSources` aus: dann bleibt der Text in der Sprache der
     Quelle, und nur die Ueberschriften stehen weiter in der Dokumentsprache. Ohne
     diesen Weg wäre der Schalter in den Einstellungen eine Behauptung. */
  it('uebersetzt nicht, wenn die Einstellung es verbietet', () => {
    const off = systemOf(summarizeSourcePrompt({ ...input, translate: false }, 'de'));
    expect(off).toContain('Schreibe in der Sprache der Quelle');
    expect(off).not.toContain('Schreibe alle Inhalte');
    /* Die Ueberschriften bleiben Format, nicht Inhalt. */
    expect(off).toContain('## Worum es geht');

    const on = systemOf(summarizeSourcePrompt({ ...input, translate: true }, 'de'));
    expect(on).toContain('Schreibe alle Inhalte');
    /* Vorgabe ist übersetzen — so war es, bevor die Einstellung einen Leser hatte. */
    expect(systemOf(summarizeSourcePrompt(input, 'de'))).toContain('Schreibe alle Inhalte');
  });

  it('haelt dieselbe Zusage beim Zusammenfuehren', () => {
    const merged = systemOf(
      mergeSummariesPrompt(
        { title: input.title, parts: ['Teil A', 'Teil B'], sections: SECTIONS, translate: false },
        'de',
      ),
    );
    expect(merged).toContain('Schreibe in der Sprache der Quelle');
  });

  it('gibt Bestand und Herkunft mit', () => {
    const turns = summarizeSourcePrompt(
      {
        ...input,
        origin: 'raw/web/2026-08-10-kurze-token.md',
        known: [{ slug: 'oauth2', title: 'OAuth 2.1', excerpt: 'PKCE ist Pflicht.' }],
      },
      'de',
    );
    expect(systemOf(turns)).toContain('raw/web/2026-08-10-kurze-token.md');
    expect(userOf(turns)).toContain('- [[oauth2]] OAuth 2.1 — PKCE ist Pflicht.');
    expect(userOf(turns)).toContain('Quelle:');
  });

  it('sagt beim Teilstueck, dass es eines ist, und kuerzt lange Texte', () => {
    const turns = summarizeSourcePrompt(
      { ...input, text: 'x'.repeat(100_000) + 'QUELLENENDE', part: { index: 2, total: 5 } },
      'de',
    );
    expect(systemOf(turns)).toContain('Abschnitt 2 von 5');
    expect(userOf(turns)).toContain('Quelle, Abschnitt 2/5:');
    expect(userOf(turns)).toContain('gekürzt');
    expect(userOf(turns)).not.toContain('QUELLENENDE');
  });

  it('mergeSummariesClampedChars zaehlt nur, was der Clamp tatsaechlich abschneidet', () => {
    // Unter der Grenze: nichts wird abgeschnitten, egal wie viele Teile.
    expect(mergeSummariesClampedChars(['kurzer Teil eins', 'kurzer Teil zwei'])).toBe(0);

    // Ueber der Grenze: der Schnitt ist die Ueberlaenge des zusammengesetzten
    // Texts (inklusive der "--- Teil N ---"-Praefixe), nicht die Laenge der
    // Eingabe selbst — sonst waere die Zahl in der Notiz eine Uebertreibung.
    const parts = ['a'.repeat(7000), 'b'.repeat(7000)];
    const joined = parts.map((part, index) => `--- Teil ${index + 1} ---\n${part}`).join('\n\n');
    const expectedCut = joined.length - 12000;
    expect(mergeSummariesClampedChars(parts)).toBe(expectedCut);
    expect(mergeSummariesClampedChars(parts)).toBeGreaterThan(0);
    // Nicht die volle Eingabelaenge — nur der Ueberhang.
    const totalInputLength = parts.reduce((sum, part) => sum + part.length, 0);
    expect(mergeSummariesClampedChars(parts)).toBeLessThan(totalInputLength);

    // Ein eigener `maxChars` wird respektiert: der Praefix "--- Teil 1 ---\n"
    // zaehlt mit, denn genau den schickt `mergeSummariesPrompt` auch ans Modell.
    const onePart = `--- Teil 1 ---\n${'x'.repeat(100)}`;
    expect(mergeSummariesClampedChars(['x'.repeat(100)], 50)).toBe(onePart.length - 50);
  });

  it('fuehrt Teilergebnisse zusammen, ohne die Regeln zu verlieren', () => {
    const turns = mergeSummariesPrompt(
      { title: 'Kurze Token', parts: ['Teil eins.', 'Teil zwei.'], sections: SECTIONS },
      'de',
    );
    expect(systemOf(turns)).toContain('Teilverdichtungen derselben Quelle');
    expect(systemOf(turns)).toContain('## Tragende Aussagen');
    expect(userOf(turns)).toContain('--- Teil 1 ---');
    expect(userOf(turns)).toContain('Teil zwei.');
  });
});

describe('wikiIngestPrompt', () => {
  const input = {
    module: 'identity-management',
    sourceSlug: 's-2026-08-10-kurze-token',
    sourceTitle: 'Kurze Token',
    summary: '## Worum es geht\n\nEin Praxisbericht.',
    pages: [{ slug: 'oauth2', title: 'OAuth 2.1', excerpt: 'PKCE ist Pflicht.' }],
  };

  it('verbietet Erfindungen und verlangt Suchen vor Anlegen', () => {
    const system = systemOf(wikiIngestPrompt(input, 'de'));
    expect(system).toContain('Suche zuerst im Bestand');
    expect(system).toContain('Beinahe-Dublette anzulegen ist ein Fehler');
    expect(system).toContain('Erfinde keine Slugs');
    expect(system).toContain('Das Modul ist identity-management');
    expect(system).toContain('(source: [[s-2026-08-10-kurze-token]])');
  });

  it('sagt ausdruecklich, dass extend nur anhaengt', () => {
    const system = systemOf(wikiIngestPrompt(input, 'de'));
    expect(system).toContain('Schreibe nichts um, wiederhole nichts, loesche nichts');
  });

  it('the ingest prompt and schema no longer ask for an overview change', () => {
    expect(JSON.stringify(WIKI_INGEST_SCHEMA)).not.toContain('overviewChange');
    const rendered = wikiIngestPrompt(input, 'de')
      .map((turn) => turn.content)
      .join('\n');
    expect(rendered).not.toContain('overviewChange');
  });

  it('reicht Bestand und Verdichtung durch, nicht den Rohtext', () => {
    const user = userOf(wikiIngestPrompt(input, 'de'));
    expect(user).toContain('- oauth2 (OAuth 2.1) — PKCE ist Pflicht.');
    expect(user).toContain('Verdichtung der Quelle:');
    expect(user).toContain('Ein Praxisbericht.');
  });

  it('nennt einen leeren Bestand ehrlich leer', () => {
    const user = userOf(wikiIngestPrompt({ ...input, pages: [] }, 'de'));
    expect(user).toContain('- (noch keine Seiten)');
  });

  it('hat ein Schema mit Seiten, Aktion und Widerspruch', () => {
    expect(WIKI_INGEST_SCHEMA).toMatchObject({ required: ['pages'] });
    const pages = (WIKI_INGEST_SCHEMA['properties'] as Record<string, unknown>)['pages'];
    const item = (pages as Record<string, unknown>)['items'] as Record<string, unknown>;
    expect(item['required']).toEqual(['slug', 'type', 'title', 'action', 'patch']);
    expect((item['properties'] as Record<string, unknown>)['contradicts']).toBeDefined();
  });
});

describe('rerankPrompt', () => {
  it('verlangt Nummern statt Antworten', () => {
    const turns = rerankPrompt('Wie lange leben Tokens?', [
      { path: 'a.md', title: 'A', snippet: 'Erster  Ausschnitt' },
      { path: 'b.md', title: 'B', snippet: 'Zweiter Ausschnitt' },
    ]);
    expect(systemOf(turns)).toContain('Gib nur Nummern zurueck');
    expect(systemOf(turns)).toContain('Antworte nicht auf die Frage');
    expect(userOf(turns)).toContain('1. A (a.md): Erster Ausschnitt');
    expect(userOf(turns)).toContain('2. B (b.md): Zweiter Ausschnitt');
    expect(QUERY_RERANK_SCHEMA).toMatchObject({ required: ['order'] });
  });

  it('sortiert und laesst weg, was das Modell nicht nennt', () => {
    expect(applyOrder(['a', 'b', 'c'], [3, 1])).toEqual(['c', 'a']);
    expect(applyOrder(['a', 'b'], [2, 2, 99, -1, 'x'])).toEqual(['b']);
  });

  it('behaelt die Reihenfolge der Suche, wenn die Antwort kein Urteil ist', () => {
    expect(applyOrder(['a', 'b'], 'kaputt')).toEqual(['a', 'b']);
    expect(applyOrder(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(applyOrder(['a', 'b'], [99, -1, 'x'])).toEqual(['a', 'b']);
  });
});
