/**
 * Die Provider-Kette. Portiert aus `../yougrab/src/main/grab.js`.
 *
 * YouTube hat keine offizielle Schnittstelle fuer Transcripts, und jeder Weg dorthin
 * bricht gelegentlich. Deshalb laufen mehrere Provider hintereinander:
 *
 * - **Metadaten** werden *feldweise* ergaenzt: der erste liefert die Basis, die
 *   folgenden fuellen nur noch Luecken. Sobald alle Kernfelder da sind, werden die
 *   restlichen Provider nicht mehr angefasst.
 * - **Beim Transcript gewinnt der erste Provider, der Cues liefert.** Cues zweier
 *   Quellen zu mischen waere sinnlos.
 *
 * Fehlen Kapitelmarken, werden sie aus den Zeitmarken der Description gelesen.
 */

import { IngestError, throwIfCancelled } from '../types';
import type { IngestNote } from '../types';
import { normalizeChapters, parseChaptersFromDescription } from './chapters';
import { stripNonSpeechCues } from './non-speech';
import type { Cue } from './cues';
import { extractLinks, mergeMetadata, missingCoreFields } from './metadata';
import type { DescriptionLink, MetadataPart, RawVideoMetadata, VideoMetadata } from './metadata';
import type { SubtitleKind } from './subtitles';

export interface TranscriptResult {
  cues: Cue[];
  language: string | null;
  kind: SubtitleKind;
  /** Format bzw. Weg, auf dem die Cues kamen — nur zur Nachvollziehbarkeit. */
  format: string;
}

/** Ein Provider kann Metadaten, Cues oder beides liefern. Fehlt eines, wird es uebersprungen. */
export interface YoutubeProvider {
  readonly name: string;
  metadata?(videoId: string): Promise<RawVideoMetadata | null>;
  transcript?(videoId: string): Promise<TranscriptResult | null>;
}

export interface HarvestOptions {
  providers: readonly YoutubeProvider[];
  /** Sound-Marker aus den Cues entfernen. Standard: ja. */
  stripNonSpeech?: boolean;
  signal?: AbortSignal;
  /** Fortschritt in Worten des Kerns: Provider-Namen, keine Nutzersaetze. */
  onStep?: (step: { provider: string; part: 'metadata' | 'transcript'; ok: boolean }) => void;
}

export interface Harvest {
  metadata: VideoMetadata;
  /** Feld → Provider. `chapters: 'description'`, wenn sie abgeleitet wurden. */
  provenance: Record<string, string>;
  providers: string[];
  transcript: (TranscriptResult & { provider: string }) | null;
  links: DescriptionLink[];
  notes: IngestNote[];
  /** Technische Fehlertexte der gescheiterten Provider — fuer das Protokoll. */
  failures: string[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ein Video einsammeln. Wirft nur, wenn **kein** Provider Metadaten liefert — ohne
 * Titel und Description gibt es nichts abzulegen.
 */
export async function harvestVideo(videoId: string, options: HarvestOptions): Promise<Harvest> {
  const { providers, signal } = options;
  const notes: IngestNote[] = [];
  const failures: string[] = [];

  // ── Metadaten, feldweise ─────────────────────────────────────────────────
  const parts: MetadataPart[] = [];
  for (const provider of providers) {
    throwIfCancelled(signal);
    if (provider.metadata === undefined) continue;
    try {
      const data = await provider.metadata(videoId);
      if (data !== null && data !== undefined) parts.push({ provider: provider.name, data });
      options.onStep?.({ provider: provider.name, part: 'metadata', ok: true });
    } catch (error) {
      failures.push(`${provider.name} (metadata): ${messageOf(error)}`);
      options.onStep?.({ provider: provider.name, part: 'metadata', ok: false });
      continue;
    }
    if (parts.length > 0 && missingCoreFields(mergeMetadata(parts).metadata).length === 0) break;
  }

  if (parts.length === 0) {
    // Kein Provider hat geantwortet: ein Ordner ohne Titel und ohne Text waere eine
    // leere Behauptung. Lieber ein ehrlicher Fehler, den der Nutzer wiederholen kann.
    throw new IngestError('io', 'Keine Metadaten erhalten.', {
      ...(failures.length > 0 ? { detail: failures.join('\n') } : {}),
    });
  }

  const { metadata, provenance, providers: used } = mergeMetadata(parts);
  if (metadata.videoId === null) metadata.videoId = videoId;
  if (metadata.url === null) metadata.url = `https://www.youtube.com/watch?v=${videoId}`;
  const missing = missingCoreFields(metadata);
  if (missing.length > 0) notes.push({ code: 'partial-metadata', detail: missing.join(', ') });

  // Kapitel aus der Description ableiten, wenn kein Provider welche geliefert hat.
  if (metadata.chapters.length === 0 && metadata.description !== null) {
    const derived = parseChaptersFromDescription(metadata.description, metadata.duration);
    if (derived.length > 0) {
      metadata.chapters = derived;
      provenance['chapters'] = 'description';
    }
  } else {
    metadata.chapters = normalizeChapters(metadata.chapters, metadata.duration);
  }

  // ── Transcript: der erste Provider mit Cues gewinnt ──────────────────────
  let transcript: (TranscriptResult & { provider: string }) | null = null;
  for (const provider of providers) {
    throwIfCancelled(signal);
    if (provider.transcript === undefined) continue;
    try {
      const found = await provider.transcript(videoId);
      const ok = found !== null && found !== undefined && found.cues.length > 0;
      options.onStep?.({ provider: provider.name, part: 'transcript', ok });
      if (!ok || found === null || found === undefined) continue;
      const cues = options.stripNonSpeech === false ? found.cues : stripNonSpeechCues(found.cues);
      if (cues.length === 0) continue;
      transcript = { ...found, cues, provider: provider.name };
      break;
    } catch (error) {
      failures.push(`${provider.name} (transcript): ${messageOf(error)}`);
      options.onStep?.({ provider: provider.name, part: 'transcript', ok: false });
    }
  }

  if (transcript === null) {
    notes.push({
      code: 'no-transcript',
      ...(failures.length > 0 ? { detail: failures.join('; ') } : {}),
    });
  } else {
    provenance['transcript'] = transcript.provider;
  }

  return {
    metadata,
    provenance,
    providers: used,
    transcript,
    links: extractLinks(metadata.description),
    notes,
    failures,
  };
}
