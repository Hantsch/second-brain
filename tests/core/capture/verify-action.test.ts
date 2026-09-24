/* What the renderer sends back is data, and its `path` is a write address. The
 * verifier must accept every target the core itself builds — or a legitimate
 * filing regresses into `invalid` — and refuse every target that does not
 * resolve against the index the way `pathFor` resolves it. */

import { describe, expect, it } from 'vitest';
import { buildFilingContext, buildProposal, verifyFilingAction } from '@core/capture';
import type { FilingContext, ProposalDraft } from '@core/capture';
import { journalPath } from '@core/vault/paths';
import { sectionKindOf } from '@core/vault/section-names';
import type { DocLanguage, FilingAction, FilingTarget } from '@shared/types';
import { withAllTargets } from '../../../src/main/ipc/capture-proposal';
import { NOW_MS } from '../../helpers/time';
import {
  AREA_PATH,
  JOURNAL_PATH,
  MODULE_SLUG,
  WORK_PROJECT,
  WORK_PROJECT_PATH,
  captureFixture,
} from './fixtures';

const DUMP_PATH = 'inbox/2026-08-10-1432-gedanke.md';
const TEXT = 'Rueckruf beim Kunden, das Login-Problem ist nachvollziehbar.';
const CREATED_AT = new Date(NOW_MS).toISOString();

function draft(target: FilingTarget, overrides: Partial<ProposalDraft> = {}): ProposalDraft {
  return {
    dumpPath: DUMP_PATH,
    text: TEXT,
    title: 'Rueckruf',
    scope: 'work',
    tags: [],
    target,
    targetKey: null,
    newProjectTitle: null,
    section: null,
    todos: [],
    waitingOn: [],
    entities: [],
    reason: 'Testgrund',
    confidence: 0.8,
    heuristic: true,
    ...overrides,
  };
}

/** One draft per target kind, each resolving (none falls back to the inbox). */
const DRAFTS: readonly ProposalDraft[] = [
  draft('project', { targetKey: WORK_PROJECT }),
  draft('area', { targetKey: 'gesundheit' }),
  draft('module', { targetKey: MODULE_SLUG }),
  draft('journal', { section: 'Fakten' }),
  draft('new-project', { newProjectTitle: 'Neues Vorhaben Nord' }),
  draft('new-project', { scope: 'private', newProjectTitle: 'Garage aufräumen & streichen' }),
  draft('inbox'),
];

function verify(
  action: FilingAction,
  context: FilingContext,
  docLanguage: DocLanguage = 'de',
  createdAt: string = CREATED_AT,
): FilingAction | string {
  return verifyFilingAction(action, context, { dumpPath: DUMP_PATH, createdAt, docLanguage });
}

function accepted(result: FilingAction | string): FilingAction {
  if (typeof result === 'string') throw new Error(`refused: ${result}`);
  return result;
}

describe('verifyFilingAction — what the core builds passes', () => {
  it.each<DocLanguage>(['de', 'en'])(
    'accepts every primary and alternative buildProposal produces (%s)',
    async (docLanguage) => {
      const fixture = await captureFixture();
      const seen = new Set<FilingTarget>();
      for (const entry of DRAFTS) {
        const proposal = buildProposal(entry, fixture.context, NOW_MS, docLanguage);
        expect(proposal.primary.target).toBe(entry.target);
        for (const action of [proposal.primary, ...proposal.alternatives]) {
          seen.add(action.target);
          expect(accepted(verify(action, fixture.context, docLanguage))).toEqual(action);
        }
      }
      expect([...seen].sort()).toEqual(
        ['area', 'inbox', 'journal', 'module', 'new-project', 'project'].sort(),
      );
    },
  );

  it('accepts every target withAllTargets offers, keeping each section kind', async () => {
    const fixture = await captureFixture();
    for (const entry of DRAFTS) {
      const built = buildProposal(entry, fixture.context, NOW_MS, 'de');
      const proposal = withAllTargets(built, fixture.index, TEXT, NOW_MS, 'de');
      const actions = [proposal.primary, ...proposal.alternatives];
      expect(new Set(actions.map((action) => action.target))).toEqual(
        new Set([entry.target, 'project', 'area', 'module', 'journal', 'inbox']),
      );
      for (const action of actions) {
        const result = accepted(verify(action, fixture.context));
        expect(result.path).toBe(action.path);
        expect(result.content).toBe(action.content);
        expect(result.section === null ? null : sectionKindOf(result.section)).toBe(
          action.section === null ? null : sectionKindOf(action.section),
        );
      }
    }
  });

  it('accepts the journal entry across midnight, and no other day', async () => {
    const fixture = await captureFixture();
    const builtAt = new Date(2026, 7, 10, 23, 58);
    const confirmedAt = new Date(2026, 7, 11, 0, 2);
    const proposal = buildProposal(
      draft('journal'),
      buildFilingContext(fixture.index, { now: builtAt }),
      builtAt,
    );
    const confirmContext = buildFilingContext(fixture.index, { now: confirmedAt });
    const createdAt = proposal.createdAt;
    const onDay = (day: string): FilingAction => ({ ...proposal.primary, path: journalPath(day) });

    expect(proposal.primary.path).toBe(journalPath('2026-08-10'));
    expect(accepted(verify(proposal.primary, confirmContext, 'de', createdAt))).toEqual(
      proposal.primary,
    );
    expect(typeof verify(onDay('2026-08-11'), confirmContext, 'de', createdAt)).toBe('object');
    expect(typeof verify(onDay('2026-08-09'), confirmContext, 'de', createdAt)).toBe('string');
    expect(typeof verify(onDay('2026-08-12'), confirmContext, 'de', createdAt)).toBe('string');
    // An unreadable creation time leaves only today.
    expect(typeof verify(proposal.primary, confirmContext, 'de', 'kein Datum')).toBe('string');
    expect(typeof verify(onDay('2026-08-11'), confirmContext, 'de', 'kein Datum')).toBe('object');
  });
});

describe('verifyFilingAction — what does not resolve is refused', () => {
  const action = (target: string, path: unknown, section: unknown = null): FilingAction =>
    ({ target, path, section, content: TEXT }) as unknown as FilingAction; // deliberately malformed input

  it('refuses a project path the index does not know', async () => {
    const fixture = await captureFixture();
    for (const path of [
      'projects/work/unbekannt/project.md',
      'projects/work/kundenportal-relaunch/../hochbeet-bauen/project.md',
      'projects/work/kundenportal-relaunch/notes/geheim.md',
      AREA_PATH,
      JOURNAL_PATH,
      DUMP_PATH,
    ]) {
      expect(typeof verify(action('project', path, 'Notizen'), fixture.context)).toBe('string');
    }
    expect(typeof verify(action('project', WORK_PROJECT_PATH), fixture.context)).toBe('object');
  });

  it.each<[string, unknown]>([
    ['area', 'areas/unbekannt.md'],
    ['area', WORK_PROJECT_PATH],
    ['module', 'modules/unbekannt/module.md'],
    ['module', `modules/${MODULE_SLUG}/wiki/index.md`],
    ['module', `modules/../${MODULE_SLUG}/module.md`],
    ['journal', 'journal/2026/08/2026-08-10.md.bak'],
    ['journal', 'journal/2026/08/2026-08-09.md'],
    ['journal', WORK_PROJECT_PATH],
    ['inbox', 'inbox/ein-anderer-dump.md'],
    ['inbox', WORK_PROJECT_PATH],
    ['new-project', 'projects/shared/neu/project.md'],
    ['new-project', 'projects/work/Neues Projekt/project.md'],
    ['new-project', 'projects/work/../neu/project.md'],
    ['new-project', 'projects/work/neu/sub/project.md'],
    ['new-project', 'projects/work/neu/notes.md'],
    ['new-project', AREA_PATH],
    ['wiki', `modules/${MODULE_SLUG}/module.md`],
    ['project', 42],
    ['project', ''],
  ])('refuses a tampered %s target at %s', async (target, path) => {
    const fixture = await captureFixture();
    expect(typeof verify(action(target, path), fixture.context)).toBe('string');
  });

  it('refuses a section that is not text', async () => {
    const fixture = await captureFixture();
    expect(typeof verify(action('project', WORK_PROJECT_PATH, 7), fixture.context)).toBe('string');
  });
});

describe('verifyFilingAction — the section', () => {
  it('normalizes a section outside the target allowed set to its default', async () => {
    const fixture = await captureFixture();
    const at = (target: FilingTarget, path: string, section: string | null): FilingAction => ({
      target,
      path,
      section,
      content: TEXT,
    });

    const cases: [FilingAction, DocLanguage, string | null][] = [
      [at('project', WORK_PROJECT_PATH, 'Tag'), 'de', 'Notizen'],
      [at('project', WORK_PROJECT_PATH, 'Erfundene Ueberschrift'), 'de', 'Notizen'],
      [at('project', WORK_PROJECT_PATH, 'Stand'), 'de', 'Stand'],
      [at('project', WORK_PROJECT_PATH, 'Muster'), 'en', 'Notes'],
      [at('area', AREA_PATH, 'Stand'), 'de', 'Notizen'],
      [at('module', `modules/${MODULE_SLUG}/module.md`, 'Todos'), 'de', 'Notizen'],
      [at('journal', JOURNAL_PATH, 'Notizen'), 'de', 'Tag'],
      [at('journal', JOURNAL_PATH, 'Facts'), 'de', 'Fakten'],
      [at('journal', JOURNAL_PATH, null), 'en', 'Day'],
      [at('inbox', DUMP_PATH, 'Notizen'), 'de', null],
    ];
    for (const [input, docLanguage, expected] of cases) {
      const result = accepted(verify(input, fixture.context, docLanguage));
      expect(result.section).toBe(expected);
      // The text is the user's to edit — never re-derived here.
      expect(result.content).toBe(TEXT);
    }
  });
});
