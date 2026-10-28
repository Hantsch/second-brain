/* Guards the `## Test lanes` table in CLAUDE.md: the table is the single place that says
   which command runs in which lane, so it must stay parseable and must not name a script
   that package.json does not have. Further guards on the lane map are expected to add
   describe blocks here. */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config';
import perfConfig from '../../vitest.perf.config';
import shellConfig from '../../vitest.shell.config';
import gateConfig from '../../vitest.config';
import { laneRows, type LaneRow } from './lane-table';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

function commandsOf(runs: string): string[] {
  return [...runs.matchAll(/`(npm test|npm run [\w:-]+)`/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
}

describe('test lanes table', () => {
  it('the test lanes table names every lane with its command, budget and whether it blocks', () => {
    const rows = laneRows();
    expect(rows.map((r) => r.lane).sort()).toEqual(
      ['perf', 'pr', 'release', 'release-prep', 'ui-smoke'].sort(),
    );
    const byLane = (name: string): LaneRow => {
      const row = rows.find((r) => r.lane === name);
      if (!row) throw new Error(`lane "${name}" missing from the table`);
      return row;
    };
    expect(byLane('pr').budget).toBe('6 min (warns), aim 4');
    expect(byLane('pr').blocks).toBe('yes');
    expect(byLane('release').budget).toBe('TBD (story 098)');
    expect(byLane('release').blocks).toBe('yes');
    expect(byLane('release-prep').budget).toBe('none');
    expect(byLane('release-prep').blocks).toBe('by hand');
    expect(byLane('perf').budget).toBe('warns only');
    expect(byLane('perf').blocks).toBe('no');
    expect(byLane('ui-smoke').budget).toBe('none');
    expect(byLane('ui-smoke').blocks).toBe('no');
    for (const row of rows) expect(row.runs, `${row.lane} runs`).not.toBe('');
  });

  it('every command the pr, release-prep and perf lanes name is a package.json script', () => {
    const rows = laneRows().filter((r) => ['pr', 'release-prep', 'perf'].includes(r.lane));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const commands = commandsOf(row.runs);
      expect(commands.length, `${row.lane} names a command`).toBeGreaterThan(0);
      for (const command of commands) {
        const script = command === 'npm test' ? 'test' : command.replace('npm run ', '');
        expect(packageJson.scripts, `${row.lane}: ${command}`).toHaveProperty(script);
      }
    }
  });
});

type Claim = { name: string; include: string[]; exclude: string[] };

function playwrightClaim(): Claim {
  const { testDir = '.', testMatch } = playwrightConfig;
  const patterns = testMatch === undefined ? [] : [testMatch].flat();
  // A RegExp cannot be matched against path globs; failing loudly beats a silent gap.
  if (patterns.some((p) => typeof p !== 'string')) {
    throw new Error('playwright testMatch must be strings; a RegExp cannot be checked here');
  }
  return {
    name: 'playwright',
    include: patterns.map((p) => path.posix.join(testDir, p as string)),
    exclude: [],
  };
}

const realClaims: Claim[] = [
  {
    name: 'vitest',
    include: gateConfig.test?.include ?? [],
    exclude: gateConfig.test?.exclude ?? [],
  },
  {
    name: 'vitest-perf',
    include: perfConfig.test?.include ?? [],
    exclude: perfConfig.test?.exclude ?? [],
  },
  {
    name: 'vitest-shell',
    include: shellConfig.test?.include ?? [],
    exclude: shellConfig.test?.exclude ?? [],
  },
  playwrightClaim(),
];

function claimsOf(file: string, claims: Claim[]): string[] {
  return claims
    .filter(
      (c) =>
        c.include.some((g) => path.posix.matchesGlob(file, g)) &&
        !c.exclude.some((g) => path.posix.matchesGlob(file, g)),
    )
    .map((c) => c.name);
}

function testFiles(): string[] {
  return readdirSync(new URL('../', import.meta.url), { recursive: true, encoding: 'utf8' })
    .map((f) => `tests/${f.replaceAll('\\', '/')}`)
    .filter((f) => /\.(test|spec)\./.test(path.posix.basename(f)));
}

describe('test file claims', () => {
  it('every test file under tests/ is claimed by exactly one config', () => {
    const files = testFiles();
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .map((f) => ({ f, claims: claimsOf(f, realClaims) }))
      .filter((o) => o.claims.length !== 1)
      .map((o) => `${o.f}: [${o.claims.join(', ')}]`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('a stray .test.mts file is reported as claimed by no config', () => {
    expect(claimsOf('tests/core/stray.test.mts', realClaims)).toEqual([]);
  });

  it('a file two configs claim is reported with both names', () => {
    const doubled = [...realClaims, { ...playwrightClaim(), name: 'playwright-copy' }];
    expect(claimsOf('tests/e2e/x.spec.ts', doubled)).toEqual(['playwright', 'playwright-copy']);
  });
});
