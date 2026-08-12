/* Prüft die Prüfwerkzeuge selbst. Wenn hier etwas rot ist, sind alle anderen
   Tests, die darauf bauen, nicht vertrauenswürdig. */

import { describe, expect, it } from 'vitest';
import { readVaultMarker } from '@core/vault';
import { CLAUDE_PROJECTS_DIR, fixtureVaultFiles, readFixture } from '../fixtures';
import { collectStream, expectLlmUnavailable, emptyGateway, gatewayWithReplies } from './llm';
import { createTempVault, withTempVault } from './vault';
import { NOW_MS, TODAY, day, daysBetween, freezeTime, stamp } from './time';

describe('Zeit-Helfer', () => {
  it('rechnet Kalendertage zeitzonenunabhängig', () => {
    expect(day(0)).toBe(TODAY);
    expect(day(-1)).toBe('2026-08-09');
    expect(day(3)).toBe('2026-08-13');
    expect(day(-31)).toBe('2026-07-10');
  });

  it('baut Zeitstempel und Abstände', () => {
    expect(stamp(0, '14:32')).toBe('2026-08-10T14:32:00+02:00');
    expect(daysBetween('2026-07-31')).toBe(10);
    expect(daysBetween(TODAY, '2026-08-13')).toBe(3);
  });

  it('friert die Uhr auf NOW ein und gibt sie wieder frei', () => {
    const restore = freezeTime();
    expect(Date.now()).toBe(NOW_MS);
    expect(new Date().toISOString().slice(0, 10)).toBe(TODAY);
    restore();
    expect(Date.now()).not.toBe(NOW_MS);
  });
});

describe('Fixtures', () => {
  it('liefert den Beispielbestand als Pfad-zu-Inhalt-Abbildung', () => {
    const files = fixtureVaultFiles();
    expect(Object.keys(files)).toContain('projects/work/kundenportal-relaunch/project.md');
    expect(Object.keys(files)).toContain('journal/2026/08/2026-08-10.md');
    expect(files['areas/gesundheit.md']).toContain('type: area');
  });

  it('trägt die absichtlichen Pflege-Befunde', () => {
    const files = fixtureVaultFiles();
    const oauth = files['modules/identity-management/wiki/entities/oauth2.md'] ?? '';
    const index = files['modules/identity-management/wiki/index.md'] ?? '';
    const ingest = files['raw/web/2026-08-06-digital-gardening-ueberblick.ingest.json'] ?? '';
    expect(oauth).toContain('[[device-code-flow]]');
    expect(index).not.toContain('[[scim]]');
    expect(JSON.parse(ingest).sourcePage).toBeNull();
  });

  it('hält eine nachgebaute Claude-Session bereit', () => {
    const lines = readFixture(
      'claude',
      'projects',
      'C--development-demo-kundenportal-web',
      'session-kundenportal.jsonl',
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(5);
    expect(lines[0].cwd).toBe('C:\\development\\demo\\kundenportal-web');
    expect(lines.at(-1).type).toBe('summary');
    expect(CLAUDE_PROJECTS_DIR.endsWith('projects')).toBe(true);
  });
});

describe('Temporärer Vault', () => {
  it('ist ein vollständiger Vault und räumt sich ab', async () => {
    const vault = await createTempVault({ name: 'Prüfvault' });
    expect((await readVaultMarker(vault.store))?.name).toBe('Prüfvault');
    expect(await vault.exists('inbox')).toBe(true);
    expect(await vault.exists('.secondbrain/index')).toBe(true);
    await vault.cleanup();
    expect(await vault.exists('inbox')).toBe(false);
  });

  it('legt den Beispielbestand an und liest ihn über den Store', async () => {
    await withTempVault(
      async (vault) => {
        const doc = await vault.store.read('projects/work/kundenportal-relaunch/project.md');
        expect(doc?.frontmatter.title).toBe('Kundenportal Relaunch');
        expect(doc?.frontmatter.scope).toBe('work');
        expect(doc?.body).toContain('@wait:Jonas');
        expect(doc?.hash.length).toBeGreaterThan(0);
      },
      { sample: true },
    );
  });

  it('setzt Zeitstempel für Alters- und Stagnationsrechnungen', async () => {
    await withTempVault(
      async (vault) => {
        const path = 'projects/work/kundenportal-relaunch/project.md';
        await vault.touch(path, -40);
        const doc = await vault.store.read(path);
        const age = (NOW_MS - Date.parse(doc?.modified ?? '')) / 86_400_000;
        expect(Math.round(age)).toBe(40);
      },
      { sample: true },
    );
  });

  it('nimmt eigene Dateien mit und erlaubt Änderungen von außen', async () => {
    await withTempVault(
      async (vault) => {
        expect(await vault.read('inbox/eigen.md')).toContain('type: dump');
        await vault.write('inbox/eigen.md', '---\ntype: dump\ntitle: Neu\n---\n\nExtern.\n');
        const doc = await vault.store.read('inbox/eigen.md');
        expect(doc?.frontmatter.title).toBe('Neu');
      },
      { files: { 'inbox/eigen.md': '---\ntype: dump\ntitle: Alt\n---\n\nAlt.\n' } },
    );
  });
});

describe('LLM-Helfer', () => {
  it('antwortet je Aufgabe deterministisch, ohne Netz', async () => {
    const { gateway, provider } = gatewayWithReplies({ 'title-tags': '{"title":"Kurz"}' });
    const result = await gateway.complete({
      task: 'title-tags',
      messages: [{ role: 'user', content: 'Titel für diesen Dump' }],
    });
    expect(result.text).toBe('{"title":"Kurz"}');
    expect(provider.countFor('title-tags')).toBe(1);
  });

  it('streamt in Stücken und setzt sie wieder zusammen', async () => {
    const { gateway } = gatewayWithReplies({ 'journal-chat': 'Zwei der drei warten auf andere.' });
    const { text, deltas } = await collectStream(gateway, 'journal-chat', 'Zu viel gleichzeitig');
    expect(text).toBe('Zwei der drei warten auf andere.');
    expect(deltas.length).toBeGreaterThan(1);
  });

  it('macht „kein Modell konfiguriert" prüfbar', async () => {
    const gateway = emptyGateway();
    expect(gateway.isAvailable('query-answer')).toBe(false);
    const error = await expectLlmUnavailable(() =>
      gateway.complete({
        task: 'query-answer',
        messages: [{ role: 'user', content: 'Was weiß ich?' }],
      }),
    );
    expect(error.reason).toBe('no-route');
  });
});
