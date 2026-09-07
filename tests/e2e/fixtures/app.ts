/* The only way an e2e spec gets a running app.
 *
 * It does exactly what scripts/a11y.mjs does — ensureBuild, ensureDemoVault,
 * prepareUserData, launchApp — and deliberately owns no `_electron.launch` of
 * its own. That single launch path is the guarantee that a spec can never read
 * the author's real vault, their real ~/.claude sessions or their stored keys:
 *
 * - the vault is seeded fresh into os.tmpdir() and deleted afterwards, and the
 *   seeder points the session directories inside that throwaway vault,
 * - userData is a throwaway directory too, so there are no stored keys and no
 *   configured provider — the app runs with no model reachable,
 * - anything key-shaped is stripped from the child's environment,
 * - launchApp verifies that Electron really uses that userData directory and
 *   refuses to continue otherwise.
 *
 * One app per spec file: `app` is worker-scoped and depends on the `specId`
 * option, and Playwright starts a fresh worker whenever a worker option changes
 * between files. Every spec file therefore declares
 * `test.use({ specId: '<its own file name>' })` at the top; the check below
 * turns a forgotten or copy-pasted declaration into a failure instead of two
 * files quietly sharing one app and one vault.
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AppSession } from '../../../scripts/lib/app-harness.mjs';
import {
  ensureBuild,
  ensureDemoVault,
  launchApp,
  prepareUserData,
} from '../../../scripts/lib/app-harness.mjs';

/* AC7's runtime half: not just "no provider configured" (the static half the
   e2e-wiring guard checks) but "no request actually left the app". The built
   app loads its renderer from disk (`renderer-entry.ts#loadPage` — `loadFile`
   whenever no `ELECTRON_RENDERER_URL` dev server is set, which it never is
   here), so every legitimate request is `file://`; `about:blank` is the
   transient URL a BrowserWindow briefly holds before its first navigation,
   and `devtools://` is Chromium's own inspector, never something a spec
   triggers. Anything else — in particular any `http(s)://` URL — is a call
   this suite must never make with no model configured. */
const ALLOWED_REQUEST_URL = /^(file:\/\/|about:blank$|devtools:\/\/)/;

/* Worker-scoped like the `app` fixture itself: one Electron instance and one
   log per spec file. Populated by every page the harness can reach — the
   main window and any later one (e.g. quick-capture) — and drained by the
   `noNetworkCalls` auto-fixture after every single test, so a violation is
   attributed to the test that caused it. */
let capturedRequestUrls: string[] = [];

function watchRequests(page: Page): void {
  page.on('request', (request) => {
    const url = request.url();
    if (!ALLOWED_REQUEST_URL.test(url)) capturedRequestUrls.push(url);
  });
}

export interface AppOptions {
  /** The spec file's base name, e.g. 'smoke' in smoke.spec.ts. */
  specId: string;
  /** Passed through as `SB_E2E_STAGE_DELAY_MS` when > 0 — a spec-local way to keep a
   * gardener run open long enough to observe across a navigation (066, D4/D5). 0 (the
   * default) sets no env var, i.e. every spec but the one that opts in keeps the
   * unmodified, instant-checks behaviour. */
  stageDelayMs: number;
}

export interface AppFixtures {
  /** Root of the throwaway run: vault and userData live below it. */
  tempRoot: string;
  /** The seeded vault the app under test is opened on. */
  vaultPath: string;
  /** The running app: window, log, close. */
  app: AppSession;
}

/**
 * The open vault's `languages.ui` beats the app-level `uiLanguage`
 * (SettingsService.uiLanguage), and the seeded sample vault is German. Pinning
 * the app setting alone would leave the suite reading whatever language the
 * seeder happens to write — so the throwaway vault gets pinned too. The
 * document language stays as seeded: the sample content really is German.
 */
function pinUiLanguage(vault: string, language: 'de' | 'en'): string {
  const file = join(vault, '.secondbrain', 'settings.json');
  const settings = JSON.parse(readFileSync(file, 'utf8')) as {
    languages?: Record<string, unknown>;
  };
  settings.languages = { ...settings.languages, ui: language };
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return vault;
}

export const test = base.extend<
  { specIdMatchesFile: void; noNetworkCalls: void },
  AppOptions & AppFixtures
>({
  specId: ['', { scope: 'worker', option: true }],

  stageDelayMs: [0, { scope: 'worker', option: true }],

  specIdMatchesFile: [
    async ({ specId }, use, testInfo) => {
      const file = basename(testInfo.file).replace(/\.spec\.ts$/, '');
      if (specId !== file) {
        throw new Error(
          `${basename(testInfo.file)} must declare test.use({ specId: '${file}' }) ` +
            `(found '${specId}'). The id is what gives a spec file its own app instance ` +
            'and its own throwaway vault.',
        );
      }
      await use();
    },
    { auto: true },
  ],

  tempRoot: [
    async ({ specId }, use) => {
      ensureBuild();
      /* realpath: on some systems tmpdir() is a link (macOS /var), and the path
         the app reports back would then never equal the one we handed it. */
      const root = realpathSync(mkdtempSync(join(tmpdir(), `gaston-e2e-${specId}-`)));
      await use(root);
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        /* A directory Windows still holds open must not turn a green suite red —
           it is a leftover in the temp folder, not a failed assertion. */
        console.warn(`e2e: could not remove ${root}: ${String(error)}`);
      }
    },
    { scope: 'worker' },
  ],

  vaultPath: [
    async ({ tempRoot }, use) => {
      await use(pinUiLanguage(ensureDemoVault(join(tempRoot, 'vault')), 'en'));
    },
    { scope: 'worker' },
  ],

  app: [
    async ({ tempRoot, vaultPath, stageDelayMs }, use) => {
      const userDataDir = prepareUserData(join(tempRoot, 'userdata'), {
        vault: vaultPath,
        uiLanguage: 'en',
      });
      const extraEnv: Record<string, string> =
        stageDelayMs > 0 ? { SB_E2E_STAGE_DELAY_MS: String(stageDelayMs) } : {};
      const session = await launchApp({
        userDataDir,
        vault: vaultPath,
        withoutKeyEnv: true,
        extraEnv,
      });
      watchRequests(session.page);
      session.app.on('window', watchRequests);
      await use(session);
      await session.close();
    },
    { scope: 'worker' },
  ],

  /* Test-scoped and automatic, so it runs for every spec that touches the
     `app` fixture without any spec having to opt in — that is what makes
     this a suite-wide guarantee rather than a single spec's assertion. A
     spec that never requests `app` (the disk-only frontmatter check in
     smoke.spec.ts) never launches Electron in the first place, so there is
     nothing here to drain for it. */
  noNetworkCalls: [
    /* Playwright parses this fixture's own source to find its dependencies; it requires an
       object-destructuring pattern here, even an empty one, and rejects a plain parameter name. */
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      const found = capturedRequestUrls;
      capturedRequestUrls = [];
      expect(found, `spec made network request(s) to: ${found.join(', ')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
