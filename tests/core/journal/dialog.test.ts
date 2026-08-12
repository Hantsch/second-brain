/* Das Gespräch im Tageseintrag. Zwei Zusicherungen werden hart geprüft:

   - **Roundtrip**: was `appendTurn` schreibt, liest `parseDialog` unverändert
     zurück — auch mehrzeilig und mit Leerzeile im Text.
   - **Handarbeit überlebt**: von Hand ergänzte Zeilen und fremde Blöcke bleiben in
     der Datei stehen; gelesen werden sie nicht, gelöscht wird nie. */

import { describe, expect, it } from 'vitest';
import { JournalError, appendTurn, dialogHistory, formatTurn, parseDialog } from '@core/journal';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { NOW_MS } from '../../helpers/time';
import { DAY, DAY_PATH, FRESH_DAY, FRESH_PATH, journalFile, journalFixture } from './fixtures';

function bodyOf(content: string): string {
  const end = content.indexOf('\n---\n', 4);
  return end < 0 ? content : content.slice(end + 5);
}

describe('formatTurn', () => {
  it('schreibt das Blockquote-Format aus VAULT-FORMAT.md', () => {
    expect(formatTurn('user', 'Der Sprint fühlt sich unmöglich an.', '18:40')).toBe(
      ['> **Ich** — 18:40', '> Der Sprint fühlt sich unmöglich an.'].join('\n'),
    );
    expect(formatTurn('assistant', 'Ich höre.', '18:41')).toBe(
      ['> **Second Brain** — 18:41', '> Ich höre.'].join('\n'),
    );
  });

  it('hält einen mehrzeiligen Text in einem Block zusammen', () => {
    const block = formatTurn('assistant', 'Erste Zeile.\n\nZweiter Absatz.', '09:05');
    expect(block).toBe(
      ['> **Second Brain** — 09:05', '> Erste Zeile.', '>', '> Zweiter Absatz.'].join('\n'),
    );
  });

  it('benennt den Sprecher in der Dokumentsprache', () => {
    expect(formatTurn('user', 'Rough day.', '20:00', 'en')).toContain('> **Me** — 20:00');
  });
});

describe('parseDialog', () => {
  it('liest den Dialog des Fixture-Tages', async () => {
    const fixture = await journalFixture();
    const turns = parseDialog(bodyOf(await fixture.text(DAY_PATH)));

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(turns[0]?.text).toBe('Der Sprint fühlt sich unmöglich an.');
    expect(turns[0]?.at).toBe('18:40');
    expect(turns[1]?.text).toContain('Was heute an dir hing, ist fertig.');
  });

  it('ist ein Roundtrip mit formatTurn — auch mehrzeilig', () => {
    const body = [
      '## Gespräch',
      '',
      formatTurn('user', 'Zu viel heute.\n\nUnd morgen die Abnahme.', '21:05'),
      '',
      formatTurn('assistant', 'Ich höre zu.', '21:05'),
      '',
    ].join('\n');

    const turns = parseDialog(body);

    expect(turns).toHaveLength(2);
    expect(turns[0]?.text).toBe('Zu viel heute.\n\nUnd morgen die Abnahme.');
    expect(turns[1]?.role).toBe('assistant');
  });

  it('überspringt kaputte und fremde Blöcke, statt sie zu deuten', () => {
    const body = [
      '## Gespräch',
      '',
      '> Ein Blockquote ohne Sprecher.',
      '',
      '> **Notiz** — 12:00',
      '> Von Hand ergänzt, kein Sprecher des Gesprächs.',
      '',
      '> **Ich** — 12:05',
      '> Das hier zählt.',
      '',
      '> **Second Brain** — 12:06',
      '',
    ].join('\n');

    const turns = parseDialog(body);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.text).toBe('Das hier zählt.');
  });

  it('ist leer, wenn es keinen Gesprächsabschnitt gibt', () => {
    expect(parseDialog('## Tag\n\nNur Prosa.\n')).toEqual([]);
  });

  it('liest auch den englischen Abschnittsnamen', () => {
    const body = ['## Conversation', '', formatTurn('user', 'Rough day.', '20:00', 'en')].join(
      '\n',
    );
    expect(parseDialog(body)[0]?.role).toBe('user');
  });
});

describe('appendTurn', () => {
  it('hängt unter „Gespräch" an und liest sich zurück', async () => {
    const fixture = await journalFixture();

    await appendTurn(fixture.store, DAY, 'user', 'Und jetzt noch die Ladezeiten.', {
      now: NOW_MS,
    });

    const content = await fixture.text(DAY_PATH);
    expect(content).toContain('> **Ich** — 14:32\n> Und jetzt noch die Ladezeiten.');
    const turns = parseDialog(bodyOf(content));
    expect(turns).toHaveLength(3);
    expect(turns[2]?.text).toBe('Und jetzt noch die Ladezeiten.');
    /* Der Abschnitt danach bleibt, wo er war. */
    expect(content.indexOf('## Gespräch')).toBeLessThan(content.indexOf('## Fakten'));
  });

  it('lässt von Hand ergänzte Zeilen stehen', async () => {
    const dialogue = [
      '> **Ich** — 09:00',
      '> Erste Runde.',
      '',
      'Eigene Randnotiz, mitten im Abschnitt.',
      '',
      '> **Notiz** — 09:30',
      '> Von Hand ergänzt.',
    ].join('\n');
    const fixture = await journalFixture({
      sample: false,
      files: { [FRESH_PATH]: journalFile(FRESH_DAY, 'Kurzer Tag.', { dialogue }) },
    });

    await appendTurn(fixture.store, FRESH_DAY, 'assistant', 'Neue Antwort.', { now: NOW_MS });

    const content = await fixture.text(FRESH_PATH);
    expect(content).toContain('Eigene Randnotiz, mitten im Abschnitt.');
    expect(content).toContain('> **Notiz** — 09:30');
    expect(content).toContain('> **Second Brain** — 14:32');
    const turns = parseDialog(bodyOf(content));
    expect(turns.map((turn) => turn.text)).toEqual(['Erste Runde.', 'Neue Antwort.']);
  });

  it('legt Datei und Abschnitt an, wenn es den Tag noch nicht gibt', async () => {
    const store = new MemoryVaultStore({ now: new Date(NOW_MS) });

    const result = await appendTurn(store, FRESH_DAY, 'user', 'Erster Satz.', { now: NOW_MS });

    expect(result.path).toBe(FRESH_PATH);
    expect(result.at).toBe('14:32');
    const content = (await store.readText(FRESH_PATH)) ?? '';
    expect(content).toContain('## Gespräch\n\n> **Ich** — 14:32\n> Erster Satz.');
  });

  it('protokolliert keine leere Runde', async () => {
    const store = new MemoryVaultStore({ now: new Date(NOW_MS) });
    await expect(appendTurn(store, FRESH_DAY, 'user', '  \n ', {})).rejects.toThrow(JournalError);
    expect(await store.readText(FRESH_PATH)).toBeNull();
  });
});

describe('dialogHistory', () => {
  it('gibt die letzten Runden, älteste zuerst', () => {
    const body = [
      '## Gespräch',
      '',
      formatTurn('user', 'Eins', '09:00'),
      '',
      formatTurn('assistant', 'Zwei', '09:01'),
      '',
      formatTurn('user', 'Drei', '09:02'),
      '',
    ].join('\n');

    expect(dialogHistory(body, 2)).toEqual([
      { role: 'assistant', content: 'Zwei' },
      { role: 'user', content: 'Drei' },
    ]);
    expect(dialogHistory(body, 0)).toEqual([]);
  });
});
