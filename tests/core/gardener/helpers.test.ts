/* Die kleinen Bausteine, auf denen die Checks stehen: der Einzeiler für den
   Katalog, die benannten Beziehungen, das Wortverzeichnis und der Prompt. */

import { describe, expect, it } from 'vitest';
import {
  MAX_SUMMARY_CHARS,
  WordIndex,
  catalogLine,
  catalogSummary,
  contradictionLine,
  namesContradiction,
  relatedLine,
  relationSlugs,
  summaryOfBody,
} from '@core/gardener';
import { MAX_EXCERPT_CHARS, gardenerAuditPrompt } from '@core/llm';

describe('catalogSummary', () => {
  it('nimmt den ersten Satz', () => {
    expect(catalogSummary('Rechte hängen an Rollen. Alles Feinere über Gruppen.')).toBe(
      'Rechte hängen an Rollen',
    );
  });

  it('kürzt am Wort und macht das sichtbar', () => {
    const long = `${'sehr lange begründung '.repeat(10)}Ende`;

    const summary = catalogSummary(long);

    expect(summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS + 1);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).not.toContain('  ');
  });

  it('leitet den Einzeiler aus dem ersten Absatz ab, nicht aus einer Überschrift', () => {
    const body = ['## Worum es geht', '', 'Ein Mandant ist eine eigene Realm.', ''].join('\n');

    expect(summaryOfBody(body)).toBe('Ein Mandant ist eine eigene Realm');
  });

  it('baut die Zeile, die im Katalog stehen würde', () => {
    expect(catalogLine({ slug: 'oauth2', type: 'entity', summary: 'Das Protokoll. Mehr.' })).toBe(
      '- [[oauth2]] — Das Protokoll',
    );
  });
});

describe('namesContradiction', () => {
  it('erkennt eine Beziehung im Frontmatter', () => {
    const doc = { frontmatter: { contradicts: ['altes-token-konzept'] }, body: '' };

    expect(namesContradiction(doc, 'altes-token-konzept')).toBe(true);
    expect(namesContradiction(doc, 'etwas-anderes')).toBe(false);
  });

  it('erkennt auch `supersedes` und einen Modulpfad', () => {
    const doc = { frontmatter: { supersedes: ['identity-management/altes-konzept'] }, body: '' };

    expect(relationSlugs(doc.frontmatter)).toEqual(['altes-konzept']);
    expect(namesContradiction(doc, 'altes-konzept')).toBe(true);
  });

  it('erkennt den Abschnitt in beiden Dokumentsprachen', () => {
    const german = { frontmatter: {}, body: '## Widersprüche\n\n- [[andere]] sagt etwas anderes.' };
    const english = { frontmatter: {}, body: '## Contradictions\n\n- [[andere]] says otherwise.' };
    const elsewhere = { frontmatter: {}, body: '## Notizen\n\n- [[andere]] ist verwandt.' };

    expect(namesContradiction(german, 'andere')).toBe(true);
    expect(namesContradiction(english, 'andere')).toBe(true);
    /* Ein Link irgendwo ist keine benannte Beziehung. */
    expect(namesContradiction(elsewhere, 'andere')).toBe(false);
  });
});

describe('geschriebene Zeilen', () => {
  it('folgt der Dokumentsprache', () => {
    expect(relatedLine('scim', 'de')).toBe('Bezug: [[scim]]');
    expect(relatedLine('scim', 'en')).toBe('Related: [[scim]]');
    expect(contradictionLine('alt', 'Zwölf gegen fünfzehn.', 'de')).toBe(
      '- [[alt]] widerspricht dieser Seite: Zwölf gegen fünfzehn.',
    );
    expect(contradictionLine('alt', 'Twelve against fifteen.', 'en')).toBe(
      '- [[alt]] contradicts this page: Twelve against fifteen.',
    );
  });
});

describe('WordIndex', () => {
  const index = WordIndex.from([
    { path: 'a.md', body: 'Das Rollenkonzept mit drei Rollen wurde beschlossen.' },
    { path: 'b.md', body: 'Drei Rollen reichen, sagte der Architekt.' },
    { path: 'c.md', body: 'In einem Code-Zaun steht:\n\n```\ndrei rollen\n```\n' },
  ]);

  it('findet eine Wortfolge in der richtigen Reihenfolge', () => {
    expect(index.pagesWith(['drei', 'rollen'])).toEqual(['a.md', 'b.md']);
  });

  it('findet eine umgekehrte Wortfolge nicht', () => {
    expect(index.pagesWith(['rollen', 'drei'])).toEqual([]);
  });

  it('zählt Code-Zäune nicht mit', () => {
    expect(index.wordsOf('c.md')).not.toContain('rollen');
  });

  it('gibt für ein unbekanntes Wort nichts zurück', () => {
    expect(index.pagesWith(['mandanten'])).toEqual([]);
    expect(index.pagesWith([])).toEqual([]);
  });
});

describe('gardenerAuditPrompt', () => {
  const input = {
    today: '2026-08-10',
    findings: [
      {
        id: 'orphan:abc',
        kind: 'orphan' as const,
        title: 'Verwaiste Seite: SCIM 2.0',
        paths: ['modules/m/wiki/entities/scim.md'],
      },
    ],
    pages: [
      {
        path: 'modules/m/wiki/entities/scim.md',
        title: 'SCIM 2.0',
        excerpt: 'x'.repeat(MAX_EXCERPT_CHARS + 500),
        named: ['anderes'],
      },
    ],
    candidateIds: ['near-duplicate:xyz'],
  };

  it('nennt Befunde, Kandidaten und Pfade — und kürzt lange Ausschnitte', () => {
    const [system, user] = gardenerAuditPrompt(input, 'de', 'en');

    expect(system?.content).toContain('Antworte dem Nutzer auf Englisch');
    expect(system?.content).toContain('Löse keinen Widerspruch auf');
    expect(user?.content).toContain('orphan:abc');
    expect(user?.content).toContain('near-duplicate:xyz');
    expect(user?.content).toContain('pfad: modules/m/wiki/entities/scim.md');
    expect(user?.content).toContain('bereits benannter widerspruch zu: anderes');
    expect(user?.content).toContain('[…gekürzt]');
  });

  it('sagt ehrlich, wenn es nichts zu beurteilen gibt', () => {
    const [, user] = gardenerAuditPrompt(
      { today: '2026-08-10', findings: [], pages: [], candidateIds: [] },
      'de',
      'de',
    );

    expect(user?.content).toContain('Befunde: keine.');
    expect(user?.content).toContain('Zu bestätigen oder zu verwerfen: nichts.');
  });
});
