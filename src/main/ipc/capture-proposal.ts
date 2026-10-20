/* Bring proposals into the shape the UI works with — and back into the shape
   the core executes.

   Two tasks, both living here rather than in the renderer for the same
   reason: the renderer must never build vault paths or markdown lines, or
   the file format would end up defined in two places (docs/VAULT-FORMAT.md).

   1. `withAllTargets` attaches every reachable target to the proposal — open
      project, area, module, journal entry, "stays put" — each with a
      finished path and finished text. That makes "other target" a
      selection, not an input.
   2. `normalize` takes the edited proposal back and rebuilds the todo
      blocks: the user decides *which* todos come along with what deadline;
      only the core knows what a checkbox line looks like.

   Both are built with the core's helpers (`filingAction`, `todoActions`) —
   a second implementation of this would be a second implementation of the
   file format. */

import {
  SECTION_DAY,
  SECTION_NOTES,
  buildFilingContext,
  filingAction,
  resolveSection,
  todoActions,
  verifyFilingAction,
} from '@core/capture';
import type { CaptureIndex } from '@core/capture';
import { isSafeVaultPath, journalPath, modulePath, toVaultPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { VAULT_DIRS } from '@shared/types';
import type { DocLanguage, FilingAction, FilingProposal, Project } from '@shared/types';
import { fail } from './errors';

/** `inbox/` — the only place `applyProposal` may rewrite as the dump's frontmatter. */
const INBOX_PREFIX = `${VAULT_DIRS.inbox}/`;

/** A dump path is only trustworthy if it is a real vault path that actually lives in the inbox. */
function isInboxPath(path: string): boolean {
  return isSafeVaultPath(path) && toVaultPath(path).startsWith(INBOX_PREFIX);
}

/** This many targets are enough for free choice; the UI lets the user search within them. */
const MAX_TARGETS = 48;

/**
 * The heading this action would actually land under, read from the target's
 * already-indexed body — no extra file read, because this is only the
 * preview. `apply`/`filing` re-resolve against the freshly read file, which
 * is why a stale index here is harmless (`sections.ts`).
 *
 * `inbox` names no section at all, so it passes through unchanged; the
 * fallback kind handed to `resolveSection` never actually applies otherwise,
 * because every other target already names one (`sectionFor` in
 * `buildProposal`/`filingAction`).
 */
function withIndexedSection(
  action: FilingAction,
  index: CaptureIndex,
  docLanguage: DocLanguage,
): FilingAction {
  if (action.section === null) return action;
  const body = index.index().docs.find((doc) => doc.path === action.path)?.body;
  if (body === undefined) return action;
  return { ...action, section: resolveSection(body, action, 'notes', docLanguage) };
}

/**
 * The proposal with all reachable targets in `alternatives`. The order is
 * intentional: what the core suggested comes first — then the thematically
 * closest projects, then modules, areas, journal entry, inbox.
 */
export function withAllTargets(
  proposal: FilingProposal,
  index: CaptureIndex,
  text: string,
  now: DateLike,
  docLanguage: DocLanguage = 'de',
): FilingProposal {
  const context = buildFilingContext(index, { now, text });
  const primary = withIndexedSection(proposal.primary, index, docLanguage);
  const seen = new Set([primary.path]);
  const alternatives: FilingAction[] = [];

  const add = (action: FilingAction): void => {
    const resolved = withIndexedSection(action, index, docLanguage);
    if (seen.has(resolved.path) || alternatives.length >= MAX_TARGETS) return;
    seen.add(resolved.path);
    alternatives.push(resolved);
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

  return { ...proposal, primary, alternatives };
}

/**
 * Take the proposal as it comes from the UI and re-check everything that is a
 * write address before `capture:apply` acts on it.
 *
 * `primary` is only ever a *selection* from targets the core itself built
 * (`withAllTargets`) — but what arrives over IPC is plain data, so it is
 * re-verified against a freshly built `FilingContext` exactly as
 * `verifyFilingAction` documents. `dumpPath` gets the same scrutiny: it names
 * the file whose frontmatter `applyProposal` rewrites, so a renderer that (by
 * bug or tampering) sends a path outside `inbox/` must not reach the write.
 *
 * `extras` are never trusted from the renderer either — the same hole one
 * field over as an unchecked `primary` — so they are always rebuilt from
 * `todos` here, `[]` when none come along.
 *
 * The context is built without a similarity `text` and without the
 * project/module caps `withAllTargets` uses for ranking: this call checks
 * membership, not relevance, so a legitimate project must not fall out of a
 * large vault's top N (`buildFilingContext`'s `maxProjects`/`maxModules`).
 */
export function normalize(
  proposal: FilingProposal,
  projects: readonly Project[],
  index: CaptureIndex,
  now: DateLike,
  docLanguage: DocLanguage = 'de',
): FilingProposal {
  if (typeof proposal?.dumpPath !== 'string' || proposal.dumpPath.length === 0) {
    throw fail('invalid', 'der Vorschlag nennt keinen Dump');
  }
  if (!isInboxPath(proposal.dumpPath)) {
    throw fail('invalid', 'der Dump-Pfad liegt nicht in der Inbox');
  }
  if (proposal.primary === null || typeof proposal.primary !== 'object') {
    throw fail('invalid', 'der Vorschlag nennt kein Ziel');
  }

  const context = buildFilingContext(index, { now, maxProjects: Infinity, maxModules: Infinity });
  const verified = verifyFilingAction(proposal.primary, context, {
    dumpPath: proposal.dumpPath,
    createdAt: proposal.createdAt,
    docLanguage,
  });
  if (typeof verified === 'string') throw fail('invalid', verified);

  const todos = Array.isArray(proposal.todos) ? proposal.todos : [];
  const extras =
    todos.length === 0
      ? []
      : todoActions(
          verified,
          todos,
          (slug) => projects.find((project) => project.slug === slug)?.path ?? null,
          docLanguage,
        );
  return { ...proposal, primary: verified, extras };
}
