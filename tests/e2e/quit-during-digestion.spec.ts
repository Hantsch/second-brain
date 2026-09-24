/* Proves 050/AC3 through the real app: closing the window while a digestion is
   going surfaces `QuitDuringRunDialog` naming the running import, cancelling out
   of it leaves both the import and the window alone — and stopping out of it
   leaves no source page behind in the vault.

   The sibling half of `quit-during-run.spec.ts`, and deliberately its structural
   twin: same `test.use` shape, same `app.evaluate`-driven close, same
   heading/`Cancel` assertions in the same order. Nothing new is mechanised here
   (050, D-i) — the veto is `close-guard.ts`'s, which has vetoed on *any* running
   work-registry task since 074, and an ingest job has been mirrored onto that
   registry since 074/D4 (`ipc/ingest.ts#mirror`). The only thing this story adds
   is the timing seam below.

   `ingestDelayMs` sets `SB_E2E_INGEST_DELAY_MS` (050, D9), which holds a job at
   the boundary between the filed raw source and the wiki write — the same role
   `SB_E2E_STAGE_DELAY_MS` plays for a maintenance run. Without it a pasted text
   digests in milliseconds and there is no running import to close into. The
   value is generous on purpose: the pause ends the moment the job is stopped
   (`ipc/ingest.ts#holdBetweenPhases`), so both tests below pay only for what
   they actually observe, never for the delay itself.

   A model *is* configured here, unlike in `quit-during-run.spec.ts` — that is
   exactly the harness gap this deliverable closes. The offline `fake` provider
   (073, D1) is pinned only so `llmAvailable()` is true and the job claims
   `summarizing` instead of honestly ending as `awaiting-llm`; no script is
   needed, because both tests stop the job before the first model call. Text, not
   a URL or a YouTube link: `noNetworkCalls` (`fixtures/app.ts`) fails the spec
   the moment any request leaves the app, and text is the one source kind that
   never fetches anything (same reasoning as `import-task.spec.ts`).

   Nothing in this harness lets a spec click the title bar's × — the close
   request is instead driven the way `close-guard.ts` itself is wired: a real
   `BrowserWindow.close()` call in the main process (via `app.evaluate`), which
   fires the same native `close` event a real × click would. */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { AppSession } from '../../scripts/lib/app-harness.mjs';
import { expect, test } from './fixtures/vault';

/* closeToTray: false — this spec proves the window-close quit door (058, D-k), which
   only exists when close-to-tray is off; with it on, closing the window would just
   hide to the tray and never reach `QuitDuringRunDialog`. */
test.use({
  specId: 'quit-during-digestion',
  ingestDelayMs: 20_000,
  fakeProvider: {},
  closeToTray: false,
});

/** The seeded module both imports are filed into (`scripts/seed/module-identity.mjs`).
    Selected by slug rather than by its displayed title, which is German. */
const MODULE_SLUG = 'identity-management';
const MODULE_WIKI = `modules/${MODULE_SLUG}/wiki`;

/* One text per test, and deliberately not the same one twice: the cancelled
   import of the first test leaves its raw source in `raw/` (a raw payload is
   immutable — "no trace" is about the digestion, not about the filed source), so
   re-using its text would be recognised as a duplicate and never digest at all.
   Both stay under `jobLabel`'s 80-character truncation (`core/ingest/job.ts`), so
   the task's subject label on `/tasks` is the string verbatim. */
const CANCEL_TEXT = 'Story 050 D9: a pasted source held mid-digestion, then kept running.';
const STOP_TEXT = 'Story 050 D9: a pasted source held mid-digestion, then stopped hard.';

function rowsFor(page: Page, label: string): Locator {
  return page
    .locator('.sb-trow')
    .filter({ has: page.locator('.sb-trow-subject', { hasText: label }) });
}

/** A group panel identified by its heading text ("Running"/"Waiting"/"Finished"). */
function groupPanel(page: Page, heading: string): Locator {
  return page
    .locator('.sb-panel')
    .filter({ has: page.locator('.sb-panel-title', { hasText: heading }) });
}

/** Pastes `text` into the sources inbox, files it into `MODULE_SLUG`, and returns
    once the resulting import is observably `running` in the work queue — the
    state `close-guard.ts` vetoes on. Waiting for the registry's own row rather
    than for a spinner on the sources tab is the point: it is the very list the
    guard and the dialog read. */
async function startHeldDigestion(page: Page, text: string): Promise<void> {
  await page.locator('.sb-rail a[href="#/knowledge"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
  await page.getByRole('tab', { name: 'Sources' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge?tab=sources');

  await page.getByLabel('URL, YouTube link or text').fill(text);
  await expect(page.getByText('Text detected — filed as a source')).toBeVisible();

  /* `exact` matters here: `getByLabel` matches substrings, and every row in the
     inventory below carries its own picker labelled "Target module for <title>"
     (`sources.list.moduleFor`) — so the inexact name would resolve to the inbox
     picker plus one per uncondensed seeded source. */
  const target = page.getByLabel('Target module', { exact: true });
  await expect(target.locator(`option[value="${MODULE_SLUG}"]`)).toHaveCount(1);
  await target.selectOption(MODULE_SLUG);
  await page.getByRole('button', { name: 'Take in' }).click();

  await page.locator('.sb-rail a[href="#/tasks"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/tasks');
  await expect(groupPanel(page, 'Running').locator('.sb-trow-subject')).toHaveText(text);
}

/** Requests a real window close from the main process — the same native `close`
    event the title bar's × fires, and the only thing `close-guard.ts` reacts to. */
async function requestWindowClose(session: AppSession): Promise<void> {
  const { mainWindowId } = session;
  if (mainWindowId === undefined) throw new Error('no main window id from the harness');
  await session.app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.fromId(id)?.close();
  }, mainWindowId);
}

test('closing the window during a digestion asks first, and cancelling leaves the import and window alone', async ({
  app,
}) => {
  const { page } = app;

  await test.step('start a digestion and let the seam hold it there', async () => {
    await startHeldDigestion(page, CANCEL_TEXT);
  });

  await test.step('request a real window close while the digestion is still going', async () => {
    await requestWindowClose(app);
  });

  await test.step('the quit-confirmation prompt appears, naming the import', async () => {
    await expect(
      page.getByRole('heading', { name: 'Still running: Take in source.' }),
    ).toBeVisible();
  });

  await test.step('cancel the prompt', async () => {
    /* Two buttons share the accessible name "Cancel": the dialog's own header
       × (its `aria-label` is `closeLabel`) and the footer's secondary button.
       The footer one is what a user actually reads as "Cancel" — it renders
       after the header in DOM order. Clicked before the remaining assertions,
       not after: `close-guard.ts`'s dead-man timer carries the close out after
       CONFIRM_TIMEOUT_MS if nobody answers, so answering comes first. */
    await page.getByRole('button', { name: 'Cancel' }).last().click();
  });

  await test.step('the prompt is gone, the digestion is still going, and the window is still open', async () => {
    await expect(
      page.getByRole('heading', { name: 'Still running: Take in source.' }),
    ).toBeHidden();
    await expect(groupPanel(page, 'Running').locator('.sb-trow-subject')).toHaveText(CANCEL_TEXT);
    expect(page.isClosed()).toBe(false);
  });

  await test.step('stop the digestion so the app can close cleanly on teardown', async () => {
    await rowsFor(page, CANCEL_TEXT).getByRole('button', { name: 'Stop' }).click();
    await expect(rowsFor(page, CANCEL_TEXT).getByText('Cancelled')).toBeVisible();
  });
});

test('stopping out of the prompt leaves no source page in the vault', async ({
  app,
  vault,
  vaultPath,
}) => {
  const { page } = app;

  /* The module's whole wiki state before this digestion is even queued. The
     catalog and the chronicle are the two files every digestion writes
     (`core/wiki/ingest.ts`), so byte-identical copies of them afterwards say
     "nothing landed" for the parts a slug cannot be predicted for; the source
     directory listing says it for the source page itself, without this spec
     having to guess the slug the page *would* have got. */
  const sourcesDir = join(vaultPath, MODULE_WIKI, 'sources');
  const rawDir = join(vaultPath, 'raw', 'files');
  const sourcePagesBefore = readdirSync(sourcesDir).sort();
  const rawSourcesBefore = readdirSync(rawDir).length;
  const catalogBefore = vault.snapshot(`${MODULE_WIKI}/index.md`);
  const chronicleBefore = vault.snapshot(`${MODULE_WIKI}/log.md`);

  await test.step('start a second digestion and let the seam hold it there', async () => {
    await startHeldDigestion(page, STOP_TEXT);
  });

  await test.step('request a real window close while the digestion is still going', async () => {
    await requestWindowClose(app);
  });

  await test.step('the quit-confirmation prompt appears, naming the import', async () => {
    await expect(
      page.getByRole('heading', { name: 'Still running: Take in source.' }),
    ).toBeVisible();
  });

  await test.step('stop the digestion and close', async () => {
    await page.getByRole('button', { name: 'Stop and close' }).click();
    /* The dialog only confirms the close once every cancel has actually
       resolved, so a closed page is proof the stop went through — not a guess
       that it did. */
    await expect.poll(() => page.isClosed(), { timeout: 30_000 }).toBe(true);
    /* Idempotent (`app-harness.mjs#close` swallows an already-gone app), and
       what makes the disk assertions below read a vault no process still holds. */
    await app.close();
  });

  await test.step('the vault carries no source page, no catalog entry and no chronicle line', async () => {
    /* First, that there was something to leave a trace of: the raw source did
       get filed, so the import really reached its digestion phase. Without this
       the three assertions below would also be green for an import that never
       started — and a raw payload is meant to survive (VAULT-FORMAT.md: "the
       source payload is immutable"). "No trace" is a claim about the digestion. */
    expect(readdirSync(rawDir).length).toBe(rawSourcesBefore + 1);

    expect(readdirSync(sourcesDir).sort()).toEqual(sourcePagesBefore);
    expect(vault.snapshot(`${MODULE_WIKI}/index.md`)).toEqual(catalogBefore);
    expect(vault.snapshot(`${MODULE_WIKI}/log.md`)).toEqual(chronicleBefore);
  });
});
