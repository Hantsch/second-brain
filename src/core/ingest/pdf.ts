/**
 * PDF-Text ziehen — ueber `unpdf` (pdf.js, reines JS, kein natives Modul).
 *
 * Bewusst hinter einem dynamischen `import`: main wird als CJS gebaut, `unpdf`
 * ist ESM-only. Gleiches Muster wie `youtube/innertube-client.ts`. Ein Fehlschlag
 * beim Laden des Moduls selbst ist ein echter Bug und darf durchreichen; ein
 * Fehlschlag beim Parsen der konkreten PDF-Bytes (kaputt, verschluesselt,
 * kein PDF) ist erwartbar und wird ehrlich als `unreadable` gemeldet.
 */

export type PdfText =
  | { kind: 'text'; text: string; pages: number }
  | { kind: 'no-text-layer'; pages: number }
  | { kind: 'unreadable' };

/**
 * Nur die zwei Funktionen, die wir am Modul brauchen. Eigene, schmale Sicht statt
 * der Paket-Typen aus `pdfjs-dist` — die Objektstruktur der Proxy-Typen ist hier
 * irrelevant, `unpdf` reicht sie nur durch.
 */
interface UnpdfModule {
  getDocumentProxy(data: Uint8Array): Promise<unknown>;
  extractText(
    pdf: unknown,
    options: { mergePages: false },
  ): Promise<{ totalPages: number; text: string[] }>;
}

async function loadUnpdf(): Promise<UnpdfModule> {
  return (await import('unpdf')) as unknown as UnpdfModule;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const unpdf = await loadUnpdf();

  try {
    // pdf.js kann den uebergebenen Buffer detachen/transferieren — eine Kopie
    // haelt den Aufrufer unabhaengig davon, was unpdf mit den Bytes macht.
    // `new Uint8Array(bytes)` statt `bytes.slice()`: kommen die Bytes von
    // `node:fs` (ein Node-`Buffer`, eine `Uint8Array`-Unterklasse), liefert
    // `.slice()` wieder einen `Buffer` — unpdf weist den strikt zurueck
    // ("provide binary data as `Uint8Array`, rather than `Buffer`").
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await unpdf.extractText(pdf, { mergePages: false });

    const pages = text.map((page) => page.replace(/\r\n/g, '\n').trim());
    const nonEmpty = pages.filter((page) => page.length > 0);

    if (nonEmpty.length === 0) {
      return { kind: 'no-text-layer', pages: totalPages };
    }

    return { kind: 'text', text: nonEmpty.join('\n\n'), pages: totalPages };
  } catch {
    return { kind: 'unreadable' };
  }
}
