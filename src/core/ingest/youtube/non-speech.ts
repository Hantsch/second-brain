/**
 * Was in Captions steht, aber niemand gesagt hat: `[music]`, `[applause]`, `♪`.
 *
 * Fuer die Verdichtung sind diese Marken Stoerung — in auto-generierten Captions
 * stehen sie mitten im Satz ('mit PixArt [music] 3D') und zerreissen die Aussage.
 *
 * Bewusst eine feste Wortliste statt 'alles in Klammern': `[ __ ]` (ein zensiertes
 * Wort) und eine echte Klammer im Gesprochenen sollen erhalten bleiben. Was der
 * Sprecher gesagt hat, wird nicht geraten.
 */

import type { Cue } from './cues';

const NON_SPEECH_TAG =
  /^\s*(music|musik|applause|applaus|laughter|laughs?|laughing|chuckles?|cheering|cheers|clapping|silence|inaudible|unintelligible|noise|sound effects?|sfx|blank_audio|no speech|instrumental|singing|gesang|beifall|lachen|geraeusche|geräusche|musique|musica)\s*$/i;

/** Sound-Marker aus einem Text entfernen. */
export function stripNonSpeech(text: unknown): string {
  return (
    String(text ?? '')
      .replace(/\[([^\][]*)\]/g, (match, inner: string) =>
        NON_SPEECH_TAG.test(inner) ? ' ' : match,
      )
      .replace(/\(([^()]*)\)/g, (match, inner: string) =>
        NON_SPEECH_TAG.test(inner) ? ' ' : match,
      )
      // Notenzeichen umrahmen gesungene Zeilen — der Text bleibt, die Deko geht.
      .replace(/[♪♫🎵🎶]/gu, ' ')
      .replace(/\[\s*\]|\(\s*\)/g, ' ')
      // Das Entfernen hinterlaesst Leerzeichen vor Satzzeichen.
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** `stripNonSpeech` auf eine Cue-Liste anwenden; leer gewordene Cues fallen weg. */
export function stripNonSpeechCues(cues: readonly Cue[]): Cue[] {
  return cues
    .map((cue) => ({ ...cue, text: stripNonSpeech(cue.text) }))
    .filter((cue) => cue.text.length > 0);
}
