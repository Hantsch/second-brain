import { describe, expect, it } from 'vitest';
import {
  JsonParseError,
  extractJsonBlock,
  normalizeJsonText,
  parseJsonLoose,
  stripCodeFences,
} from '@core/llm/json';

describe('parseJsonLoose', () => {
  it('liest reines JSON', () => {
    expect(parseJsonLoose('{"title":"Test"}')).toEqual({ title: 'Test' });
  });

  it('entfernt Code-Fences mit Sprachangabe', () => {
    const text = '```json\n{"tags":["a","b"]}\n```';
    expect(parseJsonLoose(text)).toEqual({ tags: ['a', 'b'] });
  });

  it('ignoriert Text vor und nach dem JSON', () => {
    const text = 'Klar, hier das Ergebnis:\n{"scope":"work"}\nSag Bescheid, wenn du mehr brauchst.';
    expect(parseJsonLoose(text)).toEqual({ scope: 'work' });
  });

  it('lässt sich von geschweiften Klammern in Strings nicht täuschen', () => {
    const text = '{"reason":"Klammer } im Text","confidence":0.4}';
    expect(parseJsonLoose(text)).toEqual({ reason: 'Klammer } im Text', confidence: 0.4 });
  });

  it('verkraftet ein überzähliges Komma', () => {
    expect(parseJsonLoose('{"a":1,"b":[2,3,],}')).toEqual({ a: 1, b: [2, 3] });
  });

  it('liest auch ein Array als Wurzel', () => {
    expect(parseJsonLoose('Antwort: [1,2,3]')).toEqual([1, 2, 3]);
  });

  it('wirft einen klaren Fehler, wenn gar kein JSON enthalten ist', () => {
    expect(() => parseJsonLoose('Ich bin ein Sprachmodell und kann das nicht.')).toThrow(
      JsonParseError,
    );
    expect(() => parseJsonLoose('kein JSON')).toThrow(/kein JSON-Objekt/);
  });

  it('wirft einen klaren Fehler bei kaputtem JSON', () => {
    expect(() => parseJsonLoose('{"a":1,,,"b"}')).toThrow(/kein gültiges JSON/);
  });

  it('nennt in der Fehlermeldung nie den Antworttext', () => {
    // Der Text könnte Tagebuchinhalt tragen — in ein Log darf davon nichts.
    const secretish = '{ Heute war ein schlimmer Tag mit Stefan';
    try {
      parseJsonLoose(secretish);
      expect.unreachable('hätte werfen müssen');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      expect((error as Error).message).not.toContain('Stefan');
      expect((error as JsonParseError).rawLength).toBe(secretish.length);
    }
  });
});

describe('stripCodeFences', () => {
  it('entfernt auch einen nur geöffneten Zaun', () => {
    expect(stripCodeFences('```\n{"a":1}')).toBe('{"a":1}');
  });

  it('lässt normalen Text unberührt', () => {
    expect(stripCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('extractJsonBlock', () => {
  it('nimmt das erste vollständige Objekt', () => {
    expect(extractJsonBlock('a {"x":{"y":1}} b {"z":2}')).toBe('{"x":{"y":1}}');
  });

  it('gibt null zurück, wenn der Block nicht geschlossen ist', () => {
    expect(extractJsonBlock('{"x":1')).toBeNull();
  });
});

describe('normalizeJsonText', () => {
  it('macht aus einer gerahmten Antwort kompaktes JSON', () => {
    expect(normalizeJsonText('```json\n{ "a" : 1 }\n```')).toBe('{"a":1}');
  });
});
