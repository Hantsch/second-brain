/* Vorschläge in die Form bringen, in der die Oberfläche mit ihnen arbeitet — und
   zurück in die Form, in der der Kern sie ausführt.

   Zwei Aufgaben, beide aus demselben Grund hier und nicht im Renderer: der
   Renderer darf keine Vault-Pfade und keine Markdown-Zeilen bauen, sonst steht
   das Dateiformat an zwei Stellen (docs/VAULT-FORMAT.md).

   1. `withAllTargets` hängt an den Vorschlag jedes erreichbare Ziel — offenes
      Projekt, Bereich, Modul, Tageseintrag, „bleibt liegen" — mit fertigem Pfad
      und fertigem Text. Damit ist „anderes Ziel" eine Auswahl, keine Eingabe.
   2. `normalize` nimmt den bearbeiteten Vorschlag zurück und setzt die
      Todo-Blöcke neu: der Nutzer entscheidet, *welche* Todos mit welcher Frist
      mitkommen, wie eine Checkbox-Zeile aussieht, weiß nur der Kern.

   Gebaut wird beides mit den Helfern des Kerns (`filingAction`, `todoActions`) —
   eine zweite Fassung davon wäre eine zweite Fassung des Dateiformats. */

import {
  SECTION_DAY,
  SECTION_NOTES,
  buildFilingContext,
  filingAction,
  todoActions,
} from '@core/capture';
import type { CaptureIndex } from '@core/capture';
import { journalPath, modulePath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import type { FilingAction, FilingProposal, Project } from '@shared/types';
import { fail } from './errors';

/** So viele Ziele reichen zur freien Wahl; gesucht wird darin in der Oberfläche. */
const MAX_TARGETS = 48;

/**
 * Der Vorschlag mit allen erreichbaren Zielen in `alternatives`. Die Reihenfolge
 * ist Absicht: was der Kern vorgeschlagen hat, steht vorn — danach die
 * thematisch nächsten Projekte, dann Module, Bereiche, Tageseintrag, Inbox.
 */
export function withAllTargets(
  proposal: FilingProposal,
  index: CaptureIndex,
  text: string,
  now: DateLike,
): FilingProposal {
  const context = buildFilingContext(index, { now, text });
  const seen = new Set([proposal.primary.path]);
  const alternatives: FilingAction[] = [];

  const add = (action: FilingAction): void => {
    if (seen.has(action.path) || alternatives.length >= MAX_TARGETS) return;
    seen.add(action.path);
    alternatives.push(action);
  };

  for (const action of proposal.alternatives) add(action);
  for (const project of context.projects) {
    add(filingAction('project', project.path, SECTION_NOTES, text, now));
  }
  for (const module of context.modules) {
    add(filingAction('module', modulePath(module.slug), SECTION_NOTES, text, now));
  }
  for (const area of context.areas) {
    add(filingAction('area', area.path, SECTION_NOTES, text, now));
  }
  add(filingAction('journal', journalPath(context.today), SECTION_DAY, text, now));
  add(filingAction('inbox', proposal.dumpPath, null, text, now));

  return { ...proposal, alternatives };
}

/**
 * Den Vorschlag nehmen, wie er aus der Oberfläche kommt — nur die Todo-Blöcke
 * werden neu gesetzt. Kommt kein Todo mit, gilt, was mitgeschickt wurde.
 */
export function normalize(proposal: FilingProposal, projects: readonly Project[]): FilingProposal {
  if (typeof proposal?.dumpPath !== 'string' || proposal.dumpPath.length === 0) {
    throw fail('invalid', 'der Vorschlag nennt keinen Dump');
  }
  if (proposal.primary === null || typeof proposal.primary !== 'object') {
    throw fail('invalid', 'der Vorschlag nennt kein Ziel');
  }
  if (!Array.isArray(proposal.todos) || proposal.todos.length === 0) return proposal;
  const extras = todoActions(
    proposal.primary,
    proposal.todos,
    (slug) => projects.find((project) => project.slug === slug)?.path ?? null,
  );
  return { ...proposal, extras };
}
