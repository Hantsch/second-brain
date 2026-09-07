/* Static guard over the e2e harness (story 066, D7). None of these tests launch the
   app — they read the actual config, fixture, and profile files and assert on their
   content. That is deliberate: these are properties of the *wiring*, not of any one
   run — a real integration test would only catch a regression the next time someone
   happens to run the suite. This one catches it on `npm test`, every time.

   Per the story's Acceptance Tests mapping, the describe blocks below cover:
   AC1  — test:e2e runs playwright, and the config fails on an empty or focused run
          (forbidOnly, no passWithNoTests).
   AC2  — the fixture launches through app-harness and owns no _electron.launch of
          its own.
   AC7  — the fixture configures no provider and passes no key env (the static half;
          the runtime half — no network call happens — is asserted by the auto-fixture
          in tests/e2e/fixtures/app.ts, checked for below).
   AC8  — the profile sets "e2e: npm run test:e2e" and the README names it.
   AC9  — every spec names its steps (test.step on every test) and the list reporter
          is configured.
   AC10 — the config sets a suite-wide time budget (globalTimeout). */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);
const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, repoRoot), 'utf8');

const playwrightConfig = read('playwright.config.ts');
const packageJsonRaw = read('package.json');
const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
const fixtureSource = read('tests/e2e/fixtures/app.ts');
const aiScrumProfile = read('.claude/ai-scrum.md');
const readme = read('README.md');

describe('test:e2e is wired and the config fails on an empty or focused run', () => {
  it('package.json has a test:e2e script that runs playwright', () => {
    const script = packageJson.scripts?.['test:e2e'];
    expect(script, 'package.json is missing a "test:e2e" script').toBeDefined();
    expect(script, 'test:e2e script does not invoke playwright').toMatch(/playwright test/);
  });

  it('playwright.config.ts sets forbidOnly, so a stray .only cannot shrink the gate', () => {
    expect(playwrightConfig, 'playwright.config.ts must set forbidOnly: true').toMatch(
      /forbidOnly:\s*true/,
    );
  });

  it('playwright.config.ts configures no lenient-exit flag', () => {
    /* passWithNoTests: true would let an empty testDir report success — the exact
       failure mode forbidOnly guards against for .only, applied to "no specs at all". */
    expect(playwrightConfig, 'playwright.config.ts must not set passWithNoTests: true').not.toMatch(
      /passWithNoTests:\s*true/,
    );
  });
});

describe('the e2e fixture launches through app-harness', () => {
  it('imports ensureBuild, ensureDemoVault, prepareUserData and launchApp from scripts/lib/app-harness.mjs', () => {
    const importBlockMatch = fixtureSource.match(
      /import\s*{([^}]*)}\s*from\s*['"][^'"]*scripts\/lib\/app-harness\.mjs['"]/,
    );
    expect(
      importBlockMatch,
      'tests/e2e/fixtures/app.ts must import from scripts/lib/app-harness.mjs',
    ).not.toBeNull();

    const imported = importBlockMatch![1];
    for (const name of ['ensureBuild', 'ensureDemoVault', 'prepareUserData', 'launchApp']) {
      expect(imported, `app-harness import is missing "${name}"`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
  });

  it('owns no _electron.launch( call of its own', () => {
    expect(
      fixtureSource,
      "tests/e2e/fixtures/app.ts must not call _electron.launch( itself — that is app-harness's job",
    ).not.toMatch(/_electron\.launch\(/);
  });
});

describe('the e2e fixture configures no provider and passes no key env', () => {
  it('launches with withoutKeyEnv: true', () => {
    expect(
      fixtureSource,
      'tests/e2e/fixtures/app.ts must call launchApp with withoutKeyEnv: true so provider ' +
        'credentials are stripped from the child environment',
    ).toMatch(/withoutKeyEnv:\s*true/);
  });

  it('passes no llm/provider configuration to prepareUserData or launchApp', () => {
    expect(
      fixtureSource,
      'tests/e2e/fixtures/app.ts must not configure a provider (no "provider"/"providers" key)',
    ).not.toMatch(/\bproviders?\s*:/);
  });

  /* The static checks above only prove the fixture never *configures* a
     provider — they say nothing about whether a running spec actually
     reaches the network. This proves the runtime half exists: a
     request-listener attached to every page the harness can reach, plus an
     assertion that fails the test if anything was captured. */
  it('the e2e fixture asserts no network calls happen', () => {
    expect(
      fixtureSource,
      "tests/e2e/fixtures/app.ts must attach a request listener (page.on('request', …)) to " +
        'every page it can reach, so a spec that reaches the network is caught at runtime',
    ).toMatch(/\.on\(\s*['"]request['"]/);

    expect(
      fixtureSource,
      "tests/e2e/fixtures/app.ts must watch the app's later windows too (app.on('window', …)), " +
        'not only the main page',
    ).toMatch(/\.on\(\s*['"]window['"]/);

    expect(
      fixtureSource,
      'tests/e2e/fixtures/app.ts must assert the captured request list is empty — an auto ' +
        'fixture ({ auto: true }) that expect(...).toEqual([]) (or equivalent), so every spec ' +
        'is checked without opting in',
    ).toMatch(/auto:\s*true/);

    expect(
      fixtureSource,
      'tests/e2e/fixtures/app.ts must assert on the captured request list (toEqual([]) or ' +
        'similar) once the auto fixture runs',
    ).toMatch(/toEqual\(\s*\[\s*\]\s*\)/);
  });
});

describe('the profile sets e2e: npm run test:e2e and the README names it', () => {
  it('.claude/ai-scrum.md names the e2e verify command', () => {
    expect(
      aiScrumProfile,
      '.claude/ai-scrum.md must set "e2e: npm run test:e2e" under ## Verify',
    ).toMatch(/^e2e:\s*npm run test:e2e\s*$/m);
  });

  it('README.md mentions test:e2e in the development section', () => {
    expect(readme, 'README.md must mention "npm run test:e2e"').toMatch(/npm run test:e2e/);
  });
});

describe('every spec names its steps', () => {
  const specFiles = readdirSync(join(repoRootPath, 'tests/e2e')).filter((name) =>
    name.endsWith('.spec.ts'),
  );

  it('found at least one spec file to check', () => {
    expect(specFiles.length, 'no tests/e2e/*.spec.ts files found').toBeGreaterThan(0);
  });

  /* A whole-file substring search would pass a file with five tests and one
     test.step( call. Tightened: split the source on every top-level test(
     call — "test(" is not a substring of "test.step(" or "test.use(", so
     neither is mistaken for one — and check that the chunk up to the next
     such call, i.e. one test's own body, itself contains test.step(. A
     regex split, not a real parser, but meaningfully narrower than
     "somewhere in the file". */
  it.each(specFiles)('%s: every test( names its steps', (file) => {
    const source = read(`tests/e2e/${file}`);
    const starts: number[] = [];
    const testCallPattern = /\btest\(/g;
    let match: RegExpExecArray | null;
    while ((match = testCallPattern.exec(source)) !== null) {
      starts.push(match.index);
    }
    expect(starts.length, `${file} has no top-level test( call`).toBeGreaterThan(0);

    starts.forEach((start, index) => {
      const end = starts[index + 1] ?? source.length;
      const body = source.slice(start, end);
      const nameMatch = body.match(/test\(\s*(['"`])((?:\\.|(?!\1).)*)\1/);
      const name = nameMatch ? nameMatch[2] : `test #${index + 1} in ${file}`;
      expect(
        body,
        `"${name}" in ${file} has no test.step( call — its actions aren't named`,
      ).toMatch(/test\.step\(/);
    });
  });

  it('playwright.config.ts configures the list reporter', () => {
    expect(playwrightConfig, 'playwright.config.ts must configure the "list" reporter').toMatch(
      /reporter:\s*\[\s*\[\s*['"]list['"]/,
    );
  });
});

describe('the config sets a suite-wide time budget', () => {
  it('playwright.config.ts sets a positive globalTimeout', () => {
    const match = playwrightConfig.match(/globalTimeout:\s*([^,\n]+)/);
    expect(match, 'playwright.config.ts must set globalTimeout').not.toBeNull();
    /* The value is a numeric literal, optionally a product of two ("10 * 60_000") —
       parsed by hand rather than eval'd, since it is untrusted-looking source text
       even though it comes from our own repo. */
    const raw = match![1]!.trim();
    const factors = raw.split('*').map((part) => Number(part.trim().replace(/_/g, '')));
    const isNumeric = factors.every((factor) => Number.isFinite(factor));
    expect(isNumeric, `globalTimeout is not a parseable numeric expression: "${raw}"`).toBe(true);
    const value = factors.reduce((product, factor) => product * factor, 1);
    expect(value > 0, `globalTimeout must be a positive number, got "${raw}"`).toBe(true);
  });
});
