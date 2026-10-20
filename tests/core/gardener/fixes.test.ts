/* Die Ein-Klick-Korrekturen. Jeder Test stellt dieselben vier Fragen:
   Was steht danach in der Datei? Was steht dort **nicht**? Lässt es sich
   zurückdrehen? Und steht es in der Chronik?

   Dazu die beiden Prüfsteine, an denen frühere Wellen gescheitert sind:
   - Nichts behauptet etwas, das nicht passiert: `merge` und die `open-*`-Aktionen
     schreiben nachweislich keine Datei.
   - Kein Text wird eingefroren: der Fix liest beim Klick neu, schreibt mit dem
     gerade gelesenen Hash und lässt eine fremde Änderung stehen. */

import { describe, expect, it } from 'vitest';
import { applyFix, auditFindings, orphanTargets, runGardener, undoFix } from '@core/gardener';
import { VaultConflictError } from '@core/vault';
import type { WikiStore } from '@core/wiki';
import type { GardenerFinding, GardenerFindingKind } from '@shared/types';
import { gatewayWithReplies } from '../../helpers/llm';
import { NOW_MS, TODAY } from '../../helpers/time';
import { DEMO } from './demo-vault';
import { SETTINGS, demoFixture, moduleFixture, pagePathOf } from './fixtures';
import type { FixturePage, GardenerFixture } from './fixtures';

async function findingOf(
  fixture: GardenerFixture,
  kind: GardenerFindingKind,
): Promise<GardenerFinding> {
  const report = await runGardener(fixture.deps(), { settings: SETTINGS });
  const finding = report.findings.find((candidate) => candidate.kind === kind);
  if (finding === undefined) throw new Error(`Kein Befund der Art ${kind} im Demo-Bestand.`);
  return finding;
}

function deps(fixture: GardenerFixture) {
  return { store: fixture.store, docLanguage: 'de' as const, now: NOW_MS };
}

/** Zeilen, die sich zwischen zwei Fassungen unterscheiden. */
function changedLines(before: string, after: string): string[] {
  const old = before.split('\n');
  return after.split('\n').filter((line, at) => old[at] !== line);
}

describe('applyFix: add-to-index', () => {
  it('trägt genau die vorgeschlagene Zeile ein und lässt die Seite unberührt', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'index-drift');
    const pageBefore = await fixture.text(DEMO.jit);

    const result = await applyFix(deps(fixture), finding);

    expect(result.written).toEqual([DEMO.catalog]);
    const catalog = await fixture.text(DEMO.catalog);
    expect(catalog).toContain(finding.fix?.preview ?? 'fehlt');
    expect(catalog).toContain('- [[oauth2]] — Das Protokoll, auf dem alles aufsetzt');
    expect(await fixture.text(DEMO.jit)).toBe(pageBefore);
  });

  it('schreibt einen lint-Eintrag in die Chronik des Moduls', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'index-drift');

    const result = await applyFix(deps(fixture), finding);

    expect(result.logged).toBe(DEMO.log);
    const log = await fixture.text(DEMO.log);
    expect(log).toContain(`## [${TODAY}] lint`);
    expect(log).toContain('- findings: index-drift (add-to-index)');
    /* Append-only: die älteren Einträge stehen unverändert darüber. */
    expect(log).toContain('## [2026-08-04] ingest | Blogartikel zu Token-Lebensdauern');
  });

  it('lässt sich zurückdrehen, und ein zweites Mal tut nichts', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'index-drift');
    const before = await fixture.text(DEMO.catalog);

    const result = await applyFix(deps(fixture), finding);
    expect(await fixture.text(DEMO.catalog)).not.toBe(before);

    const first = await undoFix(fixture.store, result.undoToken ?? '');
    expect(first.restored).toEqual([DEMO.catalog]);
    expect(await fixture.text(DEMO.catalog)).toBe(before);

    const second = await undoFix(fixture.store, result.undoToken ?? '');
    expect(second.restored).toEqual([]);
    expect(second.kept).toEqual([DEMO.catalog]);
    expect(await fixture.text(DEMO.catalog)).toBe(before);
  });

  it('behält eine fremde Änderung am Katalog, statt sie zu überschreiben', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'index-drift');
    const before = await fixture.text(DEMO.catalog);
    await fixture.store.writeText(
      DEMO.catalog,
      `${before}\n## Meine offenen Fragen\n\n- Erben Rollen?\n`,
    );

    await applyFix(deps(fixture), finding);

    const catalog = await fixture.text(DEMO.catalog);
    expect(catalog).toContain('## Meine offenen Fragen');
    expect(catalog).toContain('- Erben Rollen?');
    expect(catalog).toContain('[[just-in-time-provisionierung]]');
  });

  it('meldet einen überholten Befund statt blind zu schreiben', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'index-drift');
    await applyFix(deps(fixture), finding);

    await expect(applyFix(deps(fixture), finding)).rejects.toThrow(/Katalog/);
  });

  it('lässt eine gelöschte Seite nicht in den Katalog', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'index-drift');
    await fixture.store.delete(DEMO.jit);

    await expect(applyFix(deps(fixture), finding)).rejects.toThrow(/fehlt/);
  });
});

describe('applyFix: mark-reviewed', () => {
  it('ändert genau eine Zeile und lässt den Stil des Nutzers stehen', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'stale-page');
    const before = await fixture.text(DEMO.tenants);

    const result = await applyFix(deps(fixture), finding);

    expect(result.written).toEqual([DEMO.tenants]);
    const after = await fixture.text(DEMO.tenants);
    expect(changedLines(before, after)).toEqual([`reviewed: ${TODAY}`]);
  });

  it('lässt Flow-Listen und Anführungszeichen des Nutzers unverändert', async () => {
    const path = 'modules/wissen/wiki/concepts/mandantentrennung.md';
    const raw = [
      '---',
      'type: concept',
      "title: 'Mandantentrennung: ein Mandant, eine Realm'",
      'module: wissen',
      'created: 2026-01-08',
      'updated: 2026-01-22',
      'reviewed: 2026-01-22',
      'tags: [mandanten, auth] # gewachsen, bitte so lassen',
      'sources: []',
      'lang: de',
      '---',
      '',
      'Ein Mandant ist eine eigene Realm-Instanz.',
      '',
    ].join('\n');
    const fixture = await moduleFixture(
      'wissen',
      [
        {
          type: 'concept',
          slug: 'mandantentrennung',
          title: 'Mandantentrennung',
          summary: 'Ein Mandant, eine Realm',
          body: 'Platzhalter, wird überschrieben.',
        },
      ],
      { extraFiles: { [path]: raw } },
    );
    const finding = (await runGardener(fixture.deps(), { settings: SETTINGS })).findings.find(
      (candidate) => candidate.kind === 'stale-page',
    );

    await applyFix(deps(fixture), finding as GardenerFinding);

    const after = await fixture.text(path);
    expect(changedLines(raw, after)).toEqual([`reviewed: ${TODAY}`]);
    expect(after).toContain('tags: [mandanten, auth] # gewachsen, bitte so lassen');
    expect(after).toContain("title: 'Mandantentrennung: ein Mandant, eine Realm'");
  });

  it('lässt sich zurückdrehen', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'stale-page');
    const before = await fixture.text(DEMO.tenants);

    const result = await applyFix(deps(fixture), finding);
    await undoFix(fixture.store, result.undoToken ?? '');

    expect(await fixture.text(DEMO.tenants)).toBe(before);
  });

  it('markiert nicht zweimal am selben Tag', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'stale-page');
    await applyFix(deps(fixture), finding);

    await expect(applyFix(deps(fixture), finding)).rejects.toThrow(/geprueft/);
  });
});

describe('applyFix: add-links', () => {
  it('hängt den Verweis an die eine Seite, die den Namen nennt', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'orphan');
    const orphanBefore = await fixture.text(DEMO.scim);

    const result = await applyFix(deps(fixture), finding);

    expect(result.written).toEqual([DEMO.jit]);
    const page = await fixture.text(DEMO.jit);
    expect(page.trimEnd().endsWith('Bezug: [[scim]]')).toBe(true);
    expect(page).toContain(`updated: ${TODAY}`);
    /* Die verwaiste Seite selbst wird nicht angefasst. */
    expect(await fixture.text(DEMO.scim)).toBe(orphanBefore);
  });

  it('nimmt den Verweis zurück, wenn niemand die Zeile inzwischen angefasst hat', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'orphan');
    const before = await fixture.text(DEMO.jit);

    const result = await applyFix(deps(fixture), finding);
    await undoFix(fixture.store, result.undoToken ?? '');

    expect(await fixture.text(DEMO.jit)).toBe(before);
  });

  it('lässt eine seither bearbeitete Datei in Ruhe', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'orphan');
    const result = await applyFix(deps(fixture), finding);
    const edited = `${await fixture.text(DEMO.jit)}\nEine Zeile von Hand.\n`;
    await fixture.store.writeText(DEMO.jit, edited);

    const undone = await undoFix(fixture.store, result.undoToken ?? '');

    expect(undone.restored).toEqual([]);
    expect(undone.kept).toEqual([DEMO.jit]);
    expect(await fixture.text(DEMO.jit)).toBe(edited);
  });

  it('schreibt den benannten Widerspruch in den Abschnitt „Widersprüche"', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'sitzungsdauer',
        title: 'Sitzungsdauer',
        summary: 'Acht Stunden',
        body: 'Eine Sitzung läuft acht Stunden, danach ist eine neue Anmeldung nötig.',
      },
      {
        type: 'concept',
        slug: 'sitzung-kurz',
        title: 'Sitzung, kurze Fassung',
        summary: 'Eine Stunde',
        body: 'Eine Sitzung endet nach einer Stunde ohne Aktivität.',
      },
    ]);
    const ctx = fixture.ctx({ settings: SETTINGS });
    const { gateway } = gatewayWithReplies({
      'gardener-audit': JSON.stringify({
        contradictions: [
          {
            pathA: 'modules/wissen/wiki/concepts/sitzung-kurz.md',
            pathB: 'modules/wissen/wiki/concepts/sitzungsdauer.md',
            note: 'Eine Stunde gegen acht Stunden.',
          },
        ],
        confirmed: [],
        rejected: [],
        advice: [],
      }),
    });
    /* Beide Seiten kommen über einen Befund in den Prompt. */
    const audit = await auditFindings(
      ctx,
      [
        {
          id: 'seed',
          kind: 'stale-page',
          severity: 'info',
          title: 'Seite',
          detail: '',
          paths: [
            'modules/wissen/wiki/concepts/sitzung-kurz.md',
            'modules/wissen/wiki/concepts/sitzungsdauer.md',
          ],
          module: 'wissen',
          foundAt: ctx.ranAt,
          fix: null,
        },
      ],
      { gateway },
    );
    const finding = audit.contradictions[0];
    expect(finding?.fix?.action).toBe('add-links');

    const result = await applyFix(deps(fixture), finding as GardenerFinding);

    expect(result.written).toEqual(['modules/wissen/wiki/concepts/sitzung-kurz.md']);
    const page = await fixture.text('modules/wissen/wiki/concepts/sitzung-kurz.md');
    expect(page).toContain('## Widersprüche');
    expect(page).toContain(
      '- [[sitzungsdauer]] widerspricht dieser Seite: Eine Stunde gegen acht Stunden.',
    );
    /* Die andere Fassung bleibt Zeichen für Zeichen stehen. */
    expect(await fixture.text('modules/wissen/wiki/concepts/sitzungsdauer.md')).toContain(
      'Eine Sitzung läuft acht Stunden',
    );

    await expect(applyFix(deps(fixture), finding as GardenerFinding)).rejects.toThrow(/benannt/);
  });
});

/* ── Ein gewähltes Ziel (016) ───────────────────────────────────────────────
   Dieselbe Aktion wie oben, nur dass das Ziel ein Mensch gewählt hat: aus der
   Auswahl baut `gardener:linkOrphan` genau diesen Befund. Geprüft wird hier die
   Naht zwischen Lesen und Schreiben. Eine Änderung *vor* dem Aufruf ist kein
   Konflikt — die liest `addLinks` frisch mit. Ein Konflikt ist erst, was
   *während* des Aufrufs landet; genau dafür schreibt jeder Fix mit dem gerade
   gelesenen Hash. */

const PICKER_MODULE = 'wissen';

const PICKER_PAGES: FixturePage[] = [
  {
    type: 'entity',
    slug: 'scim',
    title: 'SCIM',
    summary: 'Das Bereitstellungsprotokoll',
    body: 'Ein Protokoll, um Konten zwischen Systemen abzugleichen.',
  },
  {
    type: 'overview',
    slug: 'overview',
    title: 'Überblick',
    summary: 'Was das Modul zusammenhält',
    body: 'Die Synthese über das Modul.',
  },
  {
    type: 'concept',
    slug: 'oauth2',
    title: 'OAuth2',
    summary: 'Das Protokoll darunter',
    body: 'Das Protokoll, auf dem alles aufsetzt.',
  },
];

/** Die verwaiste Seite: niemand verlinkt sie, und niemand nennt ihren Namen. */
const PICKER_ORPHAN = pagePathOf(PICKER_MODULE, { type: 'entity', slug: 'scim' });

/**
 * Ein Store, der beim Lesen von `path` **einmal** eine fremde Änderung an genau
 * dieser Datei durchlässt — der Aufrufer bekommt trotzdem den Inhalt von vorher.
 * Damit liegt die Fremdänderung in der Lücke zwischen `readCurrent` und
 * `writeText`, die von außen sonst nicht zu treffen ist.
 */
function raceOnRead(real: WikiStore, path: string, injected: string): WikiStore {
  let raced = false;
  return {
    read: (candidate) => real.read(candidate),
    readText: async (candidate) => {
      const content = await real.readText(candidate);
      if (candidate === path && !raced) {
        raced = true;
        await real.writeText(candidate, `${content ?? ''}\n${injected}\n`);
      }
      return content;
    },
    write: (input) => real.write(input),
    writeText: (candidate, content, options) => real.writeText(candidate, content, options),
    create: (candidate, frontmatter, body) => real.create(candidate, frontmatter, body),
    append: (candidate, section, content, options) =>
      real.append(candidate, section, content, options),
    exists: (candidate) => real.exists(candidate),
  };
}

interface Picked {
  finding: GardenerFinding;
  /** Die gewählte Seite — `paths[1]` des Befunds. */
  target: string;
  line: string;
}

/**
 * Genau der Befund, den `gardener:linkOrphan` (`src/main/ipc/gardener.ts`) aus
 * einer Auswahl baut: `paths[0]` die verwaiste Seite, `paths[1]` das gewählte
 * Ziel, und als Vorschau die Zeile aus derselben Berechnung, die die Kandidaten
 * geliefert hat. Die Kandidaten kommen aus `orphanTargets` — nicht aus einer
 * zweiten, handgeschriebenen Wahrheit.
 */
function pickedOrphan(fixture: GardenerFixture, orphanPath: string): Picked {
  const pages = fixture.index.pages();
  const orphan = pages.find((page) => page.path === orphanPath);
  if (orphan === undefined) throw new Error(`Keine Wiki-Seite: ${orphanPath}`);
  const candidates = orphanTargets(pages, orphan, 'de');
  const target = candidates.targets[0]?.path;
  if (target === undefined) throw new Error('Kein Ziel für die verwaiste Seite.');
  return {
    target,
    line: candidates.line,
    finding: {
      id: 'orphan-scim',
      kind: 'orphan',
      severity: 'warn',
      title: '„SCIM" wird von niemandem verlinkt',
      detail: '',
      paths: [orphanPath, target],
      module: PICKER_MODULE,
      foundAt: '2026-08-10T00:00:00.000Z',
      fix: { action: 'add-links', label: 'Verweis ergänzen', preview: candidates.line },
    },
  };
}

describe('applyFix: add-links auf ein gewähltes Ziel', () => {
  it('meldet einen Konflikt, wenn die Zieldatei zwischen Lesen und Schreiben wächst', async () => {
    const fixture = await moduleFixture(PICKER_MODULE, PICKER_PAGES);
    const picked = pickedOrphan(fixture, PICKER_ORPHAN);
    /* Die Überblicksseite steht in der Auswahl vorn (`orphan-targets.ts`). */
    expect(picked.target).toBe(pagePathOf(PICKER_MODULE, { type: 'overview', slug: 'overview' }));
    expect(picked.line).toBe('Bezug: [[scim]]');
    const before = await fixture.text(picked.target);
    const orphanBefore = await fixture.text(PICKER_ORPHAN);
    const foreign = 'Von einem anderen Prozess geschrieben.';

    const failed: unknown = await applyFix(
      { store: raceOnRead(fixture.store, picked.target, foreign), docLanguage: 'de', now: NOW_MS },
      picked.finding,
    ).catch((error: unknown) => error);

    /* `assertWritable` (`core/vault/compose.ts`) wirft, bevor etwas angefasst
       wird — und `code: 'conflict'` ist die Zusage, die bis in den Renderer
       trägt (`decodeIpcError`). */
    expect(failed).toBeInstanceOf(VaultConflictError);
    expect(failed).toMatchObject({ code: 'conflict' });
    /* Der fremde Schreibvorgang steht unverändert da, der Verweis nicht. */
    const after = await fixture.text(picked.target);
    expect(after).toBe(`${before}\n${foreign}\n`);
    expect(after).not.toContain(picked.line);
    expect(await fixture.text(PICKER_ORPHAN)).toBe(orphanBefore);
  });

  it('hängt den Verweis unter eine Änderung, die schon vor dem Klick da war', async () => {
    const fixture = await moduleFixture(PICKER_MODULE, PICKER_PAGES);
    const picked = pickedOrphan(fixture, PICKER_ORPHAN);
    const byHand = 'Eine Zeile, die der Nutzer in Obsidian geschrieben hat.';
    await fixture.store.writeText(
      picked.target,
      `${await fixture.text(picked.target)}\n${byHand}\n`,
    );

    const result = await applyFix(deps(fixture), picked.finding);

    expect(result.written).toEqual([picked.target]);
    const after = await fixture.text(picked.target);
    expect(after).toContain(byHand);
    /* Frisch gelesen heißt: der Verweis steht unter der Fremdänderung, nicht
       statt ihr. */
    expect(after.indexOf(picked.line)).toBeGreaterThan(after.indexOf(byHand));
  });
});

describe('applyFix: Aktionen, die nichts schreiben', () => {
  it('führt bei „Beide Seiten vergleichen" nichts zusammen', async () => {
    const fixture = await demoFixture();
    const finding: GardenerFinding = {
      id: 'near-1',
      kind: 'near-duplicate',
      severity: 'info',
      title: 'Beinahe-Dublette',
      detail: '',
      paths: [DEMO.token, DEMO.oldToken],
      module: DEMO.module,
      foundAt: '2026-08-10T00:00:00.000Z',
      fix: { action: 'merge', label: 'Beide Seiten vergleichen', preview: null },
    };
    const before = [await fixture.text(DEMO.token), await fixture.text(DEMO.oldToken)];

    const result = await applyFix(deps(fixture), finding);

    expect(result.written).toEqual([]);
    expect(result.open).toEqual([DEMO.token, DEMO.oldToken]);
    expect(result.undoToken).toBeNull();
    expect(result.logged).toBeNull();
    expect([await fixture.text(DEMO.token), await fixture.text(DEMO.oldToken)]).toEqual(before);
  });

  it('öffnet den Dump, statt ihn einzuordnen', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'unfiled-dump');
    const before = await fixture.text(DEMO.oldDump);

    const result = await applyFix(deps(fixture), finding);

    expect(result.written).toEqual([]);
    expect(result.open).toEqual([DEMO.oldDump]);
    expect(await fixture.text(DEMO.oldDump)).toBe(before);
  });

  it('öffnet die Quelle, statt sie zu verdichten', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'unprocessed-source');

    const result = await applyFix(deps(fixture), finding);

    expect(result.written).toEqual([]);
    expect(result.open).toEqual([DEMO.rawWeb]);
    expect(result.undoToken).toBeNull();
  });

  it('weigert sich bei einem Befund ohne Fix', async () => {
    const fixture = await demoFixture();
    const finding = await findingOf(fixture, 'project-without-next-step');

    await expect(applyFix(deps(fixture), finding)).rejects.toThrow(/keinen Fix/);
  });
});
