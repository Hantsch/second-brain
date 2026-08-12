/* Server-Sent Events, wie beide Provider sie streamen. Der Dekoder muss mit
   zerstückelten Chunks umgehen: ein `data:`-Feld kann über zwei TCP-Pakete
   verteilt ankommen, deshalb wird gepuffert, bis eine Leerzeile das Ereignis
   abschließt. */

export interface SseEvent {
  /** `event:`-Feld, oder null wenn der Dienst keins schickt (OpenAI schickt keins). */
  event: string | null;
  /** Alle `data:`-Zeilen des Ereignisses, mit \n verbunden. */
  data: string;
}

/**
 * Zustandsbehafteter Dekoder: `push` je Chunk, am Ende `flush`.
 * Verträgt \n und \r\n, ignoriert Kommentarzeilen (`:` am Anfang) und Feldnamen,
 * die uns nicht interessieren (`id`, `retry`).
 */
export class SseDecoder {
  private buffer = '';

  /** Gibt alle Ereignisse zurück, die dieser Chunk vollständig gemacht hat. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    // Ein Ereignis endet an einer Leerzeile; alles danach bleibt im Puffer.
    let boundary = this.nextBoundary();
    while (boundary !== null) {
      const raw = this.buffer.slice(0, boundary.start);
      this.buffer = this.buffer.slice(boundary.end);
      const parsed = parseRecord(raw);
      if (parsed) events.push(parsed);
      boundary = this.nextBoundary();
    }
    return events;
  }

  /** Rest des Puffers als (unvollständiges, aber verwertbares) Ereignis. */
  flush(): SseEvent[] {
    const rest = this.buffer;
    this.buffer = '';
    const parsed = parseRecord(rest);
    return parsed ? [parsed] : [];
  }

  private nextBoundary(): { start: number; end: number } | null {
    const lf = this.buffer.indexOf('\n\n');
    const crlf = this.buffer.indexOf('\r\n\r\n');
    if (lf === -1 && crlf === -1) return null;
    if (crlf !== -1 && (lf === -1 || crlf < lf)) return { start: crlf, end: crlf + 4 };
    return { start: lf, end: lf + 2 };
  }
}

function parseRecord(raw: string): SseEvent | null {
  const dataLines: string[] = [];
  let event: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // Nach dem Doppelpunkt darf genau ein Leerzeichen stehen, das nicht zum Wert gehört.
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value;
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/** Ein Byte- oder Textstrom, wie `fetch` ihn liefert — oder ein Fake im Test. */
export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;

function hasGetReader(source: ByteSource): source is ReadableStream<Uint8Array> {
  return typeof (source as { getReader?: unknown }).getReader === 'function';
}

/**
 * Liest einen Antwortstrom und ruft `onEvent` je SSE-Ereignis auf.
 * Bricht der Aufrufer ab, wirft der Reader — das reicht als Abbruch.
 */
export async function readSseStream(
  source: ByteSource | null,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  if (!source) return;
  const decoder = new SseDecoder();
  const utf8 = new TextDecoder();
  const emit = (chunk: string): void => {
    for (const event of decoder.push(chunk)) onEvent(event);
  };

  if (hasGetReader(source)) {
    const reader = source.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) emit(utf8.decode(value, { stream: true }));
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    for await (const chunk of source) {
      emit(typeof chunk === 'string' ? chunk : utf8.decode(chunk, { stream: true }));
    }
  }

  for (const event of decoder.flush()) onEvent(event);
}
