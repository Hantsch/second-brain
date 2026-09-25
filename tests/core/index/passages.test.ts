import { describe, expect, it } from 'vitest';
import { PASSAGE_TARGET_CHARS, PASSAGE_THRESHOLD_CHARS, splitPassages } from '@core/index/passages';

describe('splitPassages', () => {
  it('a short body is one passage', () => {
    const body = ['## Stand', '', 'Ein kurzer Rumpf.', ''].join('\n');
    const passages = splitPassages(body, 5);
    expect(passages).toHaveLength(1);
    expect(passages[0]).toEqual({
      startLine: 5,
      endLine: 5 + body.split('\n').length - 1,
      text: body,
    });
  });

  it('a 40k body splits into passages under the target that cover every line exactly once', () => {
    const lines: string[] = [];
    for (let i = 0; i < 800; i += 1) {
      lines.push(`Zeile ${i} mit etwas Fuelltext, damit die Datei lang genug wird.`);
      if (i % 5 === 4) lines.push('');
    }
    const body = lines.join('\n');
    expect(body.length).toBeGreaterThan(PASSAGE_THRESHOLD_CHARS * 5);

    const bodyLine = 3;
    const passages = splitPassages(body, bodyLine);

    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) {
      expect(passage.text.length).toBeLessThanOrEqual(PASSAGE_TARGET_CHARS);
    }

    // Concatenating all passage texts in order reproduces the body's lines exactly.
    expect(passages.map((passage) => passage.text).join('\n')).toBe(body);

    // No overlap, no gap: each passage starts right after the previous one ended.
    for (let i = 1; i < passages.length; i += 1) {
      expect(passages[i]?.startLine).toBe((passages[i - 1]?.endLine ?? 0) + 1);
    }
    expect(passages[0]?.startLine).toBe(bodyLine);
    const lastPassage = passages.at(-1);
    expect(lastPassage?.endLine).toBe(bodyLine + lines.length - 1);
  });

  it('passage lines are real file lines', () => {
    const lines: string[] = [];
    for (let i = 0; i < 400; i += 1) {
      lines.push(`Absatz ${i} als eigenstaendige Zeile ohne Struktur, nur um Laenge zu erzeugen.`);
    }
    const body = lines.join('\n');
    const bodyLine = 42;
    const passages = splitPassages(body, bodyLine);

    for (const passage of passages) {
      const expected = lines.slice(passage.startLine - bodyLine, passage.endLine - bodyLine + 1);
      expect(passage.text).toBe(expected.join('\n'));
    }
  });

  it('an overlong single line is not cut', () => {
    const longLine = 'x'.repeat(PASSAGE_TARGET_CHARS + 2000);
    const body = ['Kurze Zeile davor.', longLine, 'Kurze Zeile danach.'].join('\n');
    const passages = splitPassages(body, 1);

    const overlong = passages.find((passage) => passage.text === longLine);
    expect(overlong).toBeDefined();
    expect(overlong?.startLine).toBe(overlong?.endLine);
  });
});
