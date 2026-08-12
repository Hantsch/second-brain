/**
 * Laufende Projekte ohne naechsten Schritt.
 *
 * `next_step` ist der eine Satz, der den Wiedereinstieg traegt (docs/CONCEPT.md:
 * „Fehlt er, ist das ein Pflege-Befund"). Gemeldet werden nur `active` und
 * `waiting` — eine Idee darf ohne naechsten Schritt liegen, ein pausiertes Projekt
 * ausdruecklich auch, und `done`/`dropped` sind vorbei.
 *
 * Kein Fix: den naechsten Schritt kann nur der Mensch formulieren. Einen Satz zu
 * erfinden und ins Frontmatter zu schreiben waere genau die Behauptung, die diese
 * App nicht macht. Der Befund nennt die Datei; geschrieben wird im Projekt-Screen
 * (`projects:patch`), nach Bestaetigung.
 */

import type { GardenerFinding, ProjectStatus } from '@shared/types';
import { buildFinding } from '../types';
import type { Check, GardenerContext } from '../types';

/** Zustaende, in denen ein naechster Schritt fehlt, wenn er fehlt. */
const RUNNING: readonly ProjectStatus[] = ['active', 'waiting'];

export const projectWithoutNextStepCheck: Check = {
  kind: 'project-without-next-step',

  run(ctx: GardenerContext): GardenerFinding[] {
    const findings: GardenerFinding[] = [];

    for (const project of ctx.index.projects()) {
      if (!RUNNING.includes(project.status)) continue;
      if (project.nextStep !== null && project.nextStep.trim().length > 0) continue;
      const text = ctx.labels.projectWithoutNextStep(project.title, project.status);
      findings.push(
        buildFinding(ctx, {
          kind: 'project-without-next-step',
          severity: 'warn',
          title: text.title,
          detail: text.detail,
          paths: [project.path],
          module: null,
          key: [project.path],
        }),
      );
    }
    return findings;
  },
};
