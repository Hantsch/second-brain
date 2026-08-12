/**
 * Kapitel eines Videos: normalisieren und, wenn kein Provider welche liefert, aus
 * den Zeitmarken der Description lesen. Portiert aus
 * `../yougrab/src/shared/transcript.js` und `metadata.js`.
 *
 * Kapitel sind fuer die Verdichtung wertvoll: sie werden `##`-Ueberschriften im
 * Transcript, und ein Chunker kann an semantischen Grenzen schneiden statt nach
 * Zeichenzahl.
 */

/** Ein Kapitel mit Ende — `end` ist der Anfang des naechsten oder das Videoende. */
export interface Chapter {
  start: number;
  end: number;
  title: string;
}

/** Kapitel, wie Provider sie liefern: yt-dlp `start_time`, andere `start`. */
export interface RawChapter {
  start_time?: unknown;
  end_time?: unknown;
  start?: unknown;
  end?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  title?: unknown;
  name?: unknown;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Kapitel-Metadaten auf eine Form bringen. Kapitel ohne verwertbare Startzeit
 * fliegen raus — ein Kapitel bei Sekunde 0, das keine Zeit hatte, waere eine
 * Behauptung ueber die Quelle.
 */
export function normalizeChapters(chapters: unknown, totalDuration?: number | null): Chapter[] {
  const list = (Array.isArray(chapters) ? (chapters as RawChapter[]) : [])
    .map((chapter, index) => {
      if (chapter === null || typeof chapter !== 'object') return null;
      const start = toNumber(chapter.start_time ?? chapter.start ?? chapter.startTime);
      if (start === null || start < 0) return null;
      const end = toNumber(chapter.end_time ?? chapter.end ?? chapter.endTime);
      const title = String(chapter.title ?? chapter.name ?? `Kapitel ${index + 1}`).trim();
      return { start, end: end !== null && end > start ? end : null, title };
    })
    .filter(
      (chapter): chapter is { start: number; end: number | null; title: string } =>
        chapter !== null,
    )
    .sort((a, b) => a.start - b.start);

  const fallbackEnd = toNumber(totalDuration) ?? Number.POSITIVE_INFINITY;

  return list.map((chapter, index) => ({
    start: chapter.start,
    end:
      chapter.end ??
      (index + 1 < list.length ? (list[index + 1]?.start ?? fallbackEnd) : fallbackEnd),
    title: chapter.title.length > 0 ? chapter.title : `Kapitel ${index + 1}`,
  }));
}

const TIMESTAMP_LINE = /(?:^|\s|[([])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$|[)\]])/;

/**
 * Kapitelmarken aus der Description lesen — der Fallback, wenn der Provider keine
 * `chapters` liefert (die Innertube-Antwort tut das nicht immer).
 *
 * Bewusst streng, damit ein 'schau ab 3:12' kein Kapitel wird: mindestens drei
 * Marken, streng aufsteigend, die erste innerhalb der ersten Minute, keine hinter
 * dem Videoende.
 */
export function parseChaptersFromDescription(
  description: string | null,
  duration?: number | null,
): Chapter[] {
  const candidates: { start: number; title: string }[] = [];

  for (const line of String(description ?? '').split('\n')) {
    const match = TIMESTAMP_LINE.exec(line);
    if (match === null || match[1] === undefined) continue;
    const parts = match[1].split(':').map(Number);
    const start =
      parts.length === 3
        ? (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
        : (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
    if (!Number.isFinite(start)) continue;

    // Fuehrende Bullets, Klammern und Bindestriche weg — Ziffern bleiben, sonst
    // wuerde aus '0:00 3 Gruende' ein 'Gruende'.
    const title = line
      .replace(match[1], '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length === 0) continue;
    candidates.push({ start, title });
  }

  if (candidates.length < 3) return [];
  if ((candidates[0]?.start ?? 0) > 60) return [];
  for (let i = 1; i < candidates.length; i += 1) {
    if ((candidates[i]?.start ?? 0) <= (candidates[i - 1]?.start ?? 0)) return [];
  }
  const total = toNumber(duration);
  if (total !== null && (candidates[candidates.length - 1]?.start ?? 0) > total) return [];

  return normalizeChapters(candidates, total);
}
