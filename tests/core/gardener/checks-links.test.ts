/* Die beiden Graph-Checks: verwaiste Seiten und kaputte Wikilinks.
   Für jeden ein Bestand, der ihn auslöst — und einer, der ihn ausdrücklich nicht
   auslöst (Synthese, nur im Frontmatter belegte Quelle, Link im Code-Zaun,
   Modulgrenze, Katalog als Ziel). */

import { describe, expect, it } from 'vitest';
import { brokenLinkCheck, orphanCheck } from '@core/gardener';
import { DEMO } from './demo-vault';
import { SETTINGS, demoFixture, gardenerFixture, moduleFiles, moduleFixture } from './fixtures';

const SOURCE_SLUG = 's-2026-07-01-vortrag';

describe('orphanCheck', () => {
  it('meldet eine Seite, auf die niemand verlinkt', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'verbunden',
        title: 'Verbunden',
        summary: 'Hat einen Verweis',
        body: 'Verweist auf nichts, wird aber verlinkt.',
      },
      {
        type: 'concept',
        slug: 'verwaist',
        title: 'Verwaiste Seite',
        summary: 'Niemand verlinkt hierher',
        body: 'Diese Seite steht für sich allein.',
      },
      {
        type: 'overview',
        slug: 'overview',
        title: 'Synthese',
        summary: 'Der rote Faden',
        body: 'Der Faden führt über [[verbunden]].',
      },
    ]);

    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths[0]).toBe('modules/wissen/wiki/concepts/verwaist.md');
    expect(findings[0]?.title).toContain('Verwaiste Seite');
    /* Keine Seite nennt den Namen im Text — also keine bestimmbare Stelle, also
       kein Fix. Ein Fix, der raten müsste, wird nicht angeboten. */
    expect(findings[0]?.fix).toBeNull();
  });

  it('meldet weder die Synthese noch eine nur im Frontmatter belegte Quelle', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'source',
        slug: SOURCE_SLUG,
        title: 'Vortrag',
        summary: 'Die Quelle',
        body: 'Wortlaut der Quelle.',
      },
      {
        type: 'concept',
        slug: 'begriff',
        title: 'Begriff',
        summary: 'Belegt aus dem Vortrag',
        sources: [SOURCE_SLUG],
        body: 'Aussage ohne Wikilink auf die Quelle — der Beleg steht im Frontmatter.',
      },
      {
        type: 'overview',
        slug: 'overview',
        title: 'Synthese',
        summary: 'Der rote Faden',
        body: 'Führt über [[begriff]].',
      },
    ]);

    expect(orphanCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('bietet den Verweis-Fix nur an, wenn genau eine Seite den Namen nennt', async () => {
    const fixture = await demoFixture();

    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    /* `just-in-time-provisionierung` nennt „SCIM" im Fließtext, ohne zu verlinken. */
    expect(findings[0]?.paths).toEqual([DEMO.scim, DEMO.jit]);
    expect(findings[0]?.fix).toEqual({
      action: 'add-links',
      label: 'Verweis eintragen',
      preview: 'Bezug: [[scim]]',
    });
  });

  it('bietet keinen Fix an, wenn zwei Seiten den Namen nennen', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'kanban',
        title: 'Kanban',
        summary: 'Verwaist',
        body: 'Ein Verfahren mit Karten und Spalten.',
      },
      {
        type: 'concept',
        slug: 'erste',
        title: 'Erste Seite',
        summary: 'Nennt Kanban',
        body: 'Wir arbeiten seit einem Jahr mit Kanban, ohne es aufzuschreiben.',
      },
      {
        type: 'concept',
        slug: 'zweite',
        title: 'Zweite Seite',
        summary: 'Nennt Kanban auch',
        body: 'Im Team hat sich Kanban durchgesetzt, aber niemand pflegt die Spalten.',
      },
      {
        type: 'overview',
        slug: 'overview',
        title: 'Synthese',
        summary: 'Der rote Faden',
        body: 'Führt über [[erste]] und [[zweite]].',
      },
    ]);

    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths).toEqual(['modules/wissen/wiki/concepts/kanban.md']);
    expect(findings[0]?.fix).toBeNull();
  });
});

describe('brokenLinkCheck', () => {
  it('nennt Datei und Zeile des Ziels, das es nicht gibt', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'begriff',
        title: 'Begriff',
        summary: 'Mit kaputtem Link',
        body: 'Erste Zeile.\n\nZweite Zeile mit [[gibt-es-nicht]] darin.',
      },
    ]);
    const path = 'modules/wissen/wiki/concepts/begriff.md';
    const raw = await fixture.text(path);
    const line = raw.split('\n').findIndex((text) => text.includes('[[gibt-es-nicht]]')) + 1;

    const findings = brokenLinkCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths).toEqual([path]);
    expect(findings[0]?.title).toContain('[[gibt-es-nicht]]');
    expect(findings[0]?.detail).toContain(`Zeile ${line}`);
    expect(findings[0]?.severity).toBe('warn');
    /* Die Seite anzulegen braucht Inhalt, das Ziel umzuschreiben wäre eine
       Nutzerzeile — also kein Fix. */
    expect(findings[0]?.fix).toBeNull();
  });

  it('meldet weder Code-Zäune noch Modulgrenzen, Anzeigetexte oder den Katalog', async () => {
    const files = {
      ...moduleFiles('wissen', [
        {
          type: 'concept',
          slug: 'begriff',
          title: 'Begriff',
          summary: 'Alles heil',
          body: [
            'Ein Beispiel steht im Zaun und zählt nicht:',
            '',
            '```markdown',
            'Siehe [[gibt-es-nicht]] — nur Anschauung.',
            '```',
            '',
            'Über die Modulgrenze: [[andere/fremde]].',
            'Mit Anzeigetext: [[ziel|so heißt es hier]].',
            'Katalog und Chronik sind gültige Ziele: [[index]], [[log]].',
          ].join('\n'),
        },
        {
          type: 'concept',
          slug: 'ziel',
          title: 'Ziel',
          summary: 'Wird verlinkt',
          body: 'Das Ziel des Anzeigetexts.',
        },
      ]),
      ...moduleFiles('andere', [
        {
          type: 'concept',
          slug: 'fremde',
          title: 'Fremde Seite',
          summary: 'Aus dem anderen Modul',
          body: 'Liegt in einem anderen Modul.',
        },
      ]),
    };
    const fixture = await gardenerFixture(files);

    expect(brokenLinkCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('meldet dasselbe Ziel je Datei nur einmal', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'begriff',
        title: 'Begriff',
        summary: 'Zweimal derselbe Fehler',
        body: 'Erst [[fehlt]] und später noch einmal [[fehlt]].',
      },
    ]);

    expect(brokenLinkCheck.run(fixture.ctx({ settings: SETTINGS }))).toHaveLength(1);
  });
});
