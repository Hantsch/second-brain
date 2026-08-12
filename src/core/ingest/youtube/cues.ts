/**
 * Untertitel-Formate → normalisierte Cues. Portiert aus
 * `../yougrab/src/shared/subtitles.js`.
 *
 * Ein Cue ist `{ start, end, text }` mit Sekunden als Zahl und bereits bereinigtem
 * Text (keine Tags, keine Entities, Whitespace kollabiert).
 *
 * json3 ist YouTubes eigenes Format und die bevorzugte Quelle: bei auto-generierten
 * Captions liefert VTT jede Zeile zweimal (Rolling-Window des Overlays).
 */

/** Ein Untertitel-Ausschnitt in Sekunden. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
};

export function decodeEntities(input: string): string {
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** Tags raus, Entities aufloesen, Whitespace kollabieren. */
export function cleanText(input: unknown): string {
  if (input === null || input === undefined) return '';
  let text = String(input);
  text = text.replace(/<[^>]*>/g, ' '); // <c>, <i>, <00:00:01.000> ...
  text = decodeEntities(text);
  // Unsichtbare Zeichen einzeln, nicht als Zeichenklasse: ein Zero-Width-Joiner in
  // einer Klasse liest sich als verbundene Zeichenfolge und ist damit missverstaendlich.
  text = text.replace(/\u200B|\u200C|\u200D|\uFEFF/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

/** `01:02:03.456`, `02:03.456` oder `01:02:03,456` → Sekunden. */
export function parseTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(value).trim());
  if (match === null) return null;
  const millis = match[4] === undefined ? 0 : Number(match[4].padEnd(3, '0'));
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + millis / 1000;
}

function pushCue(cues: Cue[], start: number, end: number, text: unknown): void {
  const clean = cleanText(text);
  if (clean.length === 0) return;
  const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
  const safeEnd = Number.isFinite(end) && end > safeStart ? end : safeStart;
  cues.push({ start: safeStart, end: safeEnd, text: clean });
}

/** Chronologisch sortieren und direkt aufeinanderfolgende Dubletten entfernen. */
export function dedupeCues(cues: readonly Cue[]): Cue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const out: Cue[] = [];
  for (const cue of sorted) {
    const previous = out[out.length - 1];
    if (previous !== undefined && previous.text === cue.text && cue.start - previous.start < 1) {
      continue;
    }
    out.push(cue);
  }
  return out;
}

interface Json3Segment {
  utf8?: unknown;
}
interface Json3Event {
  tStartMs?: unknown;
  dDurationMs?: unknown;
  segs?: unknown;
}

/**
 * json3: `{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }`.
 *
 * Bei auto-generierten Captions markieren `'\n'`-Segmente die Rolling-Grenzen des
 * Overlays, nicht echte Umbrueche — sie fliegen raus. Events ohne `segs` sind
 * Fenster-Definitionen und ebenso irrelevant.
 */
export function parseJson3(raw: string | unknown): Cue[] {
  const data: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const events =
    data !== null &&
    typeof data === 'object' &&
    Array.isArray((data as { events?: unknown }).events)
      ? ((data as { events: Json3Event[] }).events ?? [])
      : [];
  const cues: Cue[] = [];

  for (const event of events) {
    if (event === null || typeof event !== 'object' || !Array.isArray(event.segs)) continue;
    const text = (event.segs as Json3Segment[])
      .map((seg) => (seg !== null && typeof seg.utf8 === 'string' ? seg.utf8 : ''))
      .filter((chunk) => chunk !== '\n')
      .join('');
    if (text.trim().length === 0) continue;
    const startMs = Number(event.tStartMs) || 0;
    const durationMs = Number(event.dDurationMs) || 0;
    pushCue(cues, startMs / 1000, (startMs + durationMs) / 1000, text);
  }
  return dedupeCues(cues);
}

/**
 * WebVTT. Auto-Captions wiederholen die vorige Zeile im naechsten Cue
 * ('Rolling Window'), deshalb der Abgleich gegen die letzte Ausgabe.
 */
export function parseVtt(raw: string): Cue[] {
  const lines = String(raw).replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let lastLine = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const arrow = line.indexOf('-->');
    if (arrow === -1) continue;

    const start = parseTimestamp(line.slice(0, arrow));
    if (start === null) continue;
    const endPart = (
      line
        .slice(arrow + 3)
        .trim()
        .split(/\s+/)[0] ?? ''
    ).trim();
    const end = parseTimestamp(endPart);

    const body: string[] = [];
    for (let j = i + 1; j < lines.length && (lines[j] ?? '').trim() !== ''; j += 1) {
      if ((lines[j] ?? '').includes('-->')) break;
      body.push(lines[j] ?? '');
      i = j;
    }

    const kept: string[] = [];
    for (const entry of body) {
      const clean = cleanText(entry);
      if (clean.length === 0 || clean === lastLine) continue;
      kept.push(clean);
      lastLine = clean;
    }
    if (kept.length === 0) continue;
    pushCue(cues, start, end === null ? start : end, kept.join(' '));
  }
  return dedupeCues(cues);
}

/** SRT: nummerierte Bloecke mit `HH:MM:SS,mmm --> HH:MM:SS,mmm`. */
export function parseSrt(raw: string): Cue[] {
  const blocks = String(raw)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex === -1) continue;
    const [startPart, endPart] = (lines[timeIndex] ?? '').split('-->');
    const start = parseTimestamp(startPart ?? '');
    if (start === null) continue;
    const end = parseTimestamp(endPart ?? '');
    pushCue(cues, start, end === null ? start : end, lines.slice(timeIndex + 1).join(' '));
  }
  return dedupeCues(cues);
}

/** Ein Cue-Eintrag, wie fremde Pakete ihn liefern (youtubei.js, timedtext). */
export interface RawCueEntry {
  start?: unknown;
  offset?: unknown;
  start_ms?: unknown;
  end_ms?: unknown;
  duration?: unknown;
  text?: unknown;
  snippet?: unknown;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Fremde Cue-Listen normalisieren. Offsets kommen je nach Paketversion in Sekunden
 * oder Millisekunden — die Einheit wird an der typischen Cue-Dauer erkannt
 * (Sekunden ~1–10, Millisekunden ~1000–10000).
 */
export function normalizeCueList(entries: readonly RawCueEntry[] | unknown): Cue[] {
  const items = (Array.isArray(entries) ? (entries as RawCueEntry[]) : [])
    .map((entry) => ({
      start: Number(entry?.start ?? entry?.offset ?? entry?.start_ms ?? 0) || 0,
      duration:
        entry?.duration !== undefined && entry.duration !== null
          ? Number(entry.duration) || 0
          : entry?.end_ms !== undefined && entry.end_ms !== null
            ? Number(entry.end_ms) - (Number(entry.start_ms) || 0)
            : 0,
      text: entry?.text ?? entry?.snippet ?? '',
    }))
    .filter((entry) => cleanText(entry.text).length > 0);

  if (items.length === 0) return [];

  const durations = items.map((item) => item.duration).filter((value) => value > 0);
  const maxStart = Math.max(...items.map((item) => item.start));
  const medianDuration = durations.length > 0 ? median(durations) : 0;
  const looksLikeMillis = medianDuration > 100 || (medianDuration === 0 && maxStart > 100_000);
  const divisor = looksLikeMillis ? 1000 : 1;

  const cues: Cue[] = [];
  for (const item of items) {
    const start = item.start / divisor;
    pushCue(cues, start, start + item.duration / divisor, item.text);
  }
  return dedupeCues(cues);
}

/**
 * Format am Inhalt erkennen und parsen — robuster, als sich auf die Dateiendung zu
 * verlassen. `hint` ist Endung oder Formatname und wird nur als Hinweis genommen.
 */
export function parseSubtitles(content: string, hint?: string): Cue[] {
  const text = String(content ?? '');
  if (text.trim().length === 0) return [];

  const normalizedHint = String(hint ?? '').toLowerCase();
  const trimmed = text.trimStart();

  if (trimmed.startsWith('{') || normalizedHint.includes('json')) {
    try {
      return parseJson3(text);
    } catch {
      /* faellt unten auf VTT/SRT zurueck */
    }
  }
  if (/^WEBVTT/i.test(trimmed) || normalizedHint.includes('vtt')) return parseVtt(text);
  if (normalizedHint.includes('srt')) return parseSrt(text);
  if (text.includes('-->')) return /,\d{3}\s*-->/.test(text) ? parseSrt(text) : parseVtt(text);
  return [];
}

/** Woerter eines Textes — die Kennzahl in der Transcript-Frontmatter. */
export function countWords(text: string): number {
  const matches = String(text ?? '').match(/\S+/g);
  return matches === null ? 0 : matches.length;
}
