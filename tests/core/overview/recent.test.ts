import { describe, expect, it } from 'vitest';
import { GERMAN_RECENT_LABELS, recentWork } from '@core/overview';
import {
  NOW,
  dumpDoc,
  indexFrom,
  journalDoc,
  projectDoc,
  projectNote,
  rawSource,
  session,
  stamp,
} from './fixtures';

describe('recentWork', () => {
  it('fasst Dateiaenderungen je Projekt und Tag zu einer Zeile mit Anzahl zusammen', () => {
    const index = indexFrom([
      projectDoc({
        slug: 'kundenportal',
        title: 'Kundenportal Relaunch',
        updated: stamp(0, '09:00'),
      }),
      projectNote('kundenportal', 'abnahme', { updated: stamp(0, '10:00') }),
      projectNote('kundenportal', 'ladezeiten', { updated: stamp(0, '11:00') }),
    ]);
    const items = recentWork(index, [], { now: NOW });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'file',
      title: 'Kundenportal Relaunch',
      detail: '3 Dateien geändert',
      project: 'kundenportal',
      scope: 'work',
      // Die Zeile zeigt auf die juengste beruehrte Datei.
      path: 'projects/work/kundenportal/notes/ladezeiten.md',
      at: stamp(0, '11:00'),
    });
  });

  it('trennt nach Tagen — gestern ist eine eigene Zeile', () => {
    const index = indexFrom([
      projectDoc({ slug: 'kundenportal', updated: stamp(0, '09:00') }),
      projectNote('kundenportal', 'gestern', { updated: stamp(-1, '17:00') }),
    ]);
    const items = recentWork(index, [], { now: NOW });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.detail)).toEqual(['1 Datei geändert', '1 Datei geändert']);
  });

  it('nennt bei einer einzelnen Datei deren Titel', () => {
    const index = indexFrom([dumpDoc('2026-08-10-1432-gedanke', { updated: stamp(0, '14:32') })]);
    const items = recentWork(index, [], { now: NOW });
    expect(items[0]?.title).toBe('2026-08-10-1432-gedanke');
    expect(items[0]?.project).toBeNull();
  });

  it('mischt Sitzungen mit Nachrichtenzahl und Branch ein', () => {
    const index = indexFrom([projectDoc({ slug: 'second-brain', updated: stamp(-1) })]);
    const items = recentWork(
      index,
      [session({ vaultProject: 'second-brain', lastActivity: stamp(0, '09:00') })],
      { now: NOW },
    );
    expect(items[0]).toMatchObject({
      kind: 'claude-session',
      title: 'Ueberblick-Kern bauen',
      detail: 'Session, 47 Nachrichten, Branch feature/auth',
      project: 'second-brain',
      // Die Verlaufsdatei liegt ausserhalb des Vaults.
      path: null,
    });
  });

  it('nimmt die Zusammenfassung einer Sitzung als Titel, wenn Claude eine geschrieben hat', () => {
    const items = recentWork(indexFrom([]), [session({ summary: 'State migriert' })], { now: NOW });
    expect(items[0]?.title).toBe('State migriert');
  });

  it('zeigt Tageseintraege und aufgenommene Quellen als eigene Arten', () => {
    const index = indexFrom(
      [
        journalDoc(0, {
          body: [
            '## Tag',
            '',
            'Viel geschafft.',
            '',
            '## Gespräch',
            '',
            '> **Ich** — 18:40',
            '> Hallo',
            '',
            '> **Second Brain** — 18:41',
            '> Hallo zurück',
            '',
          ].join('\n'),
        }),
      ],
      { sources: [rawSource({ sourcePage: 's-2026-08-10-rotting' })] },
    );
    const items = recentWork(index, [], { now: NOW });

    const journal = items.find((item) => item.kind === 'journal');
    expect(journal?.detail).toMatch(/^Tageseintrag, \d+ Wörter, 1 Dialogrunde$/);
    const ingest = items.find((item) => item.kind === 'ingest');
    expect(ingest?.detail).toBe('Quelle aufgenommen (YouTube), verdichtet');
    expect(ingest?.path).toBe('raw/youtube/xOFkpf9KgKg');
  });

  it('sagt bei einer unverdichteten Quelle, dass sie noch nicht verdichtet ist', () => {
    const index = indexFrom([], { sources: [rawSource({ sourcePage: null })] });
    const items = recentWork(index, [], { now: NOW });
    expect(items[0]?.detail).toBe('Quelle aufgenommen (YouTube), noch nicht verdichtet');
  });

  it('sortiert neueste zuerst und beachtet das Limit', () => {
    const index = indexFrom([
      projectDoc({ slug: 'a', updated: stamp(-1) }),
      projectDoc({ slug: 'b', updated: stamp(0, '08:00') }),
      projectDoc({ slug: 'c', updated: stamp(-2) }),
    ]);
    const items = recentWork(index, [], { now: NOW, limit: 2 });
    expect(items.map((item) => item.project)).toEqual(['b', 'a']);
  });

  it('laesst weg, was aelter als das Fenster ist', () => {
    const index = indexFrom([
      projectDoc({ slug: 'frisch', updated: stamp(-2) }),
      projectDoc({ slug: 'alt', updated: stamp(-30) }),
    ]);
    const items = recentWork(index, [], { now: NOW, days: 14 });
    expect(items.map((item) => item.project)).toEqual(['frisch']);
  });

  it('zaehlt Rohquellen nicht doppelt als Dateiaenderung', () => {
    const index = indexFrom(
      [
        {
          ...projectNote('x', 'y'),
          path: 'raw/youtube/xOFkpf9KgKg/transcript.md',
          project: null,
          scope: null,
        },
      ],
      { sources: [rawSource()] },
    );
    const items = recentWork(index, [], { now: NOW });
    expect(items.map((item) => item.kind)).toEqual(['ingest']);
  });

  it('nimmt eingesetzte Beschriftungen — die Sprache ist nicht festgenagelt', () => {
    const index = indexFrom([projectDoc({ slug: 'kundenportal' })]);
    const items = recentWork(index, [], {
      now: NOW,
      labels: {
        ...GERMAN_RECENT_LABELS,
        filesChanged: (count) => `${count} files changed`,
      },
    });
    expect(items[0]?.detail).toBe('1 files changed');
  });
});
