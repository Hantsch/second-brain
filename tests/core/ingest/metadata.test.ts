/* Metadaten kommen aus mehreren Providern und werden **feldweise** zusammengelegt.
   Wichtig ist nicht nur das Ergebnis, sondern die Provenienz: zu jedem Feld muss
   nachweisbar sein, wer es geliefert hat. */

import { describe, expect, it } from 'vitest';
import {
  extractLinks,
  mergeMetadata,
  missingCoreFields,
  normalizeMetadata,
  parseIsoDuration,
} from '@core/ingest';

describe('mergeMetadata', () => {
  it('legt Felder in Prioritaetsreihenfolge uebereinander und haelt die Herkunft fest', () => {
    const { metadata, provenance, providers } = mergeMetadata([
      {
        provider: 'yt-dlp',
        data: { videoId: 'xOFkpf9KgKg', title: 'Erster Titel', duration: 96, tags: ['wiki'] },
      },
      {
        provider: 'youtubei.js',
        data: {
          title: 'Zweiter Titel',
          description: 'Die Beschreibung kommt vom Fallback.',
          channel: 'Beispielkanal',
          duration: 100,
        },
      },
    ]);

    expect(metadata.title).toBe('Erster Titel');
    expect(metadata.duration).toBe(96);
    expect(metadata.description).toBe('Die Beschreibung kommt vom Fallback.');
    expect(metadata.channel).toBe('Beispielkanal');
    expect(metadata.url).toBe('https://www.youtube.com/watch?v=xOFkpf9KgKg');

    expect(provenance).toMatchObject({
      videoId: 'yt-dlp',
      title: 'yt-dlp',
      duration: 'yt-dlp',
      tags: 'yt-dlp',
      description: 'youtubei.js',
      channel: 'youtubei.js',
    });
    expect(providers).toEqual(['yt-dlp', 'youtubei.js']);
  });

  it('nennt einen Provider nicht, der nichts beigetragen hat', () => {
    const { providers, provenance } = mergeMetadata([
      {
        provider: 'erster',
        data: { title: 'Titel', description: 'Text', channel: 'K', duration: 5 },
      },
      { provider: 'zweiter', data: { title: 'Anderer Titel' } },
    ]);
    expect(providers).toEqual(['erster']);
    expect(provenance['title']).toBe('erster');
  });

  it('meldet fehlende Kernfelder', () => {
    const { metadata } = mergeMetadata([{ provider: 'nur-titel', data: { title: 'Titel' } }]);
    expect(missingCoreFields(metadata)).toEqual(['description', 'channel', 'duration']);
  });
});

describe('normalizeMetadata', () => {
  it('normalisiert Datum, Dauer, Kanal-URL und Listen', () => {
    const metadata = normalizeMetadata({
      videoId: ' xOFkpf9KgKg ',
      uploadDate: '20260805',
      durationIso: 'PT1H2M3S',
      channelId: 'UC1234567890abcdefghij',
      tags: ['Wiki', 'wiki', ' Pflege '],
      viewCount: '12345',
      isLive: false,
    });
    expect(metadata.videoId).toBe('xOFkpf9KgKg');
    expect(metadata.uploadDate).toBe('2026-08-05');
    expect(metadata.duration).toBe(3723);
    expect(metadata.channelUrl).toBe('https://www.youtube.com/channel/UC1234567890abcdefghij');
    expect(metadata.tags).toEqual(['Wiki', 'Pflege']);
    expect(metadata.viewCount).toBe(12345);
    expect(metadata.isLive).toBe(false);
  });

  it('macht aus Leerwerten null statt einer Behauptung', () => {
    const metadata = normalizeMetadata({ title: '   ', duration: 'keine Zahl', tags: [] });
    expect(metadata.title).toBeNull();
    expect(metadata.duration).toBeNull();
    expect(metadata.tags).toEqual([]);
  });

  it('liest ISO-Dauern', () => {
    expect(parseIsoDuration('PT4M13S')).toBe(253);
    expect(parseIsoDuration('PT2S')).toBe(2);
    expect(parseIsoDuration('kaputt')).toBeNull();
  });
});

describe('extractLinks', () => {
  it('zieht URLs samt Zeilenkontext heraus', () => {
    const links = extractLinks(
      'Quelle: https://example.org/karpathy-wiki\n- Mastodon: https://example.social/@beispiel\nnochmal https://example.org/karpathy-wiki.',
    );
    expect(links).toEqual([
      { url: 'https://example.org/karpathy-wiki', context: 'Quelle' },
      { url: 'https://example.social/@beispiel', context: 'Mastodon' },
    ]);
  });

  it('liefert nichts bei leerer Description', () => {
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks('ohne Links')).toEqual([]);
  });
});
