/* Eine Webseite aufnehmen. Der Kern des Tests: aus dem HTML-Fixture kommt der
   Artikeltext heraus — und die Navigation, die Seitenleiste, die Fusszeile und das
   Tracking-Skript bleiben draussen. Kein Netz: `fetch` ist injiziert. */

import { describe, expect, it } from 'vitest';
import {
  createUrlIngestor,
  htmlToArticle,
  isHttpUrl,
  titleFromUrl,
  type IngestContext,
} from '@core/ingest';
import { fakeFetch, ingestFixture, memoryStore } from './fakes';
import { NOW_MS } from '../../helpers/time';

const ADDRESS = 'https://example.org/blog/wissen-verrottet';

function context(
  store = memoryStore(),
  options: { body?: string; headers?: Record<string, string>; status?: number } = {},
): IngestContext {
  const { fetchImpl } = fakeFetch({
    body: options.body ?? ingestFixture('article.html'),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.status === undefined ? {} : { status: options.status }),
    url: ADDRESS,
  });
  return { store, now: new Date(NOW_MS), fetchImpl, module: 'second-brain-methodik' };
}

describe('htmlToArticle', () => {
  it('holt den Artikeltext heraus, ohne Navigation und Beiwerk', () => {
    const { title, markdown } = htmlToArticle(ingestFixture('article.html'));

    expect(title).toBe('Wissen verrottet, wenn niemand es pflegt');
    expect(markdown).toContain('# Wissen verrottet, wenn niemand es pflegt');
    expect(markdown).toContain('Ein Wiki, das nur wächst');
    expect(markdown).toContain('## Drei Anzeichen');
    expect(markdown).toContain('- Seiten ohne eingehende Links.');
    expect(markdown).toContain('[Karpathys Wiki-Muster](https://example.org/karpathy-wiki)');

    for (const noise of [
      'Navigationslink',
      'navigationslink',
      'Impressum',
      'Beliebte Beiträge',
      'Datenschutz',
      'sollte-nie-im-markdown-landen',
      'color: red',
      'Werbung',
    ]) {
      expect(markdown, noise).not.toContain(noise);
    }
  });
});

describe('UrlIngestor', () => {
  it('erkennt Web-Adressen', () => {
    const ingestor = createUrlIngestor();
    expect(ingestor.kind).toBe('url');
    expect(ingestor.canHandle(ADDRESS)).toBe(true);
    expect(ingestor.canHandle('C:/temp/notiz.md')).toBe(false);
    expect(isHttpUrl('ftp://example.org')).toBe(false);
  });

  it('schreibt die Seite als Markdown mit Protokoll daneben', async () => {
    const store = memoryStore();
    const outcome = await createUrlIngestor().ingest(ADDRESS, context(store));

    expect(outcome.rawPath).toBe('raw/web/2026-08-10-wissen-verrottet-wenn-niemand-es-pflegt.md');
    expect(outcome.title).toBe('Wissen verrottet, wenn niemand es pflegt');
    expect(outcome.origin).toBe(ADDRESS);
    expect(outcome.provenance).toEqual({ content: 'fetch', metadata: 'fetch' });

    const markdown = (await store.readText(outcome.rawPath)) ?? '';
    expect(markdown).toContain('doc_type: web');
    expect(markdown).toContain(`origin: ${ADDRESS}`);
    expect(markdown).toContain('fetched_at: 2026-08-10T14:32:00+02:00');
    expect(markdown).toContain('## Drei Anzeichen');

    const logPath = 'raw/web/2026-08-10-wissen-verrottet-wenn-niemand-es-pflegt.ingest.json';
    const record: unknown = JSON.parse((await store.readText(logPath)) ?? '{}');
    expect(record).toMatchObject({
      kind: 'url',
      origin: ADDRESS,
      sourcePage: null,
      modules: ['second-brain-methodik'],
    });
  });

  it('ueberschreibt eine liegende Quelle nicht, sondern legt sich daneben', async () => {
    const store = memoryStore();
    const first = await createUrlIngestor().ingest(ADDRESS, context(store));
    const second = await createUrlIngestor().ingest(ADDRESS, context(store));

    expect(second.rawPath).not.toBe(first.rawPath);
    expect(second.rawPath).toContain('-2.md');
    expect(await store.exists(first.rawPath)).toBe(true);
  });

  it('nimmt reinen Text ohne HTML-Wandlung', async () => {
    const store = memoryStore();
    const outcome = await createUrlIngestor().ingest(
      'https://example.org/notizen.txt',
      context(store, { body: 'Nur Text, keine Tags.', headers: { 'content-type': 'text/plain' } }),
    );
    expect(outcome.text).toBe('Nur Text, keine Tags.');
    // Ohne Titel im Inhalt zaehlt die Endadresse — die Weiterleitung, nicht die Eingabe.
    expect(outcome.title).toBe('wissen verrottet');
  });

  it('lehnt ab, was kein Text ist', async () => {
    await expect(
      createUrlIngestor().ingest(
        ADDRESS,
        context(memoryStore(), {
          body: '%PDF-1.7',
          headers: { 'content-type': 'application/pdf' },
        }),
      ),
    ).rejects.toThrow(/keinen Text/);
  });

  it('meldet einen Fehlerstatus als Fehler, nicht als leere Quelle', async () => {
    await expect(
      createUrlIngestor().ingest(ADDRESS, context(memoryStore(), { status: 404 })),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('faellt auf die Adresse zurueck, wenn die Seite keinen Titel nennt', () => {
    expect(titleFromUrl('https://example.org/blog/mein-artikel.html')).toBe('mein artikel');
    expect(titleFromUrl('https://example.org')).toBe('example.org');
  });

  it('bricht ab, wenn das Signal schon gesetzt ist', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = { ...context(), signal: controller.signal };
    await expect(createUrlIngestor().ingest(ADDRESS, ctx)).rejects.toThrow(/abgebrochen/i);
  });
});
