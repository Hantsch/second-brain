/* Proves 066/AC6: an undo round trip through a real write path. `discardPage`
   (`src/core/gardener/discard-page.ts`) is the only path that takes a page
   out of the vault, and `undoFix` (`src/core/gardener/undo.ts`) is its way
   back — this spec drives both through the real UI, on the real filesystem,
   and checks the result byte-for-byte rather than through parsed
   frontmatter (the accept criterion is explicit about that).

   The near-duplicate pair `scripts/seed/module-methodik.mjs` seeds on
   purpose (015 D9: the same video "recorded twice") is the fixture: two
   source pages with word-identical bodies, exactly the case
   `core/gardener/checks/near-duplicate.ts` is built to catch. `video2`'s
   slug is computed the same way the seeder builds it — `isoDayOffset(-9)`
   mirrors `createClock` in `scripts/seed/lib.mjs`, the same trick
   `journal-close.spec.ts` already uses for its day paths.

   No LLM is configured in this harness (`fixtures/app.ts`), so the
   near-duplicate check that surfaces the pair is the plain, deterministic
   one (`checks` stage) — "Check now" alone is enough, no model-dependent
   audit stage needed. */

import { expect, test } from './fixtures/vault';

test.use({ specId: 'discard-undo' });

/** Local calendar day, `offsetDays` away from today — must match
    `scripts/seed/lib.mjs#createClock` (`isoDay`) exactly, since the seeded
    slug is built from it. Never `Date.toISOString()`: it crosses midnight
    in any zone west of UTC. */
function isoDayOffset(offsetDays: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${target.getFullYear()}-${month}-${day}`;
}

const MODULE_SLUG = 'second-brain-methodik';
/* `module-methodik.mjs`: `video = s-${day(-9)}-ai-second-brain-rotting`,
   `video2 = ${video}-2` — the accidental second recording of the same
   source, the exact "near-duplicate" fixture this spec discards. */
const VIDEO2_SLUG = `s-${isoDayOffset(-9)}-ai-second-brain-rotting-2`;
const VIDEO2_LEAF = `${VIDEO2_SLUG}.md`;
const VIDEO2_PATH = `modules/${MODULE_SLUG}/wiki/sources/${VIDEO2_LEAF}`;

const DISCARD_TRIGGER = `Discard “${VIDEO2_LEAF}”`;

test('a discarded page comes back byte-for-byte', async ({ app, vault }) => {
  const { page } = app;

  /* Step 1: the seeded pair sits on disk before the app ever touches it —
     the byte snapshot is taken straight off the fixture, not after some UI
     round trip that could already have altered it. */
  const before =
    await test.step('discard undo — snapshot the seeded near-duplicate page', async () => {
      expect(vault.exists(VIDEO2_PATH)).toBe(true);
      return vault.snapshot(VIDEO2_PATH);
    });

  await test.step('discard undo — run a maintenance check to surface the pair', async () => {
    await page.locator('.sb-rail a[href="#/garden"]').click();
    await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/garden');
    await page
      .getByRole('button', { name: /^Check (now|again)$/ })
      .first()
      .click();
    /* The mechanical `near-duplicate` check needs no model — its finding,
       and this page's own discard trigger, appear once the run's mutation
       resolves (`useGardenerRun`'s `onSuccess` sets the report straight into
       the query cache). */
    await expect(page.getByRole('button', { name: DISCARD_TRIGGER })).toBeVisible();
  });

  await test.step('discard undo — open the discard dialog and confirm', async () => {
    await page.getByRole('button', { name: DISCARD_TRIGGER }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Discard', exact: true });
    /* Disabled until `discardPlan` has loaded (`DiscardPageAction.tsx`) — the
       preview must exist before the button that writes anything can fire. */
    await expect(confirm).toBeEnabled();
    await confirm.click();
  });

  await test.step('discard undo — gone from its place, present in the trash', async () => {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    expect(vault.exists(VIDEO2_PATH)).toBe(false);

    /* Trash entries are named by undo token, not by the file they hold
       (`src/core/vault/trash.ts`) — `discardPage` even uses *two* tokens for
       one action, one for the fix journal (`gardener.json`) and one for the
       file `VaultStore.delete` itself moved. So the entry that matters is
       found by what it contains, not guessed by name: whichever top-level
       trash entry has the original path underneath it. */
    const trashDirEntries = vault.trashEntries().filter((entry) => !entry.endsWith('.json'));
    const holding = trashDirEntries.find((entry) =>
      vault.exists(`.secondbrain/trash/${entry}/${VIDEO2_PATH}`),
    );
    expect(
      holding,
      `expected one of [${trashDirEntries.join(', ')}] to hold ${VIDEO2_PATH}`,
    ).toBeDefined();
  });

  await test.step('discard undo — undo, and the restored file matches byte-for-byte', async () => {
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => vault.exists(VIDEO2_PATH)).toBe(true);
    /* AC6: the comparison is on bytes, not on parsed frontmatter. */
    expect(vault.snapshot(VIDEO2_PATH).equals(before)).toBe(true);
  });
});
