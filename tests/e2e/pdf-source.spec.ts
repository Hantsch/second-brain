/* Proves 060's PDF handling through the real inbox, not just the core unit
 * tests: a text PDF is condensed like any other file source, a scanned PDF
 * (no text layer) ends honestly instead of looking like a missing model, and
 * an oversized PDF fails visibly instead of silently truncating.
 *
 * Same pattern as `url-no-content.spec.ts`: `fakeProvider: {}` so a job with
 * readable text actually reaches `done` instead of stopping at
 * `awaiting-llm`, `openSourcesTab`/`jobRow` mirrored verbatim, and the PDF
 * bytes come from the hand-built fixtures in `tests/fixtures/pdf/make-pdf.ts`
 * — no network, no committed binary. The files are written to `tempRoot`,
 * which sits outside the vault the same way a person's Downloads folder
 * would. */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/app';
import { makeImageOnlyPdf, makeTextPdf } from '../fixtures/pdf/make-pdf';

test.use({
  specId: 'pdf-source',
  fakeProvider: {},
});

async function openSourcesTab(page: Page): Promise<void> {
  await page.locator('.sb-rail a[href="#/knowledge"]').click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge');
  await page.getByRole('tab', { name: 'Sources' }).click();
  await expect.poll(() => page.url().split('#')[1] ?? '').toBe('/knowledge?tab=sources');
}

/** Types an absolute file path into the inbox and submits it — mirrors
 * `url-no-content.spec.ts`'s `pasteAndSubmit`, but for the file-path
 * detection path instead of the URL one. */
async function pasteAndSubmit(page: Page, path: string): Promise<void> {
  const field = page.getByLabel('URL, YouTube link or text');
  await field.fill(path);
  await expect(page.getByText('File path detected')).toBeVisible();
  await page.getByRole('button', { name: 'Take in' }).click();
}

/* `jobLabel` (`src/core/ingest/job.ts`) truncates the job's `input` at 80
 * characters, so a full absolute temp path — much longer than any URL the
 * sibling specs assert on — never survives into the row's visible text.
 * Each test here submits exactly one source, so the single `.sb-job` row is
 * unambiguous without matching on the (truncated) path text at all. */
function soleJobRow(page: Page) {
  return page.locator('.sb-job');
}

test('a text PDF is taken in and condensed', async ({ app, tempRoot, vaultPath }) => {
  const { page } = app;
  /* Short on purpose: `makeTextPdf`'s fixed 300x300pt page (`make-pdf.ts`)
     draws the text at a fixed position without wrapping, so pdf.js's text
     extraction only picks up what visually fits on the page — a longer
     sentence comes back silently clipped, which is a property of the fixture
     itself, not of `extractPdfText`. */
  const pageText = 'D5 e2e PDF text';
  const filesDir = join(tempRoot, 'files');
  mkdirSync(filesDir, { recursive: true });
  const pdfPath = join(filesDir, 'text-source.pdf');
  writeFileSync(pdfPath, makeTextPdf([pageText]));

  await test.step('open sources and take in the text PDF', async () => {
    await openSourcesTab(page);
    await pasteAndSubmit(page, pdfPath);
  });

  await test.step('the job reaches the done state', async () => {
    const job = soleJobRow(page);
    await expect(job.getByText('Taken in')).toBeVisible({ timeout: 20_000 });
  });

  await test.step('the extracted text sits next to the original in raw/files', async () => {
    const filesRoot = join(vaultPath, 'raw', 'files');
    const dirs = readdirSync(filesRoot, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
    const withSource = dirs.find((entry) => {
      const entries = readdirSync(join(filesRoot, entry.name));
      return entries.includes('source.md') && entries.some((f) => f.endsWith('.pdf'));
    });
    if (withSource === undefined) throw new Error('no raw/files/* dir with source.md and a .pdf');
    const sourceText = readFileSync(join(filesRoot, withSource.name, 'source.md'), 'utf8');
    expect(sourceText).toContain(pageText);
  });
});

test('a scanned PDF ends honestly without a text layer', async ({ app, tempRoot, vaultPath }) => {
  const { page } = app;
  const filesDir = join(tempRoot, 'files');
  mkdirSync(filesDir, { recursive: true });
  const pdfPath = join(filesDir, 'scanned-source.pdf');
  writeFileSync(pdfPath, makeImageOnlyPdf());

  await test.step('open sources and take in the scanned PDF', async () => {
    await openSourcesTab(page);
    await pasteAndSubmit(page, pdfPath);
  });

  await test.step('the row states the missing text layer, never the missing-model state', async () => {
    const job = soleJobRow(page);
    await expect(
      job.getByText(
        'This PDF has no text layer — it looks scanned. The file is stored as a source; text recognition is not supported.',
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      job.getByText('The source rests in the vault, condensing needs a model'),
    ).toHaveCount(0);
    await expect(job.getByRole('button', { name: 'Set up a model' })).toHaveCount(0);
  });

  await test.step('the original PDF is stored under raw/files regardless', async () => {
    const filesRoot = join(vaultPath, 'raw', 'files');
    const dirs = readdirSync(filesRoot, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
    const withPdf = dirs.find((entry) =>
      readdirSync(join(filesRoot, entry.name)).some((f) => f.endsWith('.pdf')),
    );
    expect(withPdf, 'no raw/files/* dir with a .pdf').not.toBeUndefined();
  });
});

test('an oversized PDF fails visibly', async ({ app, tempRoot }) => {
  const { page } = app;
  const filesDir = join(tempRoot, 'files');
  mkdirSync(filesDir, { recursive: true });
  const pdfPath = join(filesDir, 'oversized-source.pdf');
  const header = Buffer.from('%PDF-1.7');
  const padding = Buffer.alloc(5 * 1024 * 1024 + 1 - header.length, 0x20);
  writeFileSync(pdfPath, Buffer.concat([header, padding]));

  await test.step('open sources and take in the oversized PDF', async () => {
    await openSourcesTab(page);
    await pasteAndSubmit(page, pdfPath);
  });

  await test.step('the row states the file is too large', async () => {
    const job = soleJobRow(page);
    await expect(job.getByText('The file is larger than 5 MB and was not taken in.')).toBeVisible({
      timeout: 20_000,
    });
  });
});
