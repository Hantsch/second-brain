import { describe, expect, it } from 'vitest';
import { sanitize } from '@core/llm';
import { redactKeyLikeStrings, redactSecret } from '@core/llm/redact';

describe('redactSecret', () => {
  it('entfernt jedes Vorkommen des Schlüssels', () => {
    const key = 'sk-ant-abcdef1234567890';
    const text = `Header x-api-key: ${key}; erneut ${key}`;
    expect(redactSecret(text, key)).toBe('Header x-api-key: ***; erneut ***');
  });

  it('lässt sehr kurze oder fehlende Schlüssel unangetastet', () => {
    expect(redactSecret('a b c', null)).toBe('a b c');
    expect(redactSecret('a b c', 'a')).toBe('a b c');
  });
});

describe('redactKeyLikeStrings', () => {
  it('entfernt auch unbekannte Schlüssel, die wie Schlüssel aussehen', () => {
    expect(redactKeyLikeStrings('key=sk-proj-AbCdEf123456 rest')).toBe('key=*** rest');
    expect(redactKeyLikeStrings('Authorization: Bearer abcdef1234567890')).toBe(
      'Authorization: ***',
    );
  });

  it('lässt normalen Text stehen', () => {
    expect(redactKeyLikeStrings('Der Vault liegt unter D:/vault.')).toBe(
      'Der Vault liegt unter D:/vault.',
    );
  });
});

describe('sanitize', () => {
  it('begrenzt die Länge, damit eine Fehlerseite keine Logs flutet', () => {
    const long = 'x'.repeat(1000);
    const result = sanitize(long, null, 50);
    expect(result).toHaveLength(51);
    expect(result.endsWith('…')).toBe(true);
  });

  it('entfernt Schlüssel und Schlüssel-ähnliches in einem Durchgang', () => {
    const text = 'HTTP 401: invalid key sk-live-ABCDEF123456 (mein-eigener-key-wert)';
    expect(sanitize(text, 'mein-eigener-key-wert')).toBe('HTTP 401: invalid key *** (***)');
  });
});
