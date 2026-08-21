/* Die beiden unscharfen Checks: Beinahe-Dubletten und Begriffe ohne Seite.
   Beide melden **Kandidaten**. Deshalb wird hier vor allem geprüft, dass sie
   schweigen, wo sie nichts wissen — zwei Seiten zum selben Thema sind keine
   Dublette, und ein Wort in zwei Seiten ist kein Begriff. */

import { describe, expect, it } from 'vitest';
import {
  NEAR_DUPLICATE_THRESHOLD,
  contentWords,
  jaccard,
  missingPageCheck,
  nearDuplicateCheck,
  shingles,
} from '@core/gardener';
import { SETTINGS, moduleFixture } from './fixtures';

const LIST = `Die Angebotsliste im Kundenportal lädt bei vierhundert Einträgen langsam, weil für jede
Zeile die Berechtigungen einzeln nachgeladen werden. Ein Sammelaufruf würde die Zahl der
Abfragen von vierhundert auf eine senken und die Wartezeit unter eine Sekunde drücken.
Gemessen wurde das am Testsystem mit gefülltem und mit leerem Zwischenspeicher.`;

/* Dieselbe Seite, einmal umformuliert: zwei Sätze wörtlich, einer neu. So entsteht
   eine Beinahe-Dublette, wie sie beim zweiten Ingest derselben Quelle entsteht. */
const LIST_AGAIN = `Die Angebotsliste im Kundenportal lädt bei vierhundert Einträgen langsam, weil für jede
Zeile die Berechtigungen einzeln nachgeladen werden. Ein Sammelaufruf würde die Zahl der
Abfragen von vierhundert auf eine senken und die Wartezeit unter eine Sekunde drücken.
Nachgeprüft hat das niemand, die Vermutung stammt aus dem Gespräch am Donnerstag.`;

const TENANTS = `Ein Mandant ist eine eigene Realm-Instanz, und Gruppen gelten ausschliesslich innerhalb
einer Realm. Über Mandantengrenzen hinweg gibt es keine Vererbung von Rollen, weshalb
gemeinsame Gruppen in jedem Mandanten neu angelegt werden müssen.`;

describe('nearDuplicateCheck', () => {
  it('meldet zwei Seiten, die fast denselben Text tragen', async () => {
    const fixture = await moduleFixture('wissen', [
      { type: 'concept', slug: 'ladezeiten', title: 'Ladezeiten', summary: 'Erste', body: LIST },
      {
        type: 'concept',
        slug: 'ladezeiten-notiz',
        title: 'Ladezeiten (Notiz)',
        summary: 'Zweite',
        body: LIST_AGAIN,
      },
    ]);

    const findings = nearDuplicateCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths).toEqual([
      'modules/wissen/wiki/concepts/ladezeiten-notiz.md',
      'modules/wissen/wiki/concepts/ladezeiten.md',
    ]);
    /* Zusammengeführt wird nie etwas: der Fix öffnet beide Seiten. */
    expect(findings[0]?.fix).toEqual({
      action: 'merge',
      label: 'Beide Seiten vergleichen',
      preview: null,
    });
    /* Der Befund hält den Hash beider Dateien zum Laufzeitpunkt fest — dieselben
       Hashes, aus denen der Index rechnet. Ohne sie könnte später niemand mehr
       sagen, ob die Datei seit dem Lauf bearbeitet wurde (AC 10, zweiter Satz). */
    const { byPath } = fixture.index.index();
    for (const path of findings[0]?.paths ?? []) {
      expect(findings[0]?.hashes?.[path]).toBe(byPath.get(path)?.hash);
    }
  });

  it('schweigt bei zwei Seiten zum selben Thema mit eigenem Text', async () => {
    const fixture = await moduleFixture('wissen', [
      { type: 'concept', slug: 'ladezeiten', title: 'Ladezeiten', summary: 'Erste', body: LIST },
      {
        type: 'concept',
        slug: 'mandantentrennung',
        title: 'Mandantentrennung',
        summary: 'Zweite',
        body: TENANTS,
      },
    ]);

    expect(nearDuplicateCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('vergleicht eine Quelle nicht mit der Seite, die sie verdichtet', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'source',
        slug: 's-2026-07-01-messung',
        title: 'Messung',
        summary: 'Die Quelle',
        body: LIST,
      },
      {
        type: 'concept',
        slug: 'ladezeiten',
        title: 'Ladezeiten',
        summary: 'Verdichtet',
        body: LIST_AGAIN,
      },
    ]);

    expect(nearDuplicateCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('schweigt bei einem Paar, das per `supersedes` schon benannt ist', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'ladezeiten',
        title: 'Ladezeiten',
        summary: 'Erste',
        body: LIST,
        extra: { supersedes: ['ladezeiten-notiz'] },
      },
      {
        type: 'concept',
        slug: 'ladezeiten-notiz',
        title: 'Ladezeiten (Notiz)',
        summary: 'Zweite',
        body: LIST_AGAIN,
      },
    ]);

    expect(nearDuplicateCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('schweigt bei einem Paar, das per `contradicts` schon benannt ist — in der anderen Richtung', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'ladezeiten',
        title: 'Ladezeiten',
        summary: 'Erste',
        body: LIST,
      },
      {
        type: 'concept',
        slug: 'ladezeiten-notiz',
        title: 'Ladezeiten (Notiz)',
        summary: 'Zweite',
        body: LIST_AGAIN,
        extra: { contradicts: ['ladezeiten'] },
      },
    ]);

    expect(nearDuplicateCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('urteilt nicht über sehr kurze Seiten', async () => {
    const fixture = await moduleFixture('wissen', [
      { type: 'concept', slug: 'kurz-a', title: 'Kurz A', summary: 'A', body: 'Ein kurzer Satz.' },
      { type: 'concept', slug: 'kurz-b', title: 'Kurz B', summary: 'B', body: 'Ein kurzer Satz.' },
    ]);

    expect(nearDuplicateCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('liegt bei umformuliertem Text über, bei fremdem Text weit unter der Schwelle', () => {
    const near = shingles(contentWords(LIST_AGAIN));
    const base = shingles(contentWords(LIST));
    const other = shingles(contentWords(TENANTS));
    const shared = (a: Set<string>, b: Set<string>): number =>
      [...a].filter((entry) => b.has(entry)).length;

    expect(jaccard(base.size, near.size, shared(base, near))).toBeGreaterThan(
      NEAR_DUPLICATE_THRESHOLD,
    );
    expect(jaccard(base.size, other.size, shared(base, other))).toBeLessThan(0.05);
  });
});

const withTerm = (slug: string, sentence: string) => ({
  type: 'concept' as const,
  slug,
  title: `Seite ${slug}`,
  summary: `Einzeiler ${slug}`,
  body: sentence,
});

describe('missingPageCheck', () => {
  it('meldet einen hervorgehobenen Begriff, der in drei Seiten steht', async () => {
    const fixture = await moduleFixture('wissen', [
      withTerm('erste', 'Der Umstieg auf **Terraform** hat zwei Wochen gekostet.'),
      withTerm('zweite', 'Für die Zustandsdateien nutzen wir Terraform mit einem Fernspeicher.'),
      withTerm('dritte', 'Ohne Terraform wäre die Mandanteneinrichtung Handarbeit geblieben.'),
    ]);

    const findings = missingPageCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('Terraform');
    expect(findings[0]?.detail).toContain('3 Seiten');
    expect(findings[0]?.paths).toHaveLength(3);
    /* Eine Seite anzulegen heisst, sie zu schreiben — dafür gibt es keinen Klick. */
    expect(findings[0]?.fix).toBeNull();
  });

  it('schweigt bei zwei Seiten', async () => {
    const fixture = await moduleFixture('wissen', [
      withTerm('erste', 'Der Umstieg auf **Terraform** hat zwei Wochen gekostet.'),
      withTerm('zweite', 'Für die Zustandsdateien nutzen wir Terraform.'),
    ]);

    expect(missingPageCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('schweigt, wenn es die Seite gibt — auch unter ihrem Titel', async () => {
    const fixture = await moduleFixture('wissen', [
      withTerm('erste', 'Der Umstieg auf **Terraform** hat zwei Wochen gekostet.'),
      withTerm('zweite', 'Für die Zustandsdateien nutzen wir Terraform.'),
      withTerm('dritte', 'Ohne Terraform wäre das Handarbeit geblieben.'),
      {
        type: 'entity',
        slug: 'terraform',
        title: 'Terraform',
        summary: 'Das Werkzeug',
        body: 'Werkzeug für Infrastruktur als Code.',
      },
    ]);

    expect(missingPageCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('meldet kein Ziel, das schon als kaputter Wikilink gemeldet ist', async () => {
    const fixture = await moduleFixture('wissen', [
      withTerm('erste', 'Siehe [[device-code-flow]] für Geräte ohne Browser.'),
      withTerm('zweite', 'Auch hier wäre [[device-code-flow]] der Weg.'),
      withTerm('dritte', 'Und hier ebenfalls: [[device-code-flow]].'),
    ]);

    expect(missingPageCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('nimmt kurze Wörter und Funktionswörter nicht als Begriff', async () => {
    const fixture = await moduleFixture('wissen', [
      withTerm('erste', 'Das ist **und** ein **API** Fall, der nichts hergibt.'),
      withTerm('zweite', 'Auch hier steht und API im Text.'),
      withTerm('dritte', 'Und API kommen ein drittes Mal vor.'),
    ]);

    expect(missingPageCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });
});
