/* The help module is Gaston's own content: the gardener neither reports on it nor
 * counts it. Only a module.md that carries the `managed_by: gaston` marker is Gaston's
 * — the same folder name without the marker is the user's and stays checked. */

import { describe, expect, it } from 'vitest';
import { runGardener } from '@core/gardener';
import { serialize } from '@core/vault/frontmatter';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { day } from '../../helpers/time';
import { SETTINGS, gardenerFixture, moduleFiles } from './fixtures';
import type { FixturePage } from './fixtures';

const HELP_PREFIX = `modules/${HELP_MODULE_SLUG}/`;

/** Reviewed far beyond the 120-day threshold, so the stale-page check fires on it. */
const STALE_PAGE: FixturePage = {
  type: 'concept',
  slug: 'veraltet',
  title: 'Veraltet',
  body: 'Seit langem nicht geprüft.\n',
  reviewed: -400,
  summary: 'Alt',
};

const FRESH_PAGE: FixturePage = {
  type: 'concept',
  slug: 'frisch',
  title: 'Frisch',
  body: 'Geprüft.\n',
  summary: 'Neu',
};

function moduleMd(managed: boolean): string {
  return serialize(
    {
      type: 'note',
      title: HELP_MODULE_SLUG,
      slug: HELP_MODULE_SLUG,
      description: 'Hilfe',
      created: day(-60),
      updated: day(0),
      tags: [],
      lang: 'de',
      ...(managed ? { managed_by: 'gaston' } : {}),
    },
    'Hilfe.\n',
  );
}

function helpModuleFiles(managed: boolean): Record<string, string> {
  return moduleFiles(HELP_MODULE_SLUG, [STALE_PAGE], {
    extraFiles: { [`${HELP_PREFIX}module.md`]: moduleMd(managed) },
  });
}

const ordinary = (): Record<string, string> => moduleFiles('ordinary', [FRESH_PAGE]);

const run = async (files: Record<string, string>) => {
  const fx = await gardenerFixture(files);
  return runGardener(fx.deps(), { settings: SETTINGS });
};

const touchesHelp = (finding: { paths: string[]; module: string | null }): boolean =>
  finding.module === HELP_MODULE_SLUG || finding.paths.some((path) => path.startsWith(HELP_PREFIX));

describe('gardener and the help module', () => {
  it('a defective help-module page yields no finding', async () => {
    const control = await run({ ...ordinary(), ...moduleFiles('other', [STALE_PAGE]) });
    expect(control.findings.some((finding) => finding.kind === 'stale-page')).toBe(true);

    const report = await run({ ...ordinary(), ...helpModuleFiles(true) });

    expect(report.findings.filter(touchesHelp)).toEqual([]);
  });

  it('the health score is the same with and without the help module', async () => {
    const without = await run(ordinary());
    const withHelp = await run({ ...ordinary(), ...helpModuleFiles(true) });

    expect(withHelp.health).toBe(without.health);
    expect(withHelp.healthContributions).toEqual(without.healthContributions);
  });

  it('an unmarked user module named gaston-help is still checked', async () => {
    const report = await run({ ...ordinary(), ...helpModuleFiles(false) });

    expect(report.findings.some((finding) => touchesHelp(finding))).toBe(true);
  });
});
