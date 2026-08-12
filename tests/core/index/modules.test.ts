/* Wissens-Module aus den indizierten Dokumenten: Beschreibung, Seitenzahlen,
   letzter Ingest. */

import { describe, expect, it } from 'vitest';
import type { RawSource } from '@shared/types';
import { deriveModules } from '@core/index/modules';
import { makeDoc } from './fixtures';

const SOURCE: RawSource = {
  path: 'raw/youtube/xOFkpf9KgKg',
  title: 'Your AI second brain is slowly rotting',
  kind: 'youtube',
  ingestedAt: '2026-08-06T12:00:00.000Z',
  sourcePage: 's-2026-08-06-ai-second-brain-rotting',
  origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
  bytes: 4821,
  modules: ['second-brain-methodik'],
};

function moduleFile(slug: string, description?: string) {
  return makeDoc({
    path: `modules/${slug}/module.md`,
    docType: 'note',
    title: 'Identity management',
    module: slug,
    updated: '2026-08-09T08:00:00.000Z',
    frontmatter: {
      type: 'note',
      title: 'Identity management',
      created: '2026-07-02T10:00:00.000Z',
      tags: ['auth'],
      ...(description === undefined ? {} : { description }),
    },
    body: 'Alles zu Rollen, Rechten und Anmeldeverfahren.',
  });
}

describe('deriveModules', () => {
  it('liest Titel, Beschreibung, Zeitpunkte und Seitenzahlen', () => {
    const docs = [
      moduleFile('identity-management', 'Rollen, Rechte, Anmeldeverfahren.'),
      makeDoc({
        path: 'modules/identity-management/wiki/entities/oauth2.md',
        docType: 'entity',
        module: 'identity-management',
        updated: '2026-08-10T09:30:00.000Z',
      }),
    ];

    const [module] = deriveModules(docs, {
      counts: new Map([['identity-management', { sources: 3, entities: 4, concepts: 5 }]]),
    });

    expect(module?.slug).toBe('identity-management');
    expect(module?.description).toBe('Rollen, Rechte, Anmeldeverfahren.');
    expect(module?.created).toBe('2026-07-02T10:00:00.000Z');
    /* `updated` ist die jüngste Spur im Modul, nicht die der Modul-Datei. */
    expect(module?.updated).toBe('2026-08-10T09:30:00.000Z');
    expect(module?.counts).toEqual({ sources: 3, entities: 4, concepts: 5 });
  });

  it('nimmt den ersten Absatz, wenn keine Beschreibung im Frontmatter steht', () => {
    const [module] = deriveModules([moduleFile('identity-management')]);
    expect(module?.description).toContain('Rollen, Rechten');
  });

  it('zählt ein Modul ohne module.md mit', () => {
    const docs = [
      makeDoc({
        path: 'modules/second-brain-methodik/wiki/concepts/verrotten.md',
        docType: 'concept',
        module: 'second-brain-methodik',
      }),
    ];

    const [module] = deriveModules(docs, { sources: [SOURCE] });

    expect(module?.slug).toBe('second-brain-methodik');
    expect(module?.title).toBe('Second brain methodik');
    expect(module?.lastIngest).toBe(SOURCE.ingestedAt);
  });

  it('lässt `lastIngest` null, wenn keine Quelle auf das Modul zeigt', () => {
    const [module] = deriveModules([moduleFile('identity-management')], { sources: [SOURCE] });
    expect(module?.lastIngest).toBeNull();
  });

  it('meldet keine Befunde, solange kein Pflegelauf gelaufen ist', () => {
    const [module] = deriveModules([moduleFile('identity-management')]);
    expect(module?.findingCount).toBe(0);
  });
});
