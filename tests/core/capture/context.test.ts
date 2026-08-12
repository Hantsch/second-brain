/* Der Entscheidungskontext. Er wandert in einen Prompt, deshalb ist seine Größe
   Teil der Zusage: harte Obergrenzen, gekürzte Ausschnitte, und für die Auswahl
   die Volltextsuche statt „alles mitschicken". */

import { describe, expect, it } from 'vitest';
import { EXCERPT_CHARS, buildFilingContext, narrowContext } from '@core/capture';
import type { CaptureIndex } from '@core/capture';
import { IndexService } from '@core/index/service';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { fixtureVaultFiles } from '../../fixtures';
import { NOW_MS, TODAY } from '../../helpers/time';
import { HOME_PROJECT, MODULE_SLUG, WORK_PROJECT, captureFixture } from './fixtures';

function projectFile(slug: string, index: number): string {
  return [
    '---',
    'type: project',
    `title: Projekt ${index}`,
    `slug: ${slug}`,
    'scope: work',
    'status: active',
    'created: 2026-01-01',
    '---',
    '',
    '## Stand',
    '',
    `Stand von Projekt ${index}. ${'Sehr viel Prosa. '.repeat(40)}`,
    '',
  ].join('\n');
}

async function indexWithManyProjects(count: number): Promise<CaptureIndex> {
  const files: Record<string, string> = { ...fixtureVaultFiles() };
  for (let index = 0; index < count; index += 1) {
    files[`projects/work/breit-${index}/project.md`] = projectFile(`breit-${index}`, index);
  }
  const store = new MemoryVaultStore({ files, now: new Date(NOW_MS) });
  return IndexService.open(store, { persistence: null, now: () => new Date(NOW_MS) });
}

describe('buildFilingContext', () => {
  it('nimmt Projekte, Bereiche, Module, Tags und das heutige Datum mit', async () => {
    const { context } = await captureFixture();

    expect(context.today).toBe(TODAY);
    expect(context.projects.map((project) => project.slug).sort()).toEqual(
      [HOME_PROJECT, WORK_PROJECT].sort(),
    );
    expect(context.areas.map((area) => area.slug)).toEqual(['gesundheit']);
    expect(context.modules.map((module) => module.slug)).toEqual([MODULE_SLUG]);
    expect(context.tags).toContain('kundenportal');
  });

  it('trägt zu jedem Projekt Scope, Status, Tags und einen Ausschnitt', async () => {
    const { context } = await captureFixture();
    const project = context.projects.find((entry) => entry.slug === WORK_PROJECT);

    expect(project).toBeDefined();
    expect(project?.scope).toBe('work');
    expect(project?.status).toBe('active');
    expect(project?.tags).toEqual(['kundenportal', 'frontend']);
    expect(project?.path).toBe('projects/work/kundenportal-relaunch/project.md');
    expect(project?.excerpt).toContain('Angebotsliste');
  });

  it('hält jeden Ausschnitt unter der Zeichengrenze', async () => {
    const index = await indexWithManyProjects(3);
    const context = buildFilingContext(index, { now: NOW_MS });

    for (const project of context.projects) {
      expect(project.excerpt.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1);
    }
  });

  it('bleibt bei vielen Projekten unter der Obergrenze', async () => {
    const index = await indexWithManyProjects(60);
    const context = buildFilingContext(index, { now: NOW_MS });

    expect(context.projects.length).toBe(40);

    const small = buildFilingContext(index, { now: NOW_MS, maxProjects: 5 });
    expect(small.projects.length).toBe(5);
  });

  it('gibt dem passenden Projekt einen der begrenzten Plätze, wenn der Text bekannt ist', async () => {
    const index = await indexWithManyProjects(60);
    const blind = buildFilingContext(index, { now: NOW_MS, maxProjects: 5 });
    const aware = buildFilingContext(index, {
      now: NOW_MS,
      maxProjects: 5,
      text: 'Die Angebotsliste im Kundenportal hängt bei 400 Angeboten.',
    });

    expect(blind.projects.map((project) => project.slug)).not.toContain(WORK_PROJECT);
    expect(aware.projects[0]?.slug).toBe(WORK_PROJECT);
  });

  it('lässt abgeschlossene Projekte weg — dort landet kein neuer Gedanke', async () => {
    const files = { ...fixtureVaultFiles() };
    files['projects/work/altes-ding/project.md'] = projectFile('altes-ding', 1).replace(
      'status: active',
      'status: done',
    );
    const store = new MemoryVaultStore({ files, now: new Date(NOW_MS) });
    const index = await IndexService.open(store, {
      persistence: null,
      now: () => new Date(NOW_MS),
    });
    const context = buildFilingContext(index, { now: NOW_MS });

    expect(context.projects.map((project) => project.slug)).not.toContain('altes-ding');
  });
});

describe('narrowContext', () => {
  it('stellt die thematisch nächsten Projekte nach vorn', async () => {
    const { index, context } = await captureFixture();
    const narrow = narrowContext(index, context, 'Noppenfolie und Erde für das Hochbeet', 1);

    expect(narrow.projects.map((project) => project.slug)).toEqual([HOME_PROJECT]);
  });

  it('schneidet auf die Zahl der Kandidaten zu, ohne den Rest zu verlieren', async () => {
    const index = await indexWithManyProjects(60);
    const text = 'Angebotsliste im Kundenportal hängt';
    const context = buildFilingContext(index, { now: NOW_MS, text });
    const narrow = narrowContext(index, context, text, 8);

    expect(narrow.projects.length).toBe(8);
    expect(narrow.projects.map((project) => project.slug)).toContain(WORK_PROJECT);
    expect(narrow.areas).toEqual(context.areas);
    expect(narrow.tags).toEqual(context.tags);
  });

  it('bleibt bei leerem Text brauchbar, statt nichts zurückzugeben', async () => {
    const { index, context } = await captureFixture();
    const narrow = narrowContext(index, context, '   ', 8);

    expect(narrow.projects.length).toBe(context.projects.length);
  });
});
