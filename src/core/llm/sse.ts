/* Server-sent events, the way both providers stream them. The decoder has to
   handle chunks arriving in pieces: a `data:` field can arrive split across
   two TCP packets, so it buffers until a blank line closes the event. */

export interface SseEvent {
  /** `event:` field, or null if the service doesn't send one (OpenAI sends none). */
  event: string | null;
  /** All `data:` lines of the event, joined with \n. */
  data: string;
}

/**
 * Stateful decoder: `push` per chunk, `flush` at the end.
 * Tolerates \n and \r\n, ignores comment lines (`:` at the start) and field
 * names we don't care about (`id`, `retry`).
 */
export class SseDecoder {
  private buffer = '';

  /** Returns all events that this chunk completed. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    // An event ends at a blank line; everything after that stays in the buffer.
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

  /** Remainder of the buffer as an (incomplete but usable) event. */
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
    // Exactly one space is allowed after the colon that doesn't belong to the value.
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value;
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/** A byte or text stream, the way `fetch` delivers it — or a fake in a test. */
export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;

function hasGetReader(source: ByteSource): source is ReadableStream<Uint8Array> {
  return typeof (source as { getReader?: unknown }).getReader === 'function';
}

/**
 * Reads a response stream and calls `onEvent` per SSE event.
 * If the caller aborts, the reader throws — that's enough as a cancellation.
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
