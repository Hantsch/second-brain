/* Gespraeche als Dateien: `.secondbrain/chats/<id>.json`.
 *
 * Der Pruefstein ist der Absturz mitten im Stream: die Frage muss auf der Platte
 * stehen, bevor die Antwort existiert. Dazu die Dinge, die eine Liste unbrauchbar
 * machen wuerden — eine kaputte Datei, eine fremde Datei, zweihundert alte
 * Gespraeche — und der Rueckweg beim Loeschen.
 */

import { describe, expect, it } from 'vitest';
import {
  ChatArchive,
  DEFAULT_THREAD_LIMIT,
  MAX_TITLE_CHARS,
  historyOf,
  newThreadId,
  parseThread,
  titleFromQuestion,
} from '@core/chat';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { ChatMessage } from '@shared/types';
import { NOW, NOW_MS } from '../../helpers/time';

const QUESTION = 'Wie lange leben Access-Token?';

/** Ein Archiv mit stehender Uhr und vorhersagbaren Kennungen. */
function setup(files: Record<string, string> = {}) {
  const store = new MemoryVaultStore({ files, now: new Date(NOW_MS) });
  let seed = 0;
  const archive = new ChatArchive(store, {
    now: () => new Date(NOW_MS),
    /* Deterministisch, aber je Aufruf anders — echte Kennungen kollidieren nicht. */
    random: () => {
      seed += 1;
      return (seed % 36) / 36;
    },
  });
  return { store, archive };
}

function question(content = QUESTION, id = 'm-1-q'): ChatMessage {
  return { id, role: 'user', content, at: NOW };
}

function answer(content: string, id = 'm-1'): ChatMessage {
  return { id, role: 'assistant', content, at: NOW, model: 'fake-small' };
}

/** Der rohe Dateiinhalt eines Gespraechs. */
async function fileOf(store: MemoryVaultStore, id: string): Promise<string> {
  const content = await store.readText(`.secondbrain/chats/${id}.json`);
  if (content === null) throw new Error(`Gespraech fehlt: ${id}`);
  return content;
}

describe('Titel und Kennungen', () => {
  it('bildet den Titel aus der ersten Frage und kuerzt ihn', () => {
    expect(titleFromQuestion(QUESTION)).toBe(QUESTION);
    const long = `Was weiss ich ueber ${'Rollenkonzepte '.repeat(12)}?`;
    const title = titleFromQuestion(long);
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(long.startsWith(title.slice(0, 20))).toBe(true);
  });

  it('baut Kennungen, die chronologisch sortieren', () => {
    const id = newThreadId(NOW_MS, () => 0.5);
    expect(id.startsWith('c-2026-08-10-')).toBe(true);
    const later = newThreadId(NOW_MS + 3_600_000, () => 0.5);
    expect(id < later).toBe(true);
  });

  it('weist eine Kennung ab, die einen Pfad bauen wuerde', async () => {
    const { archive } = setup();
    await expect(archive.get('../../boese')).rejects.toMatchObject({ code: 'invalid' });
    await expect(archive.get('mit/schraegstrich')).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('Anlegen und anhaengen', () => {
  it('schreibt die Frage sofort — vor jeder Antwort', async () => {
    const { store, archive } = setup();

    const thread = await archive.create({ kind: 'ask', first: question() });

    /* Genau das ist der Schutz gegen den Absturz mitten im Stream. */
    const raw = await fileOf(store, thread.id);
    expect(raw).toContain(QUESTION);
    expect(JSON.parse(raw)).toMatchObject({ version: 1, kind: 'ask', title: QUESTION });
    expect(thread.messages).toHaveLength(1);
    expect(thread.title).toBe(QUESTION);
    expect(thread.context).toBeNull();
  });

  it('haengt die Antwort mit Belegen an und fuehrt `updated` nach', async () => {
    const { store, archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question() });

    const updated = await archive.append(thread.id, {
      ...answer('Access-Token leben 15 Minuten.'),
      citations: [
        {
          path: 'modules/identity-management/wiki/concepts/token-lebensdauer.md',
          title: 'Token-Lebensdauer',
          quote: 'Access-Token 15 Minuten',
          line: 13,
        },
      ],
      unsupported: false,
    });

    expect(updated.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    const stored = parseThread(await fileOf(store, thread.id));
    expect(stored?.messages[1]?.citations?.[0]?.line).toBe(13);
    expect(stored?.messages[1]?.model).toBe('fake-small');
  });

  it('ersetzt eine Nachricht mit derselben Kennung statt sie zu verdoppeln', async () => {
    const { archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question() });
    await archive.append(thread.id, answer('Erster Stand.'));

    const again = await archive.append(thread.id, answer('Nachgetragen.'));

    expect(again.messages).toHaveLength(2);
    expect(again.messages[1]?.content).toBe('Nachgetragen.');
  });

  it('verliert nichts, wenn zwei Schreibvorgaenge gleichzeitig kommen', async () => {
    const { archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question() });

    await Promise.all([
      archive.append(thread.id, answer('Antwort A', 'm-a')),
      archive.append(thread.id, question('Zweite Frage', 'm-b-q')),
      archive.append(thread.id, answer('Antwort B', 'm-b')),
    ]);

    const stored = await archive.require(thread.id);
    expect(stored.messages.map((message) => message.id)).toEqual(['m-1-q', 'm-a', 'm-b-q', 'm-b']);
  });

  it('sagt bei einem Gespraech, das es nicht gibt, dass es es nicht gibt', async () => {
    const { archive } = setup();
    expect(await archive.get('c-2026-08-10-1200-abcd')).toBeNull();
    await expect(archive.require('c-2026-08-10-1200-abcd')).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(archive.append('c-2026-08-10-1200-abcd', answer('X'))).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('Liste', () => {
  it('stellt das neueste zuerst und haelt die Obergrenze ein', async () => {
    const { archive } = setup();
    for (let index = 0; index < DEFAULT_THREAD_LIMIT + 5; index += 1) {
      await archive.create({
        kind: 'ask',
        id: `c-2026-08-10-1200-${String(index).padStart(4, '0')}`,
        first: question(`Frage ${index}`, `m-${index}-q`),
      });
    }

    const threads = await archive.list();

    expect(threads).toHaveLength(DEFAULT_THREAD_LIMIT);
    expect(threads[0]?.title).toBe(`Frage ${DEFAULT_THREAD_LIMIT + 4}`);
    expect(await archive.list({ limit: 3 })).toHaveLength(3);
  });

  it('findet ueber die Suche auch, was aus der Liste gefallen ist', async () => {
    const { archive } = setup();
    const old = await archive.create({
      kind: 'ask',
      id: 'c-2020-01-01-0800-alt0',
      first: question('Was steht zur Rollenvererbung?', 'm-alt-q'),
    });
    for (let index = 0; index < DEFAULT_THREAD_LIMIT; index += 1) {
      await archive.create({
        kind: 'ask',
        id: `c-2026-08-10-1200-${String(index).padStart(4, '0')}`,
        first: question(`Frage ${index}`, `m-${index}-q`),
      });
    }

    expect((await archive.list()).some((thread) => thread.id === old.id)).toBe(false);
    const found = await archive.list({ query: 'rollenvererbung' });
    expect(found.map((thread) => thread.id)).toEqual([old.id]);
  });

  it('sucht auch im Text der Antworten, nicht nur im Titel', async () => {
    const { archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question() });
    await archive.append(thread.id, answer('Refresh-Token rotieren bei jeder Nutzung.'));

    expect(await archive.list({ query: 'rotieren' })).toHaveLength(1);
    expect(await archive.list({ query: 'gaertnern' })).toEqual([]);
  });

  it('trennt nach Art des Gespraechs', async () => {
    const { archive } = setup();
    await archive.create({ kind: 'ask', first: question('Eine Frage', 'm-x-q') });
    await archive.create({ kind: 'journal', context: '2026-08-10', title: 'Tagesgespraech' });

    expect((await archive.list({ kind: 'ask' })).map((thread) => thread.title)).toEqual([
      'Eine Frage',
    ]);
    expect((await archive.list({ kind: 'journal' })).map((thread) => thread.context)).toEqual([
      '2026-08-10',
    ]);
  });

  it('laesst eine kaputte Datei die Liste nicht mitnehmen', async () => {
    const { store, archive } = setup({
      '.secondbrain/chats/c-2026-08-09-1000-kaputt.json': '{ das ist kein JSON',
      '.secondbrain/chats/c-2026-08-09-1001-fremd.json': '{"was":"anderes"}',
      '.secondbrain/chats/notizen.txt': 'keine Gespraechsdatei',
    });
    await archive.create({ kind: 'ask', id: 'c-2026-08-10-1200-gut0', first: question() });

    const threads = await archive.list();

    expect(threads.map((thread) => thread.id)).toEqual(['c-2026-08-10-1200-gut0']);
    /* Angefasst wird die kaputte Datei nicht — sie ist Nutzerbestand. */
    expect(await store.readText('.secondbrain/chats/c-2026-08-09-1000-kaputt.json')).toBe(
      '{ das ist kein JSON',
    );
  });
});

describe('Umbenennen und loeschen', () => {
  it('benennt um und weist einen leeren Titel ab', async () => {
    const { archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question() });

    const renamed = await archive.rename(thread.id, 'Token-Lebensdauer');

    expect(renamed.title).toBe('Token-Lebensdauer');
    expect((await archive.require(thread.id)).title).toBe('Token-Lebensdauer');
    await expect(archive.rename(thread.id, '   ')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('loescht mit Rueckweg in den Papierkorb', async () => {
    const { store, archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question() });

    const { undoToken } = await archive.remove(thread.id);

    expect(await archive.get(thread.id)).toBeNull();
    expect(undoToken.length).toBeGreaterThan(0);
    await store.undo(undoToken);
    expect((await archive.require(thread.id)).title).toBe(QUESTION);
  });

  it('meldet das Loeschen eines Gespraechs, das es nicht gibt', async () => {
    const { archive } = setup();
    await expect(archive.remove('c-2026-08-10-1200-weg0')).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('Vorgeschichte', () => {
  it('nimmt die letzten Runden, aelteste zuerst, und laesst Leeres weg', async () => {
    const { archive } = setup();
    const thread = await archive.create({ kind: 'ask', first: question('Frage 1', 'q1') });
    await archive.append(thread.id, answer('Antwort 1', 'a1'));
    await archive.append(thread.id, answer('   ', 'a2'));
    const full = await archive.append(thread.id, question('Frage 2', 'q2'));

    expect(historyOf(full)).toEqual([
      { role: 'user', content: 'Frage 1' },
      { role: 'assistant', content: 'Antwort 1' },
      { role: 'user', content: 'Frage 2' },
    ]);
    expect(historyOf(full, 1)).toEqual([{ role: 'user', content: 'Frage 2' }]);
    expect(historyOf(null)).toEqual([]);
  });
});
