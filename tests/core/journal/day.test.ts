/* Die Tagesdatei. Geprüft wird, was VAULT-FORMAT.md verlangt:
   - `ensureDay` legt genau das Format an — und ändert beim zweiten Mal nichts.
   - Der Titel ist das ausgeschriebene Datum in der Dokumentsprache.
   - `setMood` ändert genau eine Zeile und lässt den Stil des Nutzers stehen.
   - Ein Schreibvorgang auf veraltetem Hash schlägt fehl, statt zu überschreiben. */

import { describe, expect, it } from 'vitest';
import {
  JournalError,
  appendAnswer,
  appendEntry,
  appendToDay,
  ensureDay,
  journalTitle,
  listDays,
  pathFor,
  readDay,
  setClosed,
  setMood,
} from '@core/journal';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { NOW_MS, TODAY } from '../../helpers/time';
import { DAY, DAY_PATH, FRESH_DAY, FRESH_PATH, journalFile, journalFixture } from './fixtures';

function emptyStore(): MemoryVaultStore {
  return new MemoryVaultStore({ now: new Date(NOW_MS) });
}

describe('pathFor', () => {
  it('folgt dem Ordnerschema aus VAULT-FORMAT.md', () => {
    expect(pathFor(TODAY)).toBe(DAY_PATH);
  });

  it('weist einen Wert ab, der kein Kalendertag ist', () => {
    expect(() => pathFor('irgendwann')).toThrow(JournalError);
    expect(() => pathFor('2026-02-31')).toThrow(JournalError);
  });
});

describe('journalTitle', () => {
  it('schreibt das Datum in der Dokumentsprache aus', () => {
    expect(journalTitle('2026-08-10', 'de')).toBe('Montag, 10. August 2026');
    expect(journalTitle('2026-08-10', 'en')).toBe('Monday, 10 August 2026');
    expect(journalTitle('2026-03-01', 'de')).toBe('Sonntag, 1. März 2026');
  });
});

describe('ensureDay', () => {
  it('legt Frontmatter und genau die zwei Abschnitte "Tag"/"Fakten" an', async () => {
    const store = emptyStore();
    const result = await ensureDay(store, FRESH_DAY, 'de');

    expect(result.created).toBe(true);
    expect(result.path).toBe(FRESH_PATH);
    const content = (await store.readText(FRESH_PATH)) ?? '';
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('type: journal');
    expect(content).toContain('title: Dienstag, 11. August 2026');
    expect(content).toContain('date: 2026-08-11');
    expect(content).toContain('tags: []');
    expect(content).toContain('## Tag');
    expect(content).toContain('## Fakten');
    /* Kein "Gespräch" mehr fuer neue Tage (011): Prosa und App-Antworten
       teilen sich ab jetzt den "Tag"-Abschnitt. */
    expect(content).not.toContain('## Gespräch');
    const body = content.slice(content.indexOf('\n---\n', 4) + 5).replace(/^\n+/, '');
    expect(body).toBe('## Tag\n\n## Fakten\n');
    expect(result.day.date).toBe(FRESH_DAY);
    expect(result.day.turns).toBe(0);
  });

  it('schreibt die Abschnitte auf Englisch, wenn die Dokumentsprache Englisch ist', async () => {
    const store = emptyStore();
    await ensureDay(store, FRESH_DAY, 'en');

    const content = (await store.readText(FRESH_PATH)) ?? '';
    expect(content).toContain('title: Tuesday, 11 August 2026');
    expect(content).toContain('## Day');
    expect(content).toContain('## Facts');
    expect(content).not.toContain('## Conversation');
  });

  it('ist idempotent — der zweite Aufruf ändert kein Byte', async () => {
    const store = emptyStore();
    await ensureDay(store, FRESH_DAY, 'de');
    const first = await store.readText(FRESH_PATH);

    const again = await ensureDay(store, FRESH_DAY, 'de');

    expect(again.created).toBe(false);
    expect(await store.readText(FRESH_PATH)).toBe(first);
  });

  it('fasst einen vorhandenen Eintrag nicht an', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    const result = await ensureDay(fixture.store, DAY, 'de');

    expect(result.created).toBe(false);
    expect(await fixture.text(DAY_PATH)).toBe(before);
    expect(result.day.mood).toBe(3);
    expect(result.day.energy).toBe(2);
  });
});

describe('readDay', () => {
  it('liefert Ableitung und Dokument aus einem Lesevorgang', async () => {
    const fixture = await journalFixture();
    const found = await readDay(fixture.store, DAY);

    expect(found).not.toBeNull();
    expect(found?.day.date).toBe(DAY);
    expect(found?.day.people).toEqual(['Miriam', 'Jonas']);
    expect(found?.day.turns).toBe(1);
    expect(found?.doc.path).toBe(DAY_PATH);
    expect(found?.doc.hash.length).toBeGreaterThan(0);
    expect(found?.doc.frontmatter['title']).toBe('Montag, 10. August 2026');
  });

  it('ist null für einen Tag ohne Datei', async () => {
    const fixture = await journalFixture();
    expect(await readDay(fixture.store, FRESH_DAY)).toBeNull();
  });
});

describe('appendToDay', () => {
  it('hängt unter „Fakten" an und legt die Datei bei Bedarf an', async () => {
    const store = emptyStore();

    await appendToDay(store, FRESH_DAY, 'facts', '- [ ] Belege sortieren @due:2026-08-14');

    const content = (await store.readText(FRESH_PATH)) ?? '';
    expect(content).toContain('## Fakten\n\n- [ ] Belege sortieren @due:2026-08-14');
  });

  it('legt einen fehlenden Abschnitt am Dateiende an, ohne Bestand zu verschieben', async () => {
    const files = { [FRESH_PATH]: journalFile(FRESH_DAY, 'Kurzer Tag.') };
    const fixture = await journalFixture({ sample: false, files });

    const result = await appendToDay(fixture.store, FRESH_DAY, 'facts', '- [ ] Etwas tun');

    expect(result.sectionCreated).toBe(true);
    const content = await fixture.text(FRESH_PATH);
    expect(content).toContain('Kurzer Tag.');
    expect(content.indexOf('## Tag')).toBeLessThan(content.indexOf('## Fakten'));
  });

  it('hängt leeren Text nicht an', async () => {
    const store = emptyStore();
    await expect(appendToDay(store, FRESH_DAY, 'day', '   ')).rejects.toThrow(JournalError);
  });
});

describe('appendEntry', () => {
  it('hängt Prosa unter „Tag" an und legt den Tag bei Bedarf an', async () => {
    const store = emptyStore();

    const result = await appendEntry(store, FRESH_DAY, 'Kurzer Gedanke zum Tag.');

    expect(result.path).toBe(FRESH_PATH);
    const content = (await store.readText(FRESH_PATH)) ?? '';
    expect(content).toContain('## Tag\n\nKurzer Gedanke zum Tag.');
  });

  it('hängt leeren Text nicht an', async () => {
    const store = emptyStore();
    await expect(appendEntry(store, FRESH_DAY, '  \n ')).rejects.toThrow(JournalError);
    expect(await store.readText(FRESH_PATH)).toBeNull();
  });

  it('schreibt nicht mit veraltetem Hash', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    await expect(
      appendEntry(fixture.store, DAY, 'Noch ein Gedanke.', { expectedHash: 'von-vorgestern' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });
});

describe('appendAnswer', () => {
  it('hängt das Blockzitat unter „Tag" an', async () => {
    const store = emptyStore();

    const result = await appendAnswer(store, FRESH_DAY, 'Ich höre.', { now: NOW_MS });

    expect(result.at).toBe('14:32');
    const content = (await store.readText(FRESH_PATH)) ?? '';
    expect(content).toContain('## Tag\n\n> **Second Brain** — 14:32\n> Ich höre.');
  });

  it('landet zusammen mit appendEntry in Schreibreihenfolge im „Tag"-Abschnitt', async () => {
    const store = emptyStore();

    await appendEntry(store, FRESH_DAY, 'Erster Gedanke.');
    await appendAnswer(store, FRESH_DAY, 'Ich höre.', { now: NOW_MS });
    await appendEntry(store, FRESH_DAY, 'Noch ein Gedanke.');

    const content = (await store.readText(FRESH_PATH)) ?? '';
    const entryOne = content.indexOf('Erster Gedanke.');
    const answer = content.indexOf('> **Second Brain**');
    const entryTwo = content.indexOf('Noch ein Gedanke.');
    expect(entryOne).toBeGreaterThan(-1);
    expect(entryOne).toBeLessThan(answer);
    expect(answer).toBeLessThan(entryTwo);
    /* Alles noch im "Tag"-Abschnitt, nicht in einem separaten "Fakten". */
    expect(entryTwo).toBeLessThan(content.indexOf('## Fakten'));
  });

  it('hängt leeren Text nicht an', async () => {
    const store = emptyStore();
    await expect(appendAnswer(store, FRESH_DAY, '  \n ')).rejects.toThrow(JournalError);
    expect(await store.readText(FRESH_PATH)).toBeNull();
  });

  it('schreibt nicht mit veraltetem Hash', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    await expect(
      appendAnswer(fixture.store, DAY, 'Antwort.', { expectedHash: 'von-vorgestern' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });
});

describe('listDays', () => {
  it('gibt die Tage neueste zuerst und lässt Lücken Lücken', async () => {
    const fixture = await journalFixture({
      sample: false,
      files: {
        'journal/2026/08/2026-08-10.md': journalFile('2026-08-10', 'Heute.'),
        'journal/2026/08/2026-08-08.md': journalFile('2026-08-08', 'Vorgestern.'),
        'journal/2026/07/2026-07-31.md': journalFile('2026-07-31', 'Monatsende.'),
      },
    });

    expect(listDays(fixture.index).map((day) => day.date)).toEqual([
      '2026-08-10',
      '2026-08-08',
      '2026-07-31',
    ]);
    expect(listDays(fixture.index, 2)).toHaveLength(2);
  });
});

describe('setMood', () => {
  it('ändert genau eine Zeile und lässt den Stil des Nutzers stehen', async () => {
    const fixture = await journalFixture();
    const before = (await fixture.text(DAY_PATH)).split('\n');

    const day = await setMood(fixture.store, DAY, { mood: 5 });

    const after = (await fixture.text(DAY_PATH)).split('\n');
    const changed = after.filter((line, at) => line !== before[at]);
    expect(changed).toEqual(['mood: 5']);
    expect(after).toHaveLength(before.length);
    /* Der Titel stand in Anführungszeichen und die Personen als Flow-Liste —
       beides gehört dem Nutzer. */
    expect(after).toContain("title: 'Montag, 10. August 2026'");
    expect(after).toContain('people: [Miriam, Jonas]');
    expect(day.mood).toBe(5);
    expect(day.energy).toBe(2);
  });

  it('setzt ein fehlendes Feld an seiner kanonischen Stelle ein', async () => {
    const path = journalFile('2026-08-09', 'Ruhiger Tag.');
    const fixture = await journalFixture({
      sample: false,
      files: { 'journal/2026/08/2026-08-09.md': path },
    });

    await setMood(fixture.store, '2026-08-09', { mood: 4, energy: 3 });

    const lines = (await fixture.text('journal/2026/08/2026-08-09.md')).split('\n');
    expect(lines.indexOf('mood: 4')).toBeGreaterThan(lines.indexOf('date: 2026-08-09'));
    expect(lines.indexOf('energy: 3')).toBe(lines.indexOf('mood: 4') + 1);
    expect(lines.indexOf('tags: []')).toBeGreaterThan(lines.indexOf('energy: 3'));
  });

  it('schreibt nicht mit veraltetem Hash', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    await expect(
      setMood(fixture.store, DAY, { mood: 1 }, { expectedHash: 'von-vorgestern' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });

  it('weist Werte außerhalb der Skala ab, ohne zu schreiben', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    await expect(setMood(fixture.store, DAY, { mood: 9 })).rejects.toThrow(JournalError);
    await expect(setMood(fixture.store, DAY, {})).rejects.toThrow(JournalError);
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });

  it('meldet einen fehlenden Tag als not-found', async () => {
    const fixture = await journalFixture();
    await expect(setMood(fixture.store, FRESH_DAY, { mood: 3 })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('setClosed', () => {
  it('setzt "closed" auf das heutige Datum', async () => {
    const fixture = await journalFixture();

    const day = await setClosed(fixture.store, DAY, true, { now: NOW_MS });

    expect(day.closed).toBe(TODAY);
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain(`closed: ${TODAY}`);
  });

  it('setzt "closed" beim Wiedereröffnen auf null, statt das Feld zu entfernen', async () => {
    const fixture = await journalFixture();
    await setClosed(fixture.store, DAY, true, { now: NOW_MS });

    const day = await setClosed(fixture.store, DAY, false);

    expect(day.closed).toBeNull();
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain('closed: null');
  });

  it('schreibt nicht mit veraltetem Hash', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);

    await expect(
      setClosed(fixture.store, DAY, true, { now: NOW_MS, expectedHash: 'von-vorgestern' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });

  it('meldet einen fehlenden Tag als not-found', async () => {
    const fixture = await journalFixture();
    await expect(setClosed(fixture.store, FRESH_DAY, true, { now: NOW_MS })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
