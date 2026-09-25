/* PDF-Textextraktion — echte, hand-gebaute PDF-Bytes, kein Mock von unpdf.
   Damit deckt der Test auch die pdf.js-Parser-Pfade ab, nicht nur unseren
   Wrapper. */

import { describe, expect, it } from 'vitest';
import { extractPdfText } from '@core/ingest/pdf';
import { makeImageOnlyPdf, makeTextPdf } from '../../fixtures/pdf/make-pdf';

describe('extractPdfText', () => {
  it('a text PDF yields its text page by page', async () => {
    const bytes = makeTextPdf(['Hello world', 'Second page']);

    const result = await extractPdfText(bytes);

    expect(result.kind).toBe('text');
    if (result.kind !== 'text') throw new Error('expected text result');
    expect(result.pages).toBe(2);
    expect(result.text).toContain('Hello world');
    expect(result.text).toContain('Second page');
  });

  it('an image-only PDF has no text layer', async () => {
    const bytes = makeImageOnlyPdf();

    const result = await extractPdfText(bytes);

    expect(result.kind).toBe('no-text-layer');
    if (result.kind !== 'no-text-layer') throw new Error('expected no-text-layer result');
    expect(result.pages).toBe(1);
  });

  it('a damaged PDF is unreadable, not a crash', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 garbage');

    const result = await extractPdfText(bytes);

    expect(result.kind).toBe('unreadable');
  });
});
