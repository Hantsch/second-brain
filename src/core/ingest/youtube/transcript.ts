/**
 * Cues → die zwei Transcript-Dateien. Portiert aus
 * `../yougrab/src/shared/transcript.js`.
 *
 * - `transcript.md` ist Prosa, nach Kapiteln gegliedert. Das ist die Datei, die die
 *   Verdichtung liest: Absaetze brechen an Sprechpausen und Satzenden um, typisch
 *   700–1000 Zeichen, damit ein Chunker an sinnvollen Grenzen schneidet.
 * - `transcript.timestamped.md` ist zum Zitieren da: eine Zeile pro Satz mit
 *   Deep-Link auf die Sekunde im Video.
 */

import { formatTimecode, markdownDoc } from '../markdown';
import { normalizeChapters } from './chapters';
import type { Chapter } from './chapters';
import { countWords } from './cues';
import type { Cue } from './cues';
import { timestampUrl, watchUrl } from './video-url';

const SENTENCE_END = /[.!?…]["')\]]*$/;

const PROSE_DEFAULTS = {
  /** Pause zwischen zwei Cues, ab der ein Absatzwechsel erlaubt ist (Sekunden). */
  gapSeconds: 2,
  /** Vor dieser Laenge wird nicht umgebrochen. */
  minChars: 240,
  /** Ab hier bricht der naechste Satzabschluss den Absatz um. */
  softMaxChars: 900,
  /** Notbremse fuer Captions ohne jede Interpunktion. */
  hardMaxChars: 1600,
};

const LINE_DEFAULTS = {
  maxSeconds: 12,
  maxChars: 220,
};

export interface Paragraph {
  start: number;
  text: string;
}

export interface TimestampedLine {
  start: number;
  end: number;
  text: string;
}

/** Alles, was die beiden Dateien ueber das Video wissen muessen. */
export interface TranscriptContext {
  videoId: string;
  title?: string | null;
  channel?: string | null;
  duration?: number | null;
  chapters?: unknown;
  /** Sprache der gewaehlten Spur. */
  language?: string | null;
  /** manuell, automatisch oder unbekannt. */
  kind?: string | null;
  /** Welcher Provider die Cues geliefert hat. */
  provider?: string | null;
}

/**
 * Cues in Absaetze gruppieren. Umgebrochen wird an Sprechpausen und Satzenden, nie
 * mitten in einem kurzen Absatz.
 */
export function buildParagraphs(
  cues: readonly Cue[],
  options: Partial<typeof PROSE_DEFAULTS> = {},
): Paragraph[] {
  const config = { ...PROSE_DEFAULTS, ...options };
  const paragraphs: Paragraph[] = [];
  let parts: string[] = [];
  let start = 0;
  let previous: Cue | null = null;

  const flush = (): void => {
    if (parts.length === 0) return;
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) paragraphs.push({ start, text });
    parts = [];
  };

  for (const cue of cues) {
    if (parts.length === 0) {
      start = cue.start;
    } else {
      const length = parts.join(' ').length;
      const gap = cue.start - (previous === null ? cue.start : previous.end);
      const endsSentence = SENTENCE_END.test(parts[parts.length - 1] ?? '');
      const breakOnPause = gap >= config.gapSeconds && length >= config.minChars;
      const breakOnSentence = endsSentence && length >= config.softMaxChars;
      const breakOnLength = length >= config.hardMaxChars;
      if (breakOnPause || breakOnSentence || breakOnLength) {
        flush();
        start = cue.start;
      }
    }
    parts.push(cue.text);
    previous = cue;
  }
  flush();
  return paragraphs;
}

/**
 * Cues zu Zeilen buendeln. Auto-Captions kommen teils wortweise — eine Zeile pro
 * Cue waere unlesbar und als Zitat wertlos.
 */
export function buildTimestampedLines(
  cues: readonly Cue[],
  options: Partial<typeof LINE_DEFAULTS> = {},
): TimestampedLine[] {
  const config = { ...LINE_DEFAULTS, ...options };
  const lines: TimestampedLine[] = [];
  let current: { start: number; end: number; parts: string[] } | null = null;

  for (const cue of cues) {
    if (current === null) {
      current = { start: cue.start, end: cue.end, parts: [cue.text] };
      continue;
    }
    const text = current.parts.join(' ');
    const tooLong = text.length + cue.text.length + 1 > config.maxChars;
    const tooOld = cue.end - current.start > config.maxSeconds;
    const endsSentence = SENTENCE_END.test(current.parts[current.parts.length - 1] ?? '');

    if (tooLong || tooOld || endsSentence) {
      lines.push({ start: current.start, end: current.end, text });
      current = { start: cue.start, end: cue.end, parts: [cue.text] };
      continue;
    }
    current.parts.push(cue.text);
    current.end = Math.max(current.end, cue.end);
  }
  if (current !== null) {
    lines.push({ start: current.start, end: current.end, text: current.parts.join(' ') });
  }
  return lines.filter((line) => line.text.trim().length > 0);
}

export interface TranscriptSection {
  title: string | null;
  start: number;
  cues: Cue[];
}

/** Cues nach Kapiteln aufteilen. Ohne Kapitel: ein Abschnitt ohne Titel. */
export function splitByChapters(
  cues: readonly Cue[],
  chapters: readonly Chapter[],
): TranscriptSection[] {
  if (chapters.length === 0) {
    return [{ title: null, start: cues[0]?.start ?? 0, cues: [...cues] }];
  }
  const sections: TranscriptSection[] = [];
  const firstStart = chapters[0]?.start ?? 0;

  // Cues vor dem ersten Kapitel gehen nicht verloren.
  const leading = cues.filter((cue) => cue.start < firstStart);
  if (leading.length > 0) {
    sections.push({ title: null, start: leading[0]?.start ?? 0, cues: leading });
  }
  for (const chapter of chapters) {
    const inChapter = cues.filter((cue) => cue.start >= chapter.start && cue.start < chapter.end);
    if (inChapter.length === 0) continue;
    sections.push({ title: chapter.title, start: chapter.start, cues: inChapter });
  }
  return sections;
}

function frontmatter(
  context: TranscriptContext,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    /* `doc_type` statt `type`: eine Rohquelle ist kein Dokumenttyp des Vaults —
       so haelt es auch die bestehende Rohquelle unter `raw/web/`. */
    doc_type: 'transcript',
    video_id: context.videoId,
    title: context.title ?? null,
    channel: context.channel ?? null,
    url: watchUrl(context.videoId),
    transcript_language: context.language ?? null,
    transcript_kind: context.kind ?? null,
    transcript_provider: context.provider ?? null,
    duration_seconds: Number.isFinite(Number(context.duration)) ? Number(context.duration) : null,
    ...extra,
  };
}

/** `transcript.md`: Prosa mit Kapitel-Ueberschriften — die Datei fuer die Verdichtung. */
export function renderProseTranscript(cues: readonly Cue[], context: TranscriptContext): string {
  const chapters = normalizeChapters(context.chapters, context.duration ?? null);
  const words = cues.reduce((total, cue) => total + countWords(cue.text), 0);
  const lines = [`# ${context.title ?? context.videoId} — Transcript`, ''];

  if (cues.length === 0) {
    lines.push('_Kein Transcript verfuegbar._');
  } else {
    for (const section of splitByChapters(cues, chapters)) {
      if (section.title !== null) {
        lines.push(`## ${formatTimecode(section.start)} — ${section.title}`, '');
      }
      for (const paragraph of buildParagraphs(section.cues)) lines.push(paragraph.text, '');
    }
  }

  return markdownDoc(
    frontmatter(context, {
      transcript_style: 'prose',
      word_count: words,
      cue_count: cues.length,
    }),
    lines,
  );
}

/** `transcript.timestamped.md`: eine Zeile pro Satz mit Deep-Link, zum Zitieren. */
export function renderTimestampedTranscript(
  cues: readonly Cue[],
  context: TranscriptContext,
): string {
  const chapters = normalizeChapters(context.chapters, context.duration ?? null);
  const lines = [`# ${context.title ?? context.videoId} — Transcript (timestamped)`, ''];

  if (cues.length === 0) {
    lines.push('_Kein Transcript verfuegbar._');
  } else {
    for (const section of splitByChapters(cues, chapters)) {
      if (section.title !== null) {
        lines.push(`## ${formatTimecode(section.start)} — ${section.title}`, '');
      }
      for (const line of buildTimestampedLines(section.cues)) {
        const label = formatTimecode(line.start, { padHours: true });
        lines.push(`- [\`${label}\`](${timestampUrl(context.videoId, line.start)}) ${line.text}`);
      }
      lines.push('');
    }
  }

  return markdownDoc(frontmatter(context, { transcript_style: 'timestamped' }), lines);
}
