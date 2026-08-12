/* Die Ein-Klick-Korrekturen. Jeder Test stellt dieselben vier Fragen:
   Was steht danach in der Datei? Was steht dort **nicht**? Lässt es sich
   zurückdrehen? Und steht es in der Chronik?

   Dazu die beiden Prüfsteine, an denen frühere Wellen gescheitert sind:
   - Nichts behauptet etwas, das nicht passiert: `merge` und die `open-*`-Aktionen
     schreiben nachweislich keine Datei.
   - Kein Text wird eingefroren: der Fix liest beim Klick neu, schreibt mit dem
     gerade gelesenen Hash und lässt eine fremde Änderung stehen. */

import { describe, expect, it } from 'vitest';
import { applyFix, auditFindings, runGardener, undoFix } from '@core/gardener';
import type { GardenerFinding, GardenerFindingKind } from '@shared/types';
import { gatewayWithReplies } from '../../helpers/llm';
import { NOW_MS, TODAY } from '../../helpers/time';
import { DEMO } from './demo-vault';
import { SETTINGS, demoFixture, moduleFixture } from './fixtures';
import type { GardenerFixture } from './fixtures';

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
