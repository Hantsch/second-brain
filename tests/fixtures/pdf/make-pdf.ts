/* Hand-built PDF byte buffers for the PDF-extraction tests — no external PDF
   library, no committed binary. Every object's byte offset is computed from
   the actual bytes written, so the xref table stays correct regardless of
   how long the page text is. */

const encoder = new TextEncoder();

/** Escapes the characters PDF string literals treat as special. */
function escapePdfString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

interface PdfObject {
  /** 1-based object number; objects must be passed in ascending, gap-free order. */
  num: number;
  body: string;
}

/** Assembles a full PDF from object bodies, computing offsets and the xref table. */
function assemblePdf(objects: PdfObject[]): Uint8Array {
  const header = '%PDF-1.7\n';
  const chunks: string[] = [header];
  const offsets: number[] = [];
  let position = encoder.encode(header).length;

  for (const { num, body } of objects) {
    const text = `${num} 0 obj\n${body}\nendobj\n`;
    offsets[num] = position;
    chunks.push(text);
    position += encoder.encode(text).length;
  }

  const xrefOffset = position;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f\r\n`;
  for (let num = 1; num < count; num += 1) {
    xref += `${String(offsets[num]).padStart(10, '0')} 00000 n\r\n`;
  }

  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(xref, trailer);
  return encoder.encode(chunks.join(''));
}

function streamObject(dict: string, content: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const contentAsLatin1 = decoder.decode(content);
  return `${dict}\nstream\n${contentAsLatin1}\nendstream`;
}

/**
 * Builds a minimal, valid PDF with one page per input string, each page
 * showing its string via a Helvetica `Tj` text-showing operator.
 */
export function makeTextPdf(pages: string[]): Uint8Array {
  const objects: PdfObject[] = [];

  objects.push({ num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });

  const pageObjNums = pages.map((_, i) => 4 + i * 2);

  objects.push({
    num: 2,
    body: `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  });

  objects.push({ num: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });

  pages.forEach((text, i) => {
    const pageNum = 4 + i * 2;
    const contentNum = 5 + i * 2;

    objects.push({
      num: pageNum,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`,
    });

    const contentText = `BT /F1 24 Tf 72 200 Td (${escapePdfString(text)}) Tj ET`;
    const contentBytes = encoder.encode(contentText);
    objects.push({
      num: contentNum,
      body: streamObject(`<< /Length ${contentBytes.length} >>`, contentBytes),
    });
  });

  objects.sort((a, b) => a.num - b.num);
  return assemblePdf(objects);
}

/**
 * Builds a minimal, valid PDF with one page that draws a 1x1 raster image
 * XObject and contains no text-showing operator — a scanned page with no
 * text layer, but still parseable.
 */
export function makeImageOnlyPdf(): Uint8Array {
  const imageData = new Uint8Array([0x00]);
  const imageDict =
    '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 ' +
    `/ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imageData.length} >>`;

  const contentText = 'q 1 0 0 1 0 0 cm /Im0 Do Q';
  const contentBytes = encoder.encode(contentText);

  const objects: PdfObject[] = [
    { num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { num: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
    {
      num: 3,
      body:
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] ' +
        '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
    },
    { num: 4, body: streamObject(imageDict, imageData) },
    {
      num: 5,
      body: streamObject(`<< /Length ${contentBytes.length} >>`, contentBytes),
    },
  ];

  return assemblePdf(objects);
}
