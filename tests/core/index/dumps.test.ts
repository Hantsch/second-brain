/* Dumps aus den indizierten Dokumenten. Geprüft wird, was der Inbox-Screen
   zeigt: Zustand, Herkunft, Alter — und dass nichts erfunden wird, wenn das
   Frontmatter schweigt. */

import { describe, expect, it } from 'vitest';
import { deriveDumps, dumpFromDoc, dumpId, toDumpItem } from '@core/index/dumps';
import { sha256 } from '@core/vault/hash';
import type { BaseFrontmatter, VaultDoc } from '@shared/types';
import { makeDoc, TODAY } from './fixtures';

function dumpDoc(path: string, frontmatter: Record<string, unknown>, body = 'Ein Gedanke.') {
  return makeDoc({
    path,
    docType: 'dump',
    title: typeof frontmatter['title'] === 'string' ? frontmatter['title'] : path,
    body,
    frontmatter,
    scope: frontmatter['scope'] === 'work' ? 'work' : null,
  });
}

describe('deriveDumps', () => {
  it('liest Titel, Herkunft, Zustand und Alter aus dem Frontmatter', () => {
    const doc = dumpDoc('inbox/2026-08-04-1220-link-vertragsvorlagen.md', {
      type: 'dump',
      title: 'Link: Vertragsvorlagen',
      created: '2026-08-04T12:20:00+02:00',
      origin: 'clipboard',
      status: 'proposed',
      scope: 'work',
    });

    const dump = toDumpItem(doc, { now: TODAY });

    expect(dump.title).toBe('Link: Vertragsvorlagen');
    expect(dump.origin).toBe('clipboard');
    expect(dump.status).toBe('proposed');
    expect(dump.ageDays).toBe(6);
    expect(dump.scope).toBe('work');
    expect(dump.id).toBe('2026-08-04-1220-link-vertragsvorlagen');
  });

  it('fällt auf ehrliche Standards zurück, wenn das Frontmatter schweigt', () => {
    const doc = dumpDoc('inbox/2026-08-10-1513-idee.md', { type: 'dump' });
    const dump = toDumpItem(doc, { now: TODAY });

    /* Kein erfundener Zustand, keine erfundene Herkunft. */
    expect(dump.status).toBe('raw');
    expect(dump.origin).toBe('window');
    expect(dump.created).toBe(doc.updated);
  });

  it('weist unbekannte Werte ab, statt sie durchzulassen', () => {
    const doc = dumpDoc('inbox/x.md', { type: 'dump', origin: 'telepathie', status: 'erledigt' });
    const dump = toDumpItem(doc);

    expect(dump.origin).toBe('window');
    expect(dump.status).toBe('raw');
  });

  it('sortiert den jüngsten Dump nach vorne und nimmt nur die Inbox', () => {
    const docs = [
      dumpDoc('inbox/a.md', { type: 'dump', created: '2026-07-22T18:55:00+02:00' }),
      dumpDoc('inbox/b.md', { type: 'dump', created: '2026-08-08T17:48:00+02:00' }),
      makeDoc({ path: 'areas/gesundheit.md', docType: 'area' }),
    ];

    const dumps = deriveDumps(docs, { now: TODAY });

    expect(dumps.map((dump) => dump.path)).toEqual(['inbox/b.md', 'inbox/a.md']);
  });

  it('behält einen von Hand verschobenen Dump, wenn er `type: dump` trägt', () => {
    const docs = [dumpDoc('areas/notiz.md', { type: 'dump' })];
    expect(deriveDumps(docs).length).toBe(1);
  });

  it('macht aus dem Dateinamen eine stabile ID', () => {
    expect(dumpId('inbox/2026-08-10-1513-idee.md')).toBe('2026-08-10-1513-idee');
  });
});

/* Ein abgelegter Dump bleibt als Beleg liegen. Was aus dem Frontmatter gelesen
   wird, ist genau das, was die Ablage hineingeschrieben hat — nichts abgeleitet,
   nichts erfunden. */
describe('deriveDumps — Beleg einer Ablage', () => {
  const FILED_INTO = 'projects/work/kundenportal-relaunch/project.md';

  it('liest `filed_into` und `filed_at` aus dem Frontmatter', () => {
    const doc = dumpDoc('inbox/2026-08-04-1220-ladezeiten.md', {
      type: 'dump',
      created: '2026-08-04T12:20:00+02:00',
      status: 'filed',
      filed_into: FILED_INTO,
      filed_at: '2026-08-05',
    });

    const dump = toDumpItem(doc, { now: TODAY });

    expect(dump.status).toBe('filed');
    expect(dump.filedInto).toBe(FILED_INTO);
    expect(dump.filedAt).toBe('2026-08-05');
  });

  it('meldet einen noch nicht abgelegten Dump ohne Beleg', () => {
    const doc = dumpDoc('inbox/2026-08-10-1513-idee.md', { type: 'dump', status: 'raw' });
    const dump = toDumpItem(doc, { now: TODAY });

    expect(dump.filedInto).toBeNull();
    expect(dump.filedAt).toBeNull();
  });

  it('trägt den Beleg auch durch die Liste', () => {
    const docs = [
      dumpDoc('inbox/a.md', {
        type: 'dump',
        created: '2026-08-08T17:48:00+02:00',
        status: 'filed',
        filed_into: FILED_INTO,
        filed_at: '2026-08-09',
      }),
      dumpDoc('inbox/b.md', { type: 'dump', created: '2026-07-22T18:55:00+02:00' }),
    ];

    const dumps = deriveDumps(docs, { now: TODAY });

    expect(dumps.map((dump) => [dump.filedInto, dump.filedAt])).toEqual([
      [FILED_INTO, '2026-08-09'],
      [null, null],
    ]);
  });
});

/* `dumpFromDoc` ist der Weg ohne Index — was gerade geschrieben wurde, muss sofort
   zurueckkommen. Der Beleg darf dabei nicht verloren gehen. */
describe('dumpFromDoc', () => {
  function vaultDoc(fields: Record<string, unknown>, body = 'Ein Gedanke.'): VaultDoc {
    const frontmatter: BaseFrontmatter = {
      type: 'dump',
      title: 'Ladezeiten',
      created: '2026-08-04T12:20:00+02:00',
      ...fields,
    };
    return {
      path: 'inbox/2026-08-04-1220-ladezeiten.md',
      frontmatter,
      body,
      hash: sha256(body),
      modified: '2026-08-04T12:20:00.000Z',
      size: body.length,
    };
  }

  it('liest den Beleg einer Ablage mit', () => {
    const dump = dumpFromDoc(
      vaultDoc({
        status: 'filed',
        filed_into: 'projects/work/kundenportal-relaunch/project.md',
        filed_at: '2026-08-05',
      }),
      { now: TODAY },
    );

    expect(dump.status).toBe('filed');
    expect(dump.filedInto).toBe('projects/work/kundenportal-relaunch/project.md');
    expect(dump.filedAt).toBe('2026-08-05');
  });

  it('lässt den Beleg leer, solange nichts abgelegt wurde', () => {
    const dump = dumpFromDoc(vaultDoc({ status: 'raw' }), { now: TODAY });

    expect(dump.filedInto).toBeNull();
    expect(dump.filedAt).toBeNull();
  });
});
