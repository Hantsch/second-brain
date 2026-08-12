import { describe, expect, it } from 'vitest';
import { SseDecoder, readSseStream } from '@core/llm/sse';
import { sseResponse } from '../../fakes/llm';

describe('SseDecoder', () => {
  it('liest ein vollständiges Ereignis', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: hallo\n\n')).toEqual([{ event: null, data: 'hallo' }]);
  });

  it('hält ein unvollständiges Ereignis zurück, bis die Leerzeile kommt', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: hal')).toEqual([]);
    expect(decoder.push('lo')).toEqual([]);
    expect(decoder.push('\n\n')).toEqual([{ event: null, data: 'hallo' }]);
  });

  it('setzt ein JSON-Ereignis aus beliebig zerstückelten Chunks zusammen', () => {
    const payload = JSON.stringify({ choices: [{ delta: { content: 'Servus' } }] });
    const raw = `data: ${payload}\n\ndata: [DONE]\n\n`;
    const decoder = new SseDecoder();
    const events = [];
    // Ein Zeichen pro Chunk ist der härteste Fall, den ein Netzwerk liefern kann.
    for (const char of raw) events.push(...decoder.push(char));
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[0]?.data ?? '')).toEqual({
      choices: [{ delta: { content: 'Servus' } }],
    });
    expect(events[1]?.data).toBe('[DONE]');
  });

  it('liefert mehrere Ereignisse aus einem Chunk in Reihenfolge', () => {
    const decoder = new SseDecoder();
    const events = decoder.push('data: eins\n\ndata: zwei\n\ndata: dr');
    expect(events.map((event) => event.data)).toEqual(['eins', 'zwei']);
    expect(decoder.push('ei\n\n').map((event) => event.data)).toEqual(['drei']);
  });

  it('versteht \\r\\n und mehrzeilige data-Felder', () => {
    const decoder = new SseDecoder();
    const events = decoder.push('event: message\r\ndata: eins\r\ndata: zwei\r\n\r\n');
    expect(events).toEqual([{ event: 'message', data: 'eins\nzwei' }]);
  });

  it('ignoriert Kommentare, Keep-alives und unbekannte Felder', () => {
    const decoder = new SseDecoder();
    expect(decoder.push(': keep-alive\n\n')).toEqual([]);
    expect(decoder.push('id: 7\nretry: 100\ndata: x\n\n')).toEqual([{ event: null, data: 'x' }]);
  });

  it('gibt einen Rest ohne abschließende Leerzeile über flush heraus', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: rest')).toEqual([]);
    expect(decoder.flush()).toEqual([{ event: null, data: 'rest' }]);
    expect(decoder.flush()).toEqual([]);
  });

  it('behält Leerzeichen jenseits des ersten nach dem Doppelpunkt', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data:  zwei Leerzeichen\n\n')).toEqual([
      { event: null, data: ' zwei Leerzeichen' },
    ]);
  });
});

describe('readSseStream', () => {
  it('liest einen Antwortstrom, dessen Chunks mitten im Ereignis brechen', async () => {
    const response = sseResponse(['data: {"a":', '1}\n\nda', 'ta: [DONE]\n\n']);
    const seen: string[] = [];
    await readSseStream(response.body, (event) => seen.push(event.data));
    expect(seen).toEqual(['{"a":1}', '[DONE]']);
  });

  it('verträgt einen leeren Rumpf', async () => {
    const seen: string[] = [];
    await readSseStream(null, (event) => seen.push(event.data));
    expect(seen).toEqual([]);
  });

  it('liest auch eine asynchrone Folge von Textstücken', async () => {
    async function* source(): AsyncGenerator<string> {
      yield 'data: eins\n';
      yield '\ndata: zwei\n\n';
    }
    const seen: string[] = [];
    await readSseStream(source(), (event) => seen.push(event.data));
    expect(seen).toEqual(['eins', 'zwei']);
  });
});
