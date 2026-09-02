/* Die beiden Graph-Checks: verwaiste Seiten und kaputte Wikilinks.
   Für jeden ein Bestand, der ihn auslöst — und einer, der ihn ausdrücklich nicht
   auslöst (Synthese, nur im Frontmatter belegte Quelle, Link im Code-Zaun,
   Modulgrenze, Katalog als Ziel). */

import { describe, expect, it } from 'vitest';
import { applyFix, brokenLinkCheck, orphanCheck, orphanTargets } from '@core/gardener';
import { condensedAreaPath, condensedProjectPath } from '@core/condense/paths';
import { projectPath } from '@core/vault/paths';
import { serialize } from '@core/vault/frontmatter';
import { NOW_MS, day } from '../../helpers/time';
import { DEMO } from './demo-vault';
import {
  SETTINGS,
  demoFixture,
  gardenerFixture,
  moduleFiles,
  moduleFixture,
  pagePathOf,
} from './fixtures';

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

  it('meldet eine verlinkte Seite in einem frischen Lauf nicht mehr — der Picker darf auf ein Ziel zeigen, das den Namen gar nicht nennt', async () => {
    const fixture = await moduleFixture('wissen', [
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
        body: 'Der Faden führt über nichts Verwandtes.',
      },
    ]);
    const orphanPath = pagePathOf('wissen', { type: 'concept', slug: 'verwaist' });

    const before = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));
    expect(before).toHaveLength(1);
    expect(before[0]?.paths).toEqual([orphanPath]);
    /* Niemand nennt „Verwaiste Seite" im Text — kein bestimmbarer Ort, also
       kein automatischer Fix; ein Mensch muss ein Ziel wählen. */
    expect(before[0]?.fix).toBeNull();

    /* Genau die Rechnung, die der Picker anstellt: `orphanTargets` ordnet die
       Überblicksseite zuerst ein — sie erwähnt den Namen der verwaisten Seite
       nirgends, ist aber ein gültiges Ziel. Darum geht es in dieser Story. */
    const pages = fixture.index.pages();
    const orphan = pages.find((page) => page.path === orphanPath);
    if (orphan === undefined) throw new Error(`Keine Wiki-Seite: ${orphanPath}`);
    const candidates = orphanTargets(pages, orphan, 'de');
    const target = candidates.targets[0]?.path;
    if (target === undefined) throw new Error('Kein Ziel für die verwaiste Seite.');
    expect(target).toBe(pagePathOf('wissen', { type: 'overview', slug: 'overview' }));

    /* Derselbe Schreibvorgang wie `gardener:linkOrphan` (`src/main/ipc/gardener.ts`):
       `paths[0]` die verwaiste Seite, `paths[1]` das gewählte Ziel, die Vorschau
       aus derselben Berechnung, die die Kandidaten geliefert hat. */
    await applyFix(
      { store: fixture.store, docLanguage: 'de', now: NOW_MS },
      {
        id: before[0]?.id ?? 'orphan',
        kind: 'orphan',
        severity: 'warn',
        title: before[0]?.title ?? '',
        detail: '',
        paths: [orphanPath, target],
        module: 'wissen',
        foundAt: before[0]?.foundAt ?? new Date(NOW_MS).toISOString(),
        fix: { action: 'add-links', label: 'Verweis eintragen', preview: candidates.line },
      },
    );
    await fixture.refresh();

    /* Ein frischer Kontext, ein frischer Lauf: nichts wurde versteckt oder
       sondergestellt, der Graph selbst hat sich geändert. */
    const after = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));
    expect(after.some((finding) => finding.paths[0] === orphanPath)).toBe(false);
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

  it('meldet ein Verdichtungs-Artefakt nicht als Waise, obwohl niemand darauf verlinkt (039, AC7)', async () => {
    // Nichts verlinkt je auf `areas/<slug>.condensed.md` — das ist der normale
    // Zustand eines Artefakts. `orphanCheck` läuft aber ausschliesslich über
    // `ctx.modules[].pages`, und dorthin gelangt das Artefakt nie: `isWikiPage()`
    // (core/index/pages.ts) verlangt `modules/*/wiki/**`, ein Area-Pfad passt nie.
    const areaSlug = 'gesundheit';
    const artifactPath = condensedAreaPath(areaSlug);
    const files = {
      ...moduleFiles('wissen', [
        {
          type: 'concept',
          slug: 'verwaist',
          title: 'Andere Waise',
          summary: 'Zeigt, dass echte Waisen weiter erkannt werden',
          body: 'Diese Seite steht für sich allein.',
        },
      ]),
      [`areas/${areaSlug}.md`]: serialize(
        { type: 'area', title: 'Gesundheit', created: day(-30), updated: day(0), tags: [] },
        'Laufen, schlafen, weniger Kaffee.\n',
      ),
      [artifactPath]: serialize(
        {
          type: 'condensed',
          title: 'Gesundheit — verdichtet',
          condensed_at: '2026-08-01T09:00:00+02:00',
          sources: [`areas/${areaSlug}.md`],
          source_hashes: {},
          created: day(-1),
          updated: day(0),
          tags: [],
        },
        'Laufen, schlafen und weniger Kaffee bleiben die drei Hebel.\n',
      ),
    };
    const fixture = await gardenerFixture(files);

    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));

    // Die echte Waise im Modul wird weiterhin gemeldet — die Abwesenheit des
    // Artefakts ist keine stille Unterdrueckung aller Befunde.
    expect(findings.some((finding) => finding.paths[0] === artifactPath)).toBe(false);
    expect(findings.some((finding) => finding.paths[0] === `areas/${areaSlug}.md`)).toBe(false);
    expect(
      findings.some((finding) => finding.paths[0] === 'modules/wissen/wiki/concepts/verwaist.md'),
    ).toBe(true);
  });

  it('meldet ein Projekt-Verdichtungs-Artefakt ebenfalls nicht als Waise (046, D3)', async () => {
    // Dieselbe Begruendung wie beim Area-Artefakt oben: `orphanCheck` laeuft
    // ausschliesslich ueber `ctx.modules[].pages`, und `isWikiPage()` (`pages.ts`)
    // verlangt `modules/*/wiki/**` — ein Projektpfad passt da nie hinein.
    const scope = 'work';
    const slug = 'nyota';
    const projPath = projectPath(scope, slug);
    const artifactPath = condensedProjectPath(scope, slug);
    const files = {
      ...moduleFiles('wissen', [
        {
          type: 'concept',
          slug: 'verwaist',
          title: 'Andere Waise',
          summary: 'Zeigt, dass echte Waisen weiter erkannt werden',
          body: 'Diese Seite steht für sich allein.',
        },
      ]),
      [projPath]: serialize(
        {
          type: 'project',
          title: 'Nyota',
          slug,
          scope,
          status: 'active',
          created: day(-30),
          updated: day(0),
          tags: [],
        },
        'Wieder aufgenommen, Kamera laeuft.\n',
      ),
      [artifactPath]: serialize(
        {
          type: 'condensed',
          title: 'Nyota — verdichtet',
          condensed_at: '2026-08-01T09:00:00+02:00',
          sources: [projPath],
          source_hashes: {},
          created: day(-1),
          updated: day(0),
          tags: [],
        },
        'Das Rollenkonzept liegt bei Stefan.\n',
      ),
    };
    const fixture = await gardenerFixture(files);

    const findings = orphanCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings.some((finding) => finding.paths[0] === artifactPath)).toBe(false);
    expect(findings.some((finding) => finding.paths[0] === projPath)).toBe(false);
    expect(
      findings.some((finding) => finding.paths[0] === 'modules/wissen/wiki/concepts/verwaist.md'),
    ).toBe(true);
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
