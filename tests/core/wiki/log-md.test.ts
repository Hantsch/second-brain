/* `wiki/log.md` ist append-only und formatgetreu. Beides ist keine Kosmetik: die
   Chronik soll greppbar bleiben (`grep "^## \[" wiki/log.md`), und eine Zeile, die
   die App umschreibt, ist eine Zeile, die der Nutzer verliert. */

import { describe, expect, it } from 'vitest';
import { appendLog, formatLogEntry, lastIngestDay, parseLog } from '@core/wiki';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { NOW_MS, TODAY } from '../../helpers/time';
import { LOG_PATH, MODULE, wikiFixture } from './fixtures';

describe('formatLogEntry', () => {
  it('schreibt einen Ingest genau wie docs/MODULE-SCHEMA.md', () => {
    const block = formatLogEntry(
      {
        kind: 'ingest',
        title: 'Auth0 RBAC Guide',
        day: '2026-08-10',
        summary: 'wiki/sources/s-2026-08-10-auth0-rbac-guide.md',
        touched: ['[[auth0]]', '[[rollenbasierte-zugriffskontrolle]]', 'index.md'],
        notes: 'widerspricht [[altes-rollenkonzept]] bei der Vererbung von Rollen',
      },
      NOW_MS,
    );

    expect(block).toBe(
      [
        '## [2026-08-10] ingest | Auth0 RBAC Guide',
        '- summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md',
        '- touched: [[auth0]], [[rollenbasierte-zugriffskontrolle]], index.md',
        '- notes: widerspricht [[altes-rollenkonzept]] bei der Vererbung von Rollen',
      ].join('\n'),
    );
  });

  it('schreibt eine Frage mit „answered from" und „filed back"', () => {
    const block = formatLogEntry({
      kind: 'query',
      title: 'Wie erben Rollen in Auth0?',
      day: '2026-08-10',
      answeredFrom: ['[[auth0]]', '[[rollenbasierte-zugriffskontrolle]]'],
      filedBack: 'wiki/concepts/rollenvererbung.md',
    });

    expect(block).toBe(
      [
        '## [2026-08-10] query | Wie erben Rollen in Auth0?',
        '- answered from: [[auth0]], [[rollenbasierte-zugriffskontrolle]]',
        '- filed back: wiki/concepts/rollenvererbung.md',
      ].join('\n'),
    );
  });

  it('laesst einen Pflegelauf ohne Titel', () => {
    const block = formatLogEntry({
      kind: 'lint',
      day: '2026-08-11',
      findings: '2 verwaiste Seiten',
    });
    expect(block).toBe('## [2026-08-11] lint\n- findings: 2 verwaiste Seiten');
  });

  it('nimmt den heutigen Tag, wenn keiner mitkommt', () => {
    expect(formatLogEntry({ kind: 'ingest', title: 'Heute' }, NOW_MS)).toContain(`[${TODAY}]`);
  });
});

describe('appendLog', () => {
  it('haengt an und laesst jedes Zeichen des Bestands stehen', async () => {
    const fixture = await wikiFixture();
    const before = await fixture.text(LOG_PATH);

    await appendLog(
      fixture.store,
      MODULE,
      { kind: 'ingest', title: 'Neue Quelle', summary: 'wiki/sources/s-2026-08-10-neu.md' },
      { now: NOW_MS },
    );

    const after = await fixture.text(LOG_PATH);
    expect(after.startsWith(before.replace(/\s+$/, ''))).toBe(true);
    expect(after).toContain('## [2026-08-04] ingest | Blogartikel zu Token-Lebensdauern');
    expect(after).toContain(`## [${TODAY}] ingest | Neue Quelle`);
    expect(after.endsWith('\n')).toBe(true);
  });

  it('legt die Chronik mit Kopf an, wenn sie fehlt', async () => {
    const store = new MemoryVaultStore({ now: new Date(NOW_MS) });

    await appendLog(store, 'frisch', { kind: 'ingest', title: 'Erste Quelle' }, { now: NOW_MS });

    const content = await store.readText('modules/frisch/wiki/log.md');
    expect(content).toContain('# Chronik');
    expect(content).toContain(`## [${TODAY}] ingest | Erste Quelle`);
  });

  it('meldet einen Konflikt statt zu ueberschreiben', async () => {
    const fixture = await wikiFixture();
    await expect(
      appendLog(
        fixture.store,
        MODULE,
        { kind: 'lint', findings: 'nichts' },
        { expectedHash: 'veraltet' },
      ),
    ).rejects.toThrow(/Konflikt/);
  });
});

describe('parseLog', () => {
  it('liest die Eintraege, juengste zuerst, mit ihren Feldern', async () => {
    const fixture = await wikiFixture();
    await appendLog(
      fixture.store,
      MODULE,
      { kind: 'query', title: 'Wie lange leben Tokens?', filedBack: 'wiki/concepts/x.md' },
      { now: NOW_MS },
    );

    const entries = parseLog(await fixture.text(LOG_PATH));

    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe('query');
    expect(entries[0]?.day).toBe(TODAY);
    expect(entries[0]?.title).toBe('Wie lange leben Tokens?');
    expect(entries[0]?.fields['filed back']).toBe('wiki/concepts/x.md');
    expect(entries[1]?.kind).toBe('ingest');
    expect(entries[1]?.fields['touched']).toContain('[[token-lebensdauer]]');
  });

  it('begrenzt die Anzeige und uebersteht eine leere Datei', () => {
    const log = ['## [2026-08-01] lint', '', '## [2026-08-02] lint', ''].join('\n');
    expect(parseLog(log, 1).map((entry) => entry.day)).toEqual(['2026-08-02']);
    expect(parseLog(null)).toEqual([]);
    expect(parseLog('# Chronik\n')).toEqual([]);
  });

  it('nennt den Tag des letzten Ingests', async () => {
    const fixture = await wikiFixture();
    expect(lastIngestDay(await fixture.text(LOG_PATH))).toBe('2026-08-04');
    expect(lastIngestDay('## [2026-08-11] lint\n- findings: 1\n')).toBeNull();
  });
});
