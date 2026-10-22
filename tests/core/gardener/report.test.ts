/* Der ganze Lauf. Drei Fragen:
   1. Findet er im Demo-Vault genau die absichtlichen Mängel — und nichts dazu?
   2. Halten Sortierung, Ausblenden und die Ehrlichkeit über `usedLlm`?
   3. Bleibt er auf 1000 Seiten unter drei Sekunden? */

import { describe, expect, it, vi } from 'vitest';
import { runGardener, sortFindings } from '@core/gardener';
import type { GardenerFinding, GardenerFindingKind } from '@shared/types';
import { serialize } from '@core/vault/frontmatter';
import { emptyGateway } from '../../helpers/llm';
import { day } from '../../helpers/time';
import { DEMO } from './demo-vault';
import { SETTINGS, demoFixture, gardenerFixture } from './fixtures';

function kinds(findings: readonly GardenerFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
  return counts;
}

function of(findings: readonly GardenerFinding[], kind: GardenerFindingKind): GardenerFinding[] {
  return findings.filter((finding) => finding.kind === kind);
}

describe('runGardener über den Demo-Bestand', () => {
  it('findet die absichtlichen Mängel — und keinen dazu', async () => {
    const fixture = await demoFixture();

    const report = await runGardener(fixture.deps(), { settings: SETTINGS });

    expect(kinds(report.findings)).toEqual({
      orphan: 1,
      'broken-link': 1,
      'index-drift': 1,
      'stale-page': 1,
      'unfiled-dump': 1,
      'unprocessed-source': 1,
      'project-without-next-step': 1,
      /* 046: jedes der drei laufenden Demo-Projekte hat Material und noch kein
         `condensed.md` — die fehlende Variante, einmal je Projekt; dazu die zwei
         Module mit Seiten und noch ohne verdichtete Uebersicht. */
      'condensation-due': 5,
    });
    expect(of(report.findings, 'orphan')[0]?.paths).toContain(DEMO.scim);
    expect(of(report.findings, 'broken-link')[0]?.title).toContain('device-code-flow');
    expect(of(report.findings, 'index-drift')[0]?.paths).toContain(DEMO.jit);
    expect(of(report.findings, 'stale-page')[0]?.paths).toEqual([DEMO.tenants]);
    expect(of(report.findings, 'unfiled-dump')[0]?.paths).toEqual([DEMO.oldDump]);
    expect(of(report.findings, 'unprocessed-source')[0]?.paths).toEqual([DEMO.rawWeb]);
    expect(of(report.findings, 'project-without-next-step')[0]?.paths).toEqual([
      DEMO.projectWithoutStep,
    ]);
    const condensation = of(report.findings, 'condensation-due').filter(
      (finding) => finding.module === null,
    );
    expect(of(report.findings, 'condensation-due').filter((f) => f.module !== null)).toHaveLength(
      2,
    );
    // Das noch nicht existierende Artefakt zuerst, `project.md` dahinter.
    expect(condensation.every((finding) => finding.paths[0]?.endsWith('/condensed.md'))).toBe(true);
    expect(condensation.map((finding) => finding.paths[1]).sort()).toEqual(
      [DEMO.pausedProject, DEMO.projectWithStep, DEMO.projectWithoutStep].sort(),
    );
  });

  it('bleibt ohne Modell deterministisch und behauptet keine Deutung', async () => {
    const fixture = await demoFixture();

    const report = await runGardener(fixture.deps(emptyGateway()), {
      settings: SETTINGS,
      useLlm: true,
    });

    expect(report.usedLlm).toBe(false);
    expect(report.advice).toEqual([]);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.healthKnown).toBe(true);
  });

  it('gibt denselben Befunden über zwei Läufe dieselben Kennungen', async () => {
    const fixture = await demoFixture();

    const first = await runGardener(fixture.deps(), { settings: SETTINGS });
    const second = await runGardener(fixture.deps(), { settings: SETTINGS });

    expect(second.findings.map((finding) => finding.id)).toEqual(
      first.findings.map((finding) => finding.id),
    );
  });

  it('blendet ausgeblendete Befunde aus und rechnet sie nicht gegen die Gesundheit', async () => {
    const fixture = await demoFixture();
    const before = await runGardener(fixture.deps(), { settings: SETTINGS });
    const dismissed = of(before.findings, 'broken-link')[0]?.id ?? '';

    const after = await runGardener(fixture.deps(), { settings: SETTINGS, dismissed: [dismissed] });

    expect(after.findings.map((finding) => finding.id)).not.toContain(dismissed);
    expect(after.findings).toHaveLength(before.findings.length - 1);
    expect(after.health).toBeGreaterThan(before.health);
  });

  it('sortiert nach Schwere, dann nach Modul, und stellt Befunde ohne Modul hinten an', () => {
    const base: Omit<GardenerFinding, 'id' | 'kind' | 'severity' | 'title' | 'module'> = {
      detail: '',
      paths: [],
      foundAt: '2026-08-10T00:00:00.000Z',
      fix: null,
    };
    const findings: GardenerFinding[] = [
      { ...base, id: 'c', kind: 'unfiled-dump', severity: 'warn', title: 'c', module: null },
      { ...base, id: 'b', kind: 'broken-link', severity: 'warn', title: 'b', module: 'zeta' },
      { ...base, id: 'a', kind: 'contradiction', severity: 'high', title: 'a', module: 'alpha' },
      { ...base, id: 'd', kind: 'orphan', severity: 'info', title: 'd', module: 'alpha' },
    ];

    expect(sortFindings(findings).map((finding) => finding.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('hat für einen leeren Vault keine Gesundheit statt einer erfundenen', async () => {
    const fixture = await gardenerFixture({ 'README.md': '# Leer\n' });

    const report = await runGardener(fixture.deps(), { settings: SETTINGS });

    expect(report.findings).toEqual([]);
    expect(report.healthKnown).toBe(false);
    expect(report.healthContributions).toEqual([]);
  });
});

/* 039, D4: die Verdichtung-faellig-Pruefung ueber einen echten, ueber
 * `IndexService` gelaufenen Bestand — anders als in `checks-condensed.test.ts`
 * (handgebauter Kontext), hier zaehlt, dass `runGardener()` selbst ohne
 * Modell dasselbe liefert und dabei keine Datei anfasst. */
const CONDENSATION_AREA_SLUG = 'ruecken';
const CONDENSATION_AREA_PATH = `areas/${CONDENSATION_AREA_SLUG}.md`;
const CONDENSATION_DAY_PATH = 'journal/2026/07/2026-07-15.md';

/** Eine Area mit Material und ganz ohne Artefakt — die "fehlende Variante". */
function condensationDueFiles(): Record<string, string> {
  return {
    [CONDENSATION_AREA_PATH]: serialize(
      { type: 'area', title: 'Rücken' },
      '## Notizen\n\n### 2026-07-28\n\nDer Rücken meldet sich bei langen Sitzungen.\n',
    ),
    [CONDENSATION_DAY_PATH]: serialize(
      {
        type: 'journal',
        title: 'Dienstag, 15. Juli 2026',
        date: '2026-07-15',
        mood: 3,
        energy: 3,
        people: [],
        projects: [],
        areas: [CONDENSATION_AREA_SLUG],
        tags: [],
        lang: 'de',
      },
      '## Tag\n\nRückenübungen gemacht.\n',
    ),
  };
}

describe('condensation-due über einen echten Bestand (039, D4)', () => {
  it('bleibt ohne Gateway und mit einem nicht verfügbaren Gateway identisch — der Check hängt an keinem Modell', async () => {
    const fixture = await gardenerFixture(condensationDueFiles());

    const withoutGateway = await runGardener(fixture.deps(), { settings: SETTINGS });
    const withUnavailableGateway = await runGardener(fixture.deps(emptyGateway()), {
      settings: SETTINGS,
      useLlm: true,
    });

    expect(of(withoutGateway.findings, 'condensation-due')).toHaveLength(1);
    expect(withUnavailableGateway.findings.map((finding) => finding.id)).toEqual(
      withoutGateway.findings.map((finding) => finding.id),
    );
    expect(withUnavailableGateway.usedLlm).toBe(false);
  });

  it('schreibt nichts in den Vault, obwohl eine Verdichtung fällig ist', async () => {
    const fixture = await gardenerFixture(condensationDueFiles());
    const writeMethods = ['write', 'create', 'writeText', 'append', 'move', 'delete'] as const;
    const spies = writeMethods.map((method) => vi.spyOn(fixture.store, method));

    const report = await runGardener(fixture.deps(), { settings: SETTINGS });

    expect(of(report.findings, 'condensation-due')).toHaveLength(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

/* 046, D2: derselbe echte-Bestand-Nachweis wie oben, hier fuer den Projekt-Arm
 * — ein laufendes Projekt mit Material und ganz ohne `condensed.md`. */
const CONDENSATION_PROJECT_SLUG = 'nyota';
const CONDENSATION_PROJECT_PATH = `projects/work/${CONDENSATION_PROJECT_SLUG}/project.md`;

function condensationDueProjectFiles(): Record<string, string> {
  return {
    [CONDENSATION_PROJECT_PATH]: serialize(
      {
        type: 'project',
        title: 'Nyota',
        slug: CONDENSATION_PROJECT_SLUG,
        scope: 'work',
        status: 'active',
        priority: 2,
        started: day(-40),
        tags: [],
        modules: [],
        repos: [],
        created: day(-40),
        updated: day(-2),
        lang: 'de',
      },
      '## Stand\n\nWieder aufgenommen, Kamera laeuft.\n',
    ),
  };
}

describe('condensation-due (Projekt-Arm) über einen echten Bestand (046, D2)', () => {
  it('bleibt ohne Gateway und mit einem nicht verfügbaren Gateway identisch — der Check hängt an keinem Modell', async () => {
    const fixture = await gardenerFixture(condensationDueProjectFiles());

    const withoutGateway = await runGardener(fixture.deps(), { settings: SETTINGS });
    const withUnavailableGateway = await runGardener(fixture.deps(emptyGateway()), {
      settings: SETTINGS,
      useLlm: true,
    });

    expect(of(withoutGateway.findings, 'condensation-due')).toHaveLength(1);
    expect(withUnavailableGateway.findings.map((finding) => finding.id)).toEqual(
      withoutGateway.findings.map((finding) => finding.id),
    );
    expect(withUnavailableGateway.usedLlm).toBe(false);
  });

  it('schreibt nichts in den Vault, obwohl eine Verdichtung fällig ist', async () => {
    const fixture = await gardenerFixture(condensationDueProjectFiles());
    const writeMethods = ['write', 'create', 'writeText', 'append', 'move', 'delete'] as const;
    const spies = writeMethods.map((method) => vi.spyOn(fixture.store, method));

    const report = await runGardener(fixture.deps(), { settings: SETTINGS });

    expect(of(report.findings, 'condensation-due')).toHaveLength(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('Laufzeit', () => {
  it('läuft über 1000 Seiten in unter drei Sekunden', async () => {
    const files: Record<string, string> = {
      'modules/gross/wiki/index.md': '# Katalog\n\n## Begriffe\n',
      'modules/gross/wiki/log.md': '# Chronik\n',
    };
    for (let at = 0; at < 1000; at += 1) {
      const slug = `seite-${String(at).padStart(4, '0')}`;
      const link = `seite-${String((at + 1) % 1000).padStart(4, '0')}`;
      files[`modules/gross/wiki/concepts/${slug}.md`] =
        `---\ntype: concept\ntitle: Seite ${at}\nmodule: gross\ncreated: ${day(-40)}\n` +
        `updated: ${day(-10)}\nreviewed: ${day(-10)}\ntags: []\nsources: []\n---\n\n` +
        `Abschnitt ${at} beschreibt Vorgang ${at} mit Kennung ${at * 7} und Schwelle ${at % 13}.\n` +
        `Verwandt ist [[${link}]]; die Messreihe ${at % 29} lag bei ${at % 97} Prozent.\n` +
        `Notiert wurde das am Tag ${at % 31} von Person ${at % 17} im Raum ${at % 11}.\n`;
    }
    const fixture = await gardenerFixture(files);

    const started = Date.now();
    const report = await runGardener(fixture.deps(), { settings: SETTINGS });
    const elapsed = Date.now() - started;

    expect(report.findings.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(3000);
  });
});
