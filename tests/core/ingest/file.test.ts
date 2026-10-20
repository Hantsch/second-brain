/* Dateien und eingefuegter Text.
 *
 * Der wichtigste Fall ist der ehrliche: ein PDF wird **nicht** gelesen. Die Datei
 * liegt trotzdem als Rohquelle, und der Hinweis `pdf-not-read` sagt dem Nutzer, dass
 * er den Text selbst einfuegen muss. Ein halb geparstes PDF waere eine Quelle, die
 * aussieht wie Text und keiner ist. */

import { describe, expect, it } from 'vitest';
import {
  createFileIngestor,
  createTextIngestor,
  handlingFor,
  IngestError,
  looksLikePath,
  MAX_TEXT_BYTES,
  titleForText,
  type IngestContext,
} from '@core/ingest';
import { fakeFileSystem, ingestFixture, memoryStore } from './fakes';
import { NOW_MS } from '../../helpers/time';
import { makeImageOnlyPdf, makeTextPdf } from '../../fixtures/pdf/make-pdf';

function setup(files: Record<string, string>): {
  ctx: IngestContext;
  store: ReturnType<typeof memoryStore>;
  fs: ReturnType<typeof fakeFileSystem>;
} {
  const store = memoryStore();
  const fs = fakeFileSystem(files);
  return { store, fs, ctx: { store, fs, now: new Date(NOW_MS), module: 'second-brain-methodik' } };
}

describe('handlingFor', () => {
  it('entscheidet allein an der Endung', () => {
    expect(handlingFor('notiz.md')).toBe('text');
    expect(handlingFor('NOTIZ.TXT')).toBe('text');
    expect(handlingFor('seite.html')).toBe('html');
    expect(handlingFor('handbuch.pdf')).toBe('pdf');
    expect(handlingFor('bild.png')).toBe('opaque');
  });

  it('unterscheidet Pfade von Adressen', () => {
    expect(looksLikePath('C:/temp/notiz.md')).toBe(true);
    expect(looksLikePath('/home/roland/notiz.md')).toBe(true);
    expect(looksLikePath('./notiz.md')).toBe(true);
    expect(looksLikePath('https://example.org/x')).toBe(false);
    expect(looksLikePath('nur ein Satz')).toBe(false);
  });
});

describe('FileIngestor', () => {
  it('uebernimmt Markdown und kopiert das Original', async () => {
    const { ctx, store, fs } = setup({
      'C:/quellen/karpathy-wiki.md': '# Karpathys Wiki-Muster\n\nEine Quelle mit Ümlauten.\n',
    });

    const outcome = await createFileIngestor().ingest('C:/quellen/karpathy-wiki.md', ctx);

    expect(outcome.rawPath).toBe('raw/files/2026-08-10-karpathys-wiki-muster');
    expect(outcome.title).toBe('Karpathys Wiki-Muster');
    expect(outcome.text).toContain('Eine Quelle mit Ümlauten.');
    expect(outcome.notes).toEqual([]);
    expect(
      fs.copies()[`${store.root}/raw/files/2026-08-10-karpathys-wiki-muster/karpathy-wiki.md`],
    ).toBe('C:/quellen/karpathy-wiki.md');

    const record: unknown = JSON.parse(
      (await store.readText(`${outcome.rawPath}/.ingest.json`)) ?? '{}',
    );
    expect(record).toMatchObject({
      kind: 'file',
      origin: 'C:/quellen/karpathy-wiki.md',
      file: 'karpathy-wiki.md',
      sourcePage: null,
      modules: ['second-brain-methodik'],
    });
  });

  it('nimmt bei .txt den Dateinamen als Titel', async () => {
    const { ctx } = setup({ '/tmp/mein-mitschrieb.txt': 'Zeile eins\nZeile zwei\n' });
    const outcome = await createFileIngestor().ingest('/tmp/mein-mitschrieb.txt', ctx);
    expect(outcome.title).toBe('mein mitschrieb');
    expect(outcome.text).toBe('Zeile eins\nZeile zwei\n');
  });

  it('wandelt HTML zu Markdown und legt es als source.md daneben', async () => {
    const { ctx, store } = setup({ '/tmp/artikel.html': ingestFixture('article.html') });
    const outcome = await createFileIngestor().ingest('/tmp/artikel.html', ctx);

    expect(outcome.title).toBe('Wissen verrottet, wenn niemand es pflegt');
    const source = (await store.readText(`${outcome.rawPath}/source.md`)) ?? '';
    expect(source).toContain('doc_type: file');
    expect(source).toContain('source_file: artikel.html');
    expect(source).toContain('## Drei Anzeichen');
    expect(source).not.toContain('Impressum');
  });

  it('a damaged PDF is stored and noted as not read', async () => {
    const { ctx, store, fs } = setup({ 'C:/quellen/Handbuch Auth0.pdf': '%PDF-1.7 binaer' });

    const outcome = await createFileIngestor().ingest('C:/quellen/Handbuch Auth0.pdf', ctx);

    expect(outcome.text).toBe('');
    expect(outcome.notes).toEqual([{ code: 'pdf-not-read', detail: 'Handbuch Auth0.pdf' }]);
    expect(outcome.title).toBe('Handbuch Auth0');
    expect(outcome.rawPath).toBe('raw/files/2026-08-10-handbuch-auth0');
    // Die Datei ist da, nur eben nicht gelesen.
    expect(Object.keys(fs.copies())).toContain(
      `${store.root}/raw/files/2026-08-10-handbuch-auth0/Handbuch-Auth0.pdf`,
    );
    expect(await store.exists(`${outcome.rawPath}/source.md`)).toBe(false);
    const record: unknown = JSON.parse(
      (await store.readText(`${outcome.rawPath}/.ingest.json`)) ?? '{}',
    );
    expect(record).toMatchObject({ provenance: { content: 'none' } });
  });

  it('reads a text PDF into source.md next to the original', async () => {
    const { ctx, store, fs } = setup({});
    fs.put('C:/quellen/Handbuch Auth0.pdf', makeTextPdf(['Seite eins.', 'Seite zwei.']));

    const outcome = await createFileIngestor().ingest('C:/quellen/Handbuch Auth0.pdf', ctx);

    expect(outcome.text).toContain('Seite eins.');
    expect(outcome.text).toContain('Seite zwei.');
    expect(outcome.notes).toEqual([]);
    expect(outcome.provenance).toEqual({ content: 'file' });

    const source = (await store.readText(`${outcome.rawPath}/source.md`)) ?? '';
    expect(source).toContain('source_file:');
    expect(source).toContain('Seite eins.');
    expect(source).toContain('Seite zwei.');

    expect(Object.keys(fs.copies())).toContain(
      `${store.root}/raw/files/2026-08-10-handbuch-auth0/Handbuch-Auth0.pdf`,
    );
    const record: unknown = JSON.parse(
      (await store.readText(`${outcome.rawPath}/.ingest.json`)) ?? '{}',
    );
    expect(record).toMatchObject({ provenance: { content: 'file' } });
  });

  it('a PDF without a text layer is stored and says so', async () => {
    const { ctx, store, fs } = setup({});
    fs.put('C:/quellen/Scan.pdf', makeImageOnlyPdf());

    const outcome = await createFileIngestor().ingest('C:/quellen/Scan.pdf', ctx);

    expect(outcome.notes).toEqual([{ code: 'pdf-no-text-layer', detail: 'Scan.pdf' }]);
    expect(outcome.text).toBe('');
    expect(Object.keys(fs.copies())).toContain(`${store.root}/raw/files/2026-08-10-scan/Scan.pdf`);
    expect(await store.exists(`${outcome.rawPath}/source.md`)).toBe(false);
  });

  it('an oversized PDF fails before anything is written', async () => {
    const { ctx, store, fs } = setup({});
    fs.put('C:/quellen/Riesig.pdf', '%PDF-1.7 '.repeat(Math.ceil(MAX_TEXT_BYTES / 9) + 1));

    await expect(createFileIngestor().ingest('C:/quellen/Riesig.pdf', ctx)).rejects.toMatchObject({
      code: 'too-large',
    });
    await expect(createFileIngestor().ingest('C:/quellen/Riesig.pdf', ctx)).rejects.toBeInstanceOf(
      IngestError,
    );
    expect(fs.copies()).toEqual({});
    expect(await store.exists('raw/files')).toBe(false);
  });

  it('legt unbekannte Dateiarten ab, ohne sie zu deuten', async () => {
    const { ctx } = setup({ '/tmp/bild.png': 'PNG' });
    const outcome = await createFileIngestor().ingest('/tmp/bild.png', ctx);
    expect(outcome.notes).toEqual([{ code: 'binary-not-read', detail: '.png' }]);
  });

  it('meldet eine fehlende Datei als not-found', async () => {
    const { ctx } = setup({});
    await expect(createFileIngestor().ingest('/tmp/gibt-es-nicht.md', ctx)).rejects.toThrow(
      /gibt es nicht/,
    );
  });
});

describe('TextIngestor', () => {
  it('schreibt eingefuegten Text als source.md', async () => {
    const store = memoryStore();
    const ctx: IngestContext = { store, now: new Date(NOW_MS) };
    const outcome = await createTextIngestor().ingest(
      '# Rollenvererbung in Auth0\r\n\r\nRollen erben nicht automatisch.\r\n',
      ctx,
    );

    expect(outcome.rawPath).toBe('raw/files/2026-08-10-rollenvererbung-in-auth0');
    expect(outcome.title).toBe('Rollenvererbung in Auth0');
    expect(outcome.text).toBe('# Rollenvererbung in Auth0\n\nRollen erben nicht automatisch.');

    const source = (await store.readText(`${outcome.rawPath}/source.md`)) ?? '';
    expect(source).toContain('doc_type: text');
    expect(source).toContain('origin: paste');
    expect(source).toContain('Rollen erben nicht automatisch.');
  });

  it('leitet einen Titel aus der ersten Zeile ab, wenn keine Ueberschrift dasteht', () => {
    expect(titleForText('nur ein Satz ohne Ueberschrift')).toBe('nur ein Satz ohne Ueberschrift');
    expect(titleForText('# Mit Ueberschrift\n\nText')).toBe('Mit Ueberschrift');
    expect(titleForText('   ')).toBe('Notiz');
    expect(titleForText('a'.repeat(120)).endsWith('…')).toBe(true);
  });

  it('lehnt leeren Text ab', async () => {
    const ctx: IngestContext = { store: memoryStore() };
    await expect(createTextIngestor().ingest('   ', ctx)).rejects.toThrow(/leer/);
  });
});
