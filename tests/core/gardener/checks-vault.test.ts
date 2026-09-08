/* Die drei Checks ausserhalb der Module: liegengebliebene Dumps, unverdichtete
   Rohquellen, laufende Projekte ohne nächsten Schritt.

   Alle drei müssen zwischen „vergessen" und „bewusst so" unterscheiden — ein
   Befund, der einen ausdrücklichen Wunsch des Nutzers anmahnt, wäre eine
   Belästigung. */

import { describe, expect, it } from 'vitest';
import {
  projectWithoutNextStepCheck,
  unfiledDumpCheck,
  unprocessedSourceCheck,
} from '@core/gardener';
import { serialize } from '@core/vault/frontmatter';
import type { ProjectStatus } from '@shared/types';
import { day, stamp } from '../../helpers/time';
import { SETTINGS, gardenerFixture } from './fixtures';

function dumpFile(slug: string, status: string, ageDays: number): Record<string, string> {
  return {
    [`inbox/${day(-ageDays)}-0900-${slug}.md`]: serialize(
      {
        type: 'dump',
        title: `Dump ${slug}`,
        created: stamp(-ageDays, '09:00'),
        origin: 'quick-capture',
        status,
        tags: [],
        scope: null,
        lang: 'de',
      },
      'Roher Text des Dumps.',
    ),
  };
}

function projectFile(
  slug: string,
  status: ProjectStatus,
  nextStep?: string,
): Record<string, string> {
  return {
    [`projects/work/${slug}/project.md`]: serialize(
      {
        type: 'project',
        title: `Projekt ${slug}`,
        slug,
        scope: 'work',
        status,
        priority: 2,
        started: day(-40),
        ...(nextStep === undefined ? {} : { next_step: nextStep }),
        tags: [],
        modules: [],
        repos: [],
        created: day(-40),
        updated: day(-2),
        lang: 'de',
      },
      '## Stand\n\nWo das Projekt steht.\n',
    ),
  };
}

function rawSource(slug: string, sourcePage: string | null): Record<string, string> {
  return {
    [`raw/web/${slug}.md`]: `# ${slug}\n\nAbgerufener Text.\n`,
    [`raw/web/${slug}.ingest.json`]: `${JSON.stringify({
      kind: 'url',
      origin: `https://example.org/${slug}`,
      ingestedAt: stamp(-5, '10:00'),
      title: `Quelle ${slug}`,
      sourcePage,
      modules: [],
    })}\n`,
  };
}

/** Eine youtube-Rohquelle ohne Transcript — der Ordner-Aufbau aus VAULT-FORMAT.md. */
function blockedYoutubeSource(slug: string): Record<string, string> {
  return {
    [`raw/youtube/${slug}/transcript.md`]: '_Kein Transcript verfuegbar._\n',
    [`raw/youtube/${slug}/.ingest.json`]: `${JSON.stringify({
      kind: 'youtube',
      origin: `https://www.youtube.com/watch?v=${slug}`,
      ingestedAt: stamp(-5, '10:00'),
      title: `Video ${slug}`,
      sourcePage: null,
      modules: [],
      transcript: { available: false, language: null, kind: null, provider: null },
    })}\n`,
  };
}

describe('unfiledDumpCheck', () => {
  it('meldet einen Dump, der die Schwelle erreicht', async () => {
    const fixture = await gardenerFixture(dumpFile('alt', 'raw', 14));

    const findings = unfiledDumpCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('14 Tage');
    expect(findings[0]?.fix).toEqual({
      action: 'open-classify',
      label: 'Zum Einordnen öffnen',
      preview: null,
    });
  });

  it('schweigt einen Tag vor der Schwelle', async () => {
    const fixture = await gardenerFixture(dumpFile('frisch', 'raw', 13));

    expect(unfiledDumpCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('meldet einen offenen Vorschlag, aber nie einen bewusst behaltenen Dump', async () => {
    const fixture = await gardenerFixture({
      ...dumpFile('vorgeschlagen', 'proposed', 30),
      ...dumpFile('behalten', 'kept', 60),
      ...dumpFile('abgelegt', 'filed', 60),
    });

    const findings = unfiledDumpCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths[0]).toContain('vorgeschlagen');
  });

  it('folgt der Schwelle aus den Einstellungen', async () => {
    const fixture = await gardenerFixture(dumpFile('mittel', 'raw', 20));

    expect(
      unfiledDumpCheck.run(fixture.ctx({ settings: { overview: { staleAfterDays: 30 } } })),
    ).toEqual([]);
    expect(
      unfiledDumpCheck.run(fixture.ctx({ settings: { overview: { staleAfterDays: 7 } } })),
    ).toHaveLength(1);
  });
});

describe('unprocessedSourceCheck', () => {
  it('meldet eine Rohquelle ohne Source-Seite', async () => {
    const fixture = await gardenerFixture(rawSource('2026-08-06-gardening', null));

    const findings = unprocessedSourceCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths).toEqual(['raw/web/2026-08-06-gardening']);
    expect(findings[0]?.fix?.action).toBe('open-ingest');
  });

  it('schweigt bei einer verdichteten Quelle', async () => {
    const fixture = await gardenerFixture(
      rawSource('2026-08-06-gardening', 's-2026-08-06-gardening'),
    );

    expect(unprocessedSourceCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('erfindet keine Quelle, wo kein Protokoll liegt', async () => {
    const fixture = await gardenerFixture({
      'raw/files/2026-08-01-ohne-protokoll/notiz.md': '# Notiz\n\nOhne .ingest.json.\n',
    });

    expect(unprocessedSourceCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });

  it('nennt den Grund, warum eine Quelle blockiert ist', async () => {
    const fixture = await gardenerFixture(blockedYoutubeSource('no-cues'));

    const findings = unprocessedSourceCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain('Kein Transcript verfügbar');
    expect(findings[0]?.fix?.action).toBe('open-ingest');
  });
});

describe('projectWithoutNextStepCheck', () => {
  it('meldet laufende Projekte ohne nächsten Schritt', async () => {
    const fixture = await gardenerFixture({
      ...projectFile('aktiv', 'active'),
      ...projectFile('wartend', 'waiting'),
    });

    const findings = projectWithoutNextStepCheck.run(fixture.ctx({ settings: SETTINGS }));

    expect(findings).toHaveLength(2);
    /* Kein Fix: den einen Satz kann nur ein Mensch formulieren. */
    expect(findings.every((finding) => finding.fix === null)).toBe(true);
  });

  it('schweigt bei Projekten mit Schritt und bei denen, die bewusst liegen', async () => {
    const fixture = await gardenerFixture({
      ...projectFile('mit-schritt', 'active', 'Rollen mit dem Kunden durchgehen'),
      ...projectFile('pausiert', 'paused'),
      ...projectFile('idee', 'idea'),
      ...projectFile('fertig', 'done'),
      ...projectFile('aufgegeben', 'dropped'),
    });

    expect(projectWithoutNextStepCheck.run(fixture.ctx({ settings: SETTINGS }))).toEqual([]);
  });
});
