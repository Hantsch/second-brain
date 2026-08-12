/* Die Provider-Kette. Zwei Regeln stehen hier auf dem Pruefstand:
   Metadaten ergaenzen sich feldweise, beim Transcript gewinnt der erste Provider mit
   Cues. Alles ohne Netz — die Provider sind hier schlichte Funktionen. */

import { describe, expect, it, vi } from 'vitest';
import { harvestVideo, IngestError, type YoutubeProvider } from '@core/ingest';

const ID = 'xOFkpf9KgKg';

const CUES = [
  { start: 0, end: 2, text: 'Erster Satz.' },
  { start: 2, end: 4, text: '[Music]' },
];

describe('harvestVideo', () => {
  it('nimmt beim Transcript den ersten Provider, der Cues liefert', async () => {
    const leer = vi.fn().mockResolvedValue(null);
    const voll = vi.fn().mockResolvedValue({
      cues: CUES,
      language: 'de',
      kind: 'auto',
      format: 'json3',
    });
    const providers: YoutubeProvider[] = [
      { name: 'erster', metadata: async () => ({ title: 'Titel' }), transcript: leer },
      { name: 'zweiter', transcript: voll },
    ];

    const harvest = await harvestVideo(ID, { providers });

    expect(leer).toHaveBeenCalledOnce();
    expect(voll).toHaveBeenCalledOnce();
    expect(harvest.transcript?.provider).toBe('zweiter');
    expect(harvest.provenance['transcript']).toBe('zweiter');
    // Sound-Marker sind standardmaessig weg.
    expect(harvest.transcript?.cues.map((cue) => cue.text)).toEqual(['Erster Satz.']);
  });

  it('fragt keinen weiteren Provider, wenn alle Kernfelder da sind', async () => {
    const zweiter = vi.fn().mockResolvedValue({ title: 'Ueberschrieben' });
    const providers: YoutubeProvider[] = [
      {
        name: 'erster',
        metadata: async () => ({
          title: 'Titel',
          description: 'Text',
          channel: 'Kanal',
          duration: 42,
        }),
      },
      { name: 'zweiter', metadata: zweiter },
    ];

    const harvest = await harvestVideo(ID, { providers });

    expect(zweiter).not.toHaveBeenCalled();
    expect(harvest.providers).toEqual(['erster']);
    expect(harvest.notes.map((note) => note.code)).toContain('no-transcript');
  });

  it('geht ueber einen gescheiterten Provider hinweg und protokolliert den Grund', async () => {
    const providers: YoutubeProvider[] = [
      {
        name: 'kaputt',
        metadata: async () => {
          throw new Error('HTTP 429');
        },
        transcript: async () => {
          throw new Error('keine Spur');
        },
      },
      {
        name: 'heil',
        metadata: async () => ({ title: 'Titel', description: 'T', channel: 'K', duration: 1 }),
        transcript: async () => ({ cues: CUES, language: 'de', kind: 'manual', format: 'vtt' }),
      },
    ];

    const harvest = await harvestVideo(ID, { providers });

    expect(harvest.providers).toEqual(['heil']);
    expect(harvest.transcript?.provider).toBe('heil');
    expect(harvest.failures).toEqual([
      'kaputt (metadata): HTTP 429',
      'kaputt (transcript): keine Spur',
    ]);
  });

  it('wirft, wenn kein Provider Metadaten liefert', async () => {
    const providers: YoutubeProvider[] = [
      {
        name: 'kaputt',
        metadata: async () => {
          throw new Error('kein Netz');
        },
      },
    ];
    await expect(harvestVideo(ID, { providers })).rejects.toBeInstanceOf(IngestError);
  });

  it('liest Kapitel aus der Description, wenn kein Provider welche hat', async () => {
    const providers: YoutubeProvider[] = [
      {
        name: 'ohne-kapitel',
        metadata: async () => ({
          title: 'Titel',
          channel: 'Kanal',
          duration: 200,
          description: '0:00 Start\n1:00 Mitte\n2:00 Ende',
        }),
      },
    ];

    const harvest = await harvestVideo(ID, { providers });

    expect(harvest.metadata.chapters.map((chapter) => chapter.title)).toEqual([
      'Start',
      'Mitte',
      'Ende',
    ]);
    expect(harvest.provenance['chapters']).toBe('description');
  });

  it('laesst Sound-Marken stehen, wenn der Nutzer das so will', async () => {
    const providers: YoutubeProvider[] = [
      {
        name: 'einer',
        metadata: async () => ({ title: 'Titel' }),
        transcript: async () => ({ cues: CUES, language: 'de', kind: 'auto', format: 'json3' }),
      },
    ];
    const harvest = await harvestVideo(ID, { providers, stripNonSpeech: false });
    expect(harvest.transcript?.cues).toHaveLength(2);
  });

  it('bricht ab, sobald das Signal gesetzt ist', async () => {
    const controller = new AbortController();
    controller.abort();
    const providers: YoutubeProvider[] = [{ name: 'nie', metadata: async () => ({ title: 'x' }) }];
    await expect(harvestVideo(ID, { providers, signal: controller.signal })).rejects.toThrow(
      /abgebrochen/i,
    );
  });

  it('meldet unvollstaendige Metadaten als Hinweis, nicht als Fehler', async () => {
    const providers: YoutubeProvider[] = [
      { name: 'karg', metadata: async () => ({ title: 'Nur Titel' }) },
    ];
    const harvest = await harvestVideo(ID, { providers });
    const note = harvest.notes.find((entry) => entry.code === 'partial-metadata');
    expect(note?.detail).toBe('description, channel, duration');
    expect(harvest.metadata.url).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});
