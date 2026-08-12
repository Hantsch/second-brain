/* Die Video-ID ist der Ordnername unter `raw/youtube/`. Was hier durchrutscht, wird
   ein Verzeichnis — deshalb steht am Anfang eine harte Pruefung und kein Vertrauen. */

import { describe, expect, it } from 'vitest';
import { isVideoId, parseVideoId, parseVideoIds, timestampUrl, watchUrl } from '@core/ingest';

const ID = 'dQw4w9WgXcQ';

describe('parseVideoId', () => {
  it('erkennt jede gebraeuchliche Adressform', () => {
    const forms = [
      ID,
      `https://www.youtube.com/watch?v=${ID}`,
      `http://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
      `www.youtube.com/watch?v=${ID}`,
      `youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=42`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/v/${ID}`,
      `https://www.youtube.com/watch?app=desktop&v=${ID}&feature=share`,
      `  https://www.youtube.com/watch?v=${ID}  `,
      `v=${ID}`,
      `Schau mal: https://youtu.be/${ID} — stark.`,
    ];
    for (const form of forms) {
      expect(parseVideoId(form), form).toBe(ID);
    }
  });

  it('weist Muell zurueck', () => {
    const junk = [
      '',
      '   ',
      'kein video',
      'https://vimeo.com/123456',
      'https://www.youtube.com/',
      'https://www.youtube.com/@beispielkanal',
      'https://www.youtube.com/watch?v=zu-kurz',
      'https://www.youtube.com/watch?v=viel-zu-lang-fuer-eine-id',
      'https://example.org/watch?v=dQw4w9WgXcQQQ',
      '../../etc/passwd',
      'dQw4w9WgXc',
    ];
    for (const entry of junk) {
      expect(parseVideoId(entry), entry).toBeNull();
    }
  });

  it('akzeptiert nur genau elf erlaubte Zeichen', () => {
    expect(isVideoId('abcdefghijk')).toBe(true);
    expect(isVideoId('abcdefghij')).toBe(false);
    expect(isVideoId('abcdefghij$')).toBe(false);
    expect(isVideoId('abcdefghi/k')).toBe(false);
  });

  it('zerlegt mehrere Zeilen und meldet, was nicht erkannt wurde', () => {
    const { ids, unresolved } = parseVideoIds(
      `https://youtu.be/${ID}\nxOFkpf9KgKg\nhttps://youtu.be/${ID}\nirgendwas`,
    );
    expect(ids).toEqual([ID, 'xOFkpf9KgKg']);
    expect(unresolved).toEqual(['irgendwas']);
  });

  it('baut watch- und Deep-Link-Adressen', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(timestampUrl(ID, 83.7)).toBe(`https://youtu.be/${ID}?t=83`);
    expect(timestampUrl(ID, -5)).toBe(`https://youtu.be/${ID}?t=0`);
  });
});
