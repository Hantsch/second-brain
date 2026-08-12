/* Katalog und Prüfdatum: Index-Drift in ihren vier Formen und angestaubte Seiten.
   Geprüft wird auch, wofür es ausdrücklich **keinen** Fix gibt — eine Zeile des
   Nutzers verschiebt oder löscht die App nicht. */

import { describe, expect, it } from 'vitest';
import { indexDriftCheck, stalePageCheck } from '@core/gardener';
import { TODAY } from '../../helpers/time';
import { SETTINGS, moduleFixture } from './fixtures';

const CATALOG = 'modules/wissen/wiki/index.md';
const PAGE = 'modules/wissen/wiki/concepts/begriff.md';

const onePage = [
  {
    type: 'concept' as const,
    slug: 'begriff',
    title: 'Begriff',
    summary: 'Der Einzeiler',
    body: 'Ein Begriff, der eine Zeile im Katalog verdient.',
  },
];

describe('indexDriftCheck', () => {
  it('meldet eine Seite, die im Katalog fehlt, mit der Zeile als Vorschau', async () => {
    const fixture = await moduleFixture('wissen', [{ ...onePage[0]!, summary: undefined }]);

    const findings = indexDriftCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('Fehlt im Katalog');
    expect(findings[0]?.paths).toEqual([PAGE, CATALOG]);
    expect(findings[0]?.fix).toEqual({
      action: 'add-to-index',
      label: 'In den Katalog eintragen',
      preview: '- [[begriff]] — Ein Begriff, der eine Zeile im Katalog verdient',
    });
  });

  it('meldet einen Eintrag ohne Einzeiler und schlägt einen vor', async () => {
    const fixture = await moduleFixture('wissen', onePage, {
      catalog: '# Katalog\n\n## Begriffe\n\n- [[begriff]]\n',
    });

    const findings = indexDriftCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('ohne Einzeiler');
    expect(findings[0]?.fix?.preview).toContain('- [[begriff]] — Ein Begriff');
  });

  it('meldet die falsche Rubrik, bietet aber keinen Fix an', async () => {
    const fixture = await moduleFixture('wissen', onePage, {
      catalog: '# Katalog\n\n## Quellen\n\n- [[begriff]] — steht in der falschen Rubrik\n',
    });

    const findings = indexDriftCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('falschen Rubrik');
    expect(findings[0]?.fix).toBeNull();
  });

  it('meldet einen Eintrag ohne Seite, ohne die Zeile anzutasten', async () => {
    const fixture = await moduleFixture('wissen', onePage, {
      catalog:
        '# Katalog\n\n## Begriffe\n\n- [[begriff]] — Der Einzeiler\n- [[gelöscht]] — gibt es nicht mehr\n',
    });

    const findings = indexDriftCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('ohne Seite');
    expect(findings[0]?.paths).toEqual([CATALOG]);
    expect(findings[0]?.fix).toBeNull();
  });

  it('meldet ein Modul ohne Katalog einmal, nicht je Seite', async () => {
    const fixture = await moduleFixture(
      'wissen',
      [
        onePage[0]!,
        {
          type: 'entity' as const,
          slug: 'sache',
          title: 'Sache',
          summary: 'Zweite Seite',
          body: 'Noch eine Seite ohne Katalogeintrag.',
        },
      ],
      { catalog: null },
    );

    const findings = indexDriftCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('ohne Katalog');
    expect(findings[0]?.severity).toBe('warn');
  });

  it('schweigt bei einem vollständigen Katalog', async () => {
    const fixture = await moduleFixture('wissen', onePage);

    expect(indexDriftCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });
});

describe('stalePageCheck', () => {
  it('meldet eine Seite, deren Prüfdatum über der Schwelle liegt', async () => {
    const fixture = await moduleFixture('wissen', [
      { ...onePage[0]!, created: -300, reviewed: -200 },
    ]);

    const findings = stalePageCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('200 Tage');
    expect(findings[0]?.fix).toEqual({
      action: 'mark-reviewed',
      label: 'Als geprüft markieren',
      preview: `reviewed: ${TODAY}`,
    });
  });

  it('schweigt bei einer frisch geprüften Seite', async () => {
    const fixture = await moduleFixture('wissen', [{ ...onePage[0]!, reviewed: -10 }]);

    expect(stalePageCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('zählt bei fehlendem Prüfdatum die jüngste Spur der Datei', async () => {
    const fixture = await moduleFixture('wissen', [
      { ...onePage[0]!, created: -300, reviewed: -300, withoutReviewed: true },
    ]);

    expect(stalePageCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('folgt der eingestellten Schwelle, nicht einer festen Zahl', async () => {
    const fixture = await moduleFixture('wissen', [{ ...onePage[0]!, reviewed: -30 }]);

    const strict = stalePageCheck.run(
      fixture.ctx({ settings: { gardener: { reviewAfterDays: 14 } } }),
    );
    const relaxed = stalePageCheck.run(
      fixture.ctx({ settings: { gardener: { reviewAfterDays: 90 } } }),
    );

    expect(strict).toHaveLength(1);
    expect(relaxed).toEqual([]);
  });
});
