/* Perf lane: a gardener run over 1000 linked wiki pages. */

import { describe, expect, it } from 'vitest';
import { runGardener } from '@core/gardener';
import { reportBudget } from '../../helpers/perf';
import { day } from '../../helpers/time';
import { SETTINGS, gardenerFixture } from './fixtures';

describe('Laufzeit', () => {
  it('läuft über 1000 Seiten in unter drei Sekunden', async ({ annotate }) => {
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
    await reportBudget({ annotate }, 'gardener over 1000 pages', elapsed, 3000);
  });
});
