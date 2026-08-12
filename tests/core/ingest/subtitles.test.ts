/* Die Spurwahl entscheidet, in welcher Sprache das Wissen ankommt. Der Fall, der die
   Regel traegt: ein japanisches Video, dessen englische Auto-Uebersetzung angeboten
   wird. Genommen wird die japanische ASR-Spur — eine Maschinenuebersetzung einer
   Maschinentranskription waere zwei Ableitungen weit von der Quelle weg. */

import { describe, expect, it } from 'vitest';
import {
  baseTag,
  bestForLanguage,
  chooseSubtitleTrack,
  expandPreferred,
  usableTracks,
} from '@core/ingest';

describe('chooseSubtitleTrack', () => {
  it('nimmt beim japanischen Video die japanische ASR-Spur, nicht die Uebersetzung', () => {
    const track = chooseSubtitleTrack({
      manual: [],
      auto: ['ja-orig', 'de', 'en', 'es', 'fr'],
      preferred: ['original', 'de', 'en'],
      original: 'ja',
    });
    expect(track).toEqual({ lang: 'ja-orig', kind: 'auto' });
  });

  it('zieht die manuelle Spur der automatischen vor', () => {
    const track = chooseSubtitleTrack({
      manual: ['de'],
      auto: ['de-orig', 'en'],
      preferred: ['de'],
      original: 'de',
    });
    expect(track).toEqual({ lang: 'de', kind: 'manual' });
  });

  it('haelt die Reihenfolge der Wunschliste ein', () => {
    const track = chooseSubtitleTrack({
      manual: ['en', 'de'],
      auto: [],
      preferred: ['de', 'en'],
      original: 'en',
    });
    expect(track).toEqual({ lang: 'de', kind: 'manual' });
  });

  it('bevorzugt innerhalb einer Sprache die ASR-Originalspur', () => {
    expect(bestForLanguage(['de-DE', 'de-orig'], 'de')).toBe('de-orig');
    expect(bestForLanguage(['en-US', 'en-GB'], 'en')).toBe('en-GB');
    expect(bestForLanguage(['en', 'en-US'], 'en')).toBe('en');
    expect(bestForLanguage(['fr'], 'de')).toBeNull();
  });

  it('nimmt lieber irgendein Transcript als keins', () => {
    expect(
      chooseSubtitleTrack({ manual: [], auto: ['pt'], preferred: ['de', 'en'], original: null }),
    ).toEqual({ lang: 'pt', kind: 'auto' });
    expect(
      chooseSubtitleTrack({ manual: ['pt'], auto: ['pt'], preferred: ['de'], original: null }),
    ).toEqual({ lang: 'pt', kind: 'manual' });
  });

  it('meldet null, wenn es keine Spur gibt', () => {
    expect(
      chooseSubtitleTrack({ manual: [], auto: [], preferred: ['de'], original: 'de' }),
    ).toBeNull();
    expect(
      chooseSubtitleTrack({ manual: [], auto: ['live_chat'], preferred: ['de'], original: 'de' }),
    ).toBeNull();
  });

  it('setzt "original" durch die Videosprache und wirft Dubletten weg', () => {
    expect(expandPreferred(['original', 'de', 'DE', 'en'], 'ja')).toEqual(['ja', 'de', 'en']);
    expect(expandPreferred(['original', 'de'], null)).toEqual(['de']);
  });

  it('haelt das Chatprotokoll aus den Spuren heraus', () => {
    expect(usableTracks(['de', 'live_chat', ' ', 'en'])).toEqual(['de', 'en']);
    expect(baseTag('de-orig')).toBe('de');
  });
});
