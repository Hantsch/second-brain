/* The only way an e2e spec gets a running app.
 *
 * It does exactly what scripts/verify.mjs does — ensureBuild, ensureDemoVault,
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

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { UpdateFileFixture } from '../../../src/main/update/e2e-fixture';
import type { AppSession } from '../../../scripts/lib/app-harness.mjs';
import {
  ensureBuild,
  ensureDemoVault,
  launchApp,
  prepareUserData,
  REPO_ROOT,
} from '../../../scripts/lib/app-harness.mjs';

/* Electron's own path, resolved from plain Node — `require('electron')` returns the
   path to the platform binary when required outside an Electron process, which is
   exactly what this file is: it runs under Playwright's Node test runner, not inside
   Electron. This file is real ESM (see `import.meta.url` below), so `require` needs
   `createRequire` rather than the CommonJS global, which doesn't exist here. */
const require = createRequire(import.meta.url);
const electronBinaryPath = require('electron') as unknown as string;

const MAIN_ENTRY = 'out/main/index.cjs';

/**
 * Proves a second app start against an already-running instance (058, D-m):
 * `_electron.launch` expects a window from the child, which a refused second
 * instance never opens (the single-instance lock rejects it immediately and it
 * calls `app.quit()`), so this spawns the real Electron binary directly and just
 * waits for it to exit. Reuses the same `--user-data-dir` the primary `app`
 * fixture's instance is holding — that is what the OS-level single-instance lock
 * is keyed on.
 */
export async function launchSecondInstance(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<number | null> {
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    electronBinaryPath,
    [join(REPO_ROOT, MAIN_ENTRY), `--user-data-dir=${userDataDir}`],
    { cwd: REPO_ROOT, env, stdio: 'ignore' },
  );
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
}

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

/** The subset of `FakeProviderOptions` (`src/core/llm/providers/fake.ts`) an e2e spec can
 * script through the `SB_E2E_FAKE_PROVIDER` seam (073, D1) — replies keyed by `TaskKind`,
 * an artificial delay, or a blanket failure. */
export interface FakeProviderScript {
  replies?: Record<string, string>;
  latencyMs?: number;
  failEverything?: string;
}

/** One entry of the `SB_E2E_FETCH_FIXTURE` manifest (064, D6): a fixed request URL
 * answered from a local fixture HTML file, never a real request. Mirrors
 * `FetchFixtureResponse` in `src/main/ipc/fetch-e2e-fixture.ts`. */
export interface FetchFixtureResponse {
  url: string;
  /** Base name of a file under `tests/e2e/fixtures/pages/`, or an absolute path. */
  file: string;
  contentType?: string;
  status?: number;
}

export interface FetchFixtureManifest {
  responses: FetchFixtureResponse[];
}

export interface AppOptions {
  /** The spec file's base name, e.g. 'smoke' in smoke.spec.ts. */
  specId: string;
  /** Passed through as `SB_E2E_STAGE_DELAY_MS` when > 0 — a spec-local way to keep a
   * gardener run open long enough to observe across a navigation (066, D4/D5). 0 (the
   * default) sets no env var, i.e. every spec but the one that opts in keeps the
   * unmodified, instant-checks behaviour. */
  stageDelayMs: number;
  /** Passed through as `SB_E2E_INGEST_DELAY_MS` when > 0 — a spec-local way to hold a
   * digestion at the boundary between the raw phase and the wiki write long enough to
   * drive a real window close into it (050, D9). 0 (the default) sets no env var, i.e.
   * every spec but the one that opts in keeps the unmodified, no-pause digestion. The
   * pause ends early on the job's own stop (`ipc/ingest.ts#holdBetweenPhases`), so a
   * generous value costs a spec nothing once it cancels the import. */
  ingestDelayMs: number;
  /** Passed through as `SB_E2E_TASKS_FIXTURE=1` when true — opts into the synthetic
   * running/waiting/failed task set `tasks-e2e-fixture.ts` enqueues onto the real
   * work queue (072, D5). `false` (the default) sets no env var, i.e. every spec but
   * the one that opts in sees the empty queue a real session starts with. */
  tasksFixture: boolean;
  /** When set, wires up a deterministic, offline `fake` provider (073, D1): the script
   * is written to a JSON file passed as `SB_E2E_FAKE_PROVIDER`, and the vault's settings
   * get a `kind: 'fake'` provider plus routing that points every task tier at it. `undefined`
   * (the default) touches neither the environment nor the vault — every spec that doesn't
   * opt in keeps running with no model configured, exactly as before this seam existed. */
  fakeProvider: FakeProviderScript | undefined;
  /** When set, wires up the offline `SB_E2E_FETCH_FIXTURE` seam (064, D6): the manifest is
   * written to a JSON file passed as `SB_E2E_FETCH_FIXTURE`, each entry's `file` resolved to
   * an absolute path under `tests/e2e/fixtures/pages/`. `undefined` (the default) touches
   * neither the environment nor the vault — every spec that doesn't opt in keeps getting the
   * real global `fetch` (still blocked from making a real request by `noNetworkCalls` unless
   * it never tries to fetch anything, exactly as before this seam existed). */
  fetchFixture: FetchFixtureManifest | undefined;
  /** Passed through as `SB_E2E_UPDATE_FIXTURE`: comma-separated update-check outcomes
   * (offline|http|up-to-date|available), consumed one per check, the last repeating. It
   * also makes checks supported in the unpackaged e2e app. `undefined` (the default) sets
   * no env var, so the app reports that checks are off in this build. An object scripts the
   * whole check/download/install flow instead: it is written to a JSON file whose path is the
   * env value, and `writeUpdateFixture` rewrites it between steps. */
  updateFixture: string | UpdateFileFixture | undefined;
  /** Passed through to `prepareUserData` as `closeToTray` (058, D1): whether closing the
   * main window sends the app to the tray instead of quitting. `true` (the default)
   * matches the app-level default in `settings-defaults.ts`, so every spec but the ones
   * that specifically exercise the window-close quit door (058, D-k) keeps close-to-tray
   * on, same as a real install. */
  closeToTray: boolean;
  /** Passed through to `prepareUserData` as `startMinimized` (058, D1): whether the app
   * starts hidden in the tray instead of showing its main window. `false` (the default)
   * keeps the window visible for every spec that doesn't specifically test the
   * start-minimized path. */
  startMinimized: boolean;
  /** Registers the global quick-capture hotkey (`SB_E2E_HOTKEY=1`), on
   * `E2E_HOTKEY_CHORD` rather than the seeded default. `false` (the default)
   * leaves the hotkey unregistered, like every verification run: a run must not
   * claim a system-wide key while the developer types, and the default chord is
   * usually held by the developer's own Gaston anyway. */
  hotkey: boolean;
}

/** The chord a `hotkey: true` spec registers — deliberately not one a real
 * install (or anything else on the machine) is likely to hold. */
export const E2E_HOTKEY_CHORD = 'Control+Alt+Shift+F9';

export interface AppFixtures {
  /** Root of the throwaway run: vault and userData live below it. */
  tempRoot: string;
  /** The seeded vault the app under test is opened on. */
  vaultPath: string;
  /** The running app: window, log, close. */
  app: AppSession;
  /** Rewrites the file-mode update fixture; the app re-reads it on its next check or download. */
  writeUpdateFixture: (next: UpdateFileFixture) => void;
}

const UPDATE_FIXTURE_FILE = 'update-fixture.json';

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

/** Points the throwaway vault's quick-capture shortcut at `E2E_HOTKEY_CHORD`. */
function pinHotkey(vault: string): void {
  const file = join(vault, '.secondbrain', 'settings.json');
  const settings = JSON.parse(readFileSync(file, 'utf8')) as { capture?: Record<string, unknown> };
  settings.capture = { ...settings.capture, quickCaptureShortcut: E2E_HOTKEY_CHORD };
  writeFileSync(
    file,
    `${JSON.stringify(settings, null, 2)}
`,
    'utf8',
  );
}

/** Id/model of the one provider `pinFakeProvider` writes — shared so callers that assert
 * on the routed model don't have to guess the fixture's naming. */
const FAKE_PROVIDER_ID = 'fake-e2e';
const FAKE_PROVIDER_MODEL = 'fake-e2e-model';

/**
 * Writes a `kind: 'fake'` provider into the throwaway vault's settings, with every model
 * tier routed to it — the same place/mechanism `pinUiLanguage` writes `languages` (merge,
 * not replace, and the seeded settings.json is read back so `providers`/`routing` from
 * `scripts/seed/internal.mjs` — `providers: []`, `routing: { tasks: {}, defaults: {} }` —
 * are overwritten only for this one purpose). Every task kind resolves through
 * `routing.defaults[tier]` (`RoutingGateway.resolve`, `src/core/llm/gateway.ts`) since
 * `routing.tasks` stays empty, so this covers whatever task kind a spec exercises without
 * this fixture having to enumerate `TaskKind` itself.
 */
function pinFakeProvider(vault: string): void {
  const file = join(vault, '.secondbrain', 'settings.json');
  const settings = JSON.parse(readFileSync(file, 'utf8')) as {
    providers?: unknown[];
    routing?: unknown;
  };
  const ref = { providerId: FAKE_PROVIDER_ID, model: FAKE_PROVIDER_MODEL };
  settings.providers = [
    {
      id: FAKE_PROVIDER_ID,
      label: 'Fake (e2e)',
      kind: 'fake',
      baseUrl: '',
      hasKey: false,
      local: true,
      enabled: true,
      models: [FAKE_PROVIDER_MODEL],
      createdAt: new Date().toISOString(),
    },
  ];
  settings.routing = { tasks: {}, defaults: { cheap: ref, balanced: ref, strong: ref } };
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

/** Writes the fake-provider script to a JSON file in the fixture's temp dir and returns
 * its path — the value the launched app's `env` passes on as `SB_E2E_FAKE_PROVIDER`. */
function writeFakeProviderScript(tempRoot: string, script: FakeProviderScript): string {
  const file = join(tempRoot, 'fake-provider.json');
  writeFileSync(file, JSON.stringify(script), 'utf8');
  return file;
}

/** Local fixture HTML files a `fetchFixture` manifest entry's `file` resolves against
 * when it isn't already absolute — `tests/e2e/fixtures/pages/`. */
const FETCH_FIXTURE_PAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'pages');

/** Writes the fetch-fixture manifest to a JSON file in the fixture's temp dir, resolving
 * every entry's `file` to an absolute path first, and returns the manifest's own path — the
 * value the launched app's `env` passes on as `SB_E2E_FETCH_FIXTURE`
 * (`src/main/ipc/fetch-e2e-fixture.ts`). */
function writeFetchFixtureManifest(tempRoot: string, manifest: FetchFixtureManifest): string {
  const file = join(tempRoot, 'fetch-fixture.json');
  const resolved: FetchFixtureManifest = {
    responses: manifest.responses.map((entry) => ({
      ...entry,
      file: isAbsolute(entry.file) ? entry.file : resolvePath(FETCH_FIXTURE_PAGES_DIR, entry.file),
    })),
  };
  writeFileSync(file, JSON.stringify(resolved), 'utf8');
  return file;
}

/** Writes the file-mode update fixture and returns its path (the env var's value). */
function writeUpdateFixtureFile(tempRoot: string, fixture: UpdateFileFixture): string {
  const file = join(tempRoot, UPDATE_FIXTURE_FILE);
  writeFileSync(file, JSON.stringify(fixture), 'utf8');
  return file;
}

export const test = base.extend<
  { specIdMatchesFile: void; noNetworkCalls: void },
  AppOptions & AppFixtures
>({
  specId: ['', { scope: 'worker', option: true }],

  stageDelayMs: [0, { scope: 'worker', option: true }],

  ingestDelayMs: [0, { scope: 'worker', option: true }],

  tasksFixture: [false, { scope: 'worker', option: true }],

  fakeProvider: [undefined, { scope: 'worker', option: true }],

  fetchFixture: [undefined, { scope: 'worker', option: true }],

  updateFixture: [undefined, { scope: 'worker', option: true }],

  writeUpdateFixture: [
    async ({ tempRoot }, use) => {
      await use((next) => void writeUpdateFixtureFile(tempRoot, next));
    },
    { scope: 'worker' },
  ],

  closeToTray: [true, { scope: 'worker', option: true }],

  startMinimized: [false, { scope: 'worker', option: true }],

  hotkey: [false, { scope: 'worker', option: true }],

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
    async (
      {
        tempRoot,
        vaultPath,
        stageDelayMs,
        ingestDelayMs,
        tasksFixture,
        fakeProvider,
        fetchFixture,
        updateFixture,
        closeToTray,
        startMinimized,
        hotkey,
      },
      use,
    ) => {
      if (fakeProvider) pinFakeProvider(vaultPath);
      if (hotkey) pinHotkey(vaultPath);
      const userDataDir = prepareUserData(join(tempRoot, 'userdata'), {
        vault: vaultPath,
        uiLanguage: 'en',
        closeToTray,
        startMinimized,
      });
      const extraEnv: Record<string, string> = {
        /* Not read by anything yet (058, D1 just plumbs it through) — later tray e2e
           specs read `process.env.SB_E2E_TRAY === '1'` in the app to know they're
           running under the e2e harness. Set unconditionally, unlike the other
           `SB_E2E_*` vars below, since every spec that touches the `app` fixture is a
           candidate for exercising tray behaviour, not just the ones that opt in. */
        SB_E2E_TRAY: '1',
        ...(hotkey ? { SB_E2E_HOTKEY: '1' } : {}),
        ...(stageDelayMs > 0 ? { SB_E2E_STAGE_DELAY_MS: String(stageDelayMs) } : {}),
        ...(ingestDelayMs > 0 ? { SB_E2E_INGEST_DELAY_MS: String(ingestDelayMs) } : {}),
        ...(tasksFixture ? { SB_E2E_TASKS_FIXTURE: '1' } : {}),
        ...(fakeProvider
          ? { SB_E2E_FAKE_PROVIDER: writeFakeProviderScript(tempRoot, fakeProvider) }
          : {}),
        ...(fetchFixture
          ? { SB_E2E_FETCH_FIXTURE: writeFetchFixtureManifest(tempRoot, fetchFixture) }
          : {}),
        ...(updateFixture
          ? {
              SB_E2E_UPDATE_FIXTURE:
                typeof updateFixture === 'string'
                  ? updateFixture
                  : writeUpdateFixtureFile(tempRoot, updateFixture),
            }
          : {}),
      };
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
