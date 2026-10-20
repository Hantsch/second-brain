/* The day-close card's rows and its accept payload (075, D1).
 *
 * `payloadOf` is what AC9 hangs on: accepting must write exactly what the card
 * shows. Since the card renders `rowsOf` and accepts `payloadOf`, both being
 * pure and derived from the same `(suggestion, edits)` is what makes that
 * checkable at all — so the tests below pin the two against each other rather
 * than against a snapshot of whatever the code currently returns.
 *
 * Node environment on purpose: nothing here touches the DOM. */

import { describe, expect, it } from 'vitest';
import type { JournalCloseSuggestion, ProposedTodo } from '@shared/types';
import type { CloseProposalEdits } from '@renderer/lib/close-proposal';
import { noEdits } from '@renderer/lib/close-proposal';
import { payloadOf, rowsOf } from '@renderer/lib/close-proposal-view';

const DATE = '2026-08-20';
const PATH = `journal/2026/08/${DATE}.md`;

function todo(text: string, patch: Partial<ProposedTodo> = {}): ProposedTodo {
  return {
    text,
    scope: 'work',
    due: null,
    waitingFor: null,
    priority: 0,
    project: null,
    ...patch,
  };
}

function suggestion(patch: Partial<JournalCloseSuggestion> = {}): JournalCloseSuggestion {
  return {
    date: DATE,
    path: PATH,
    proposal: {
      dumpPath: PATH,
      title: DATE,
      scope: 'work',
      tags: [],
      primary: { target: 'journal', path: PATH, section: null, content: '' },
      extras: [],
      alternatives: [],
      confidence: 1,
      reason: 'reason',
      todos: [
        todo('Measure the offer list load time', { project: 'portal-relaunch' }),
        todo('Write the acceptance protocol', { due: '2026-08-22' }),
      ],
      waitingOn: [{ who: 'Stefan', what: 'the test data', since: DATE }],
      entities: [],
      heuristic: true,
      createdAt: `${DATE}T18:40:00.000Z`,
    },
    frontmatter: {
      people: ['Stefan', 'Anna'],
      projects: ['portal-relaunch'],
      areas: ['gesundheit'],
      mood: 3,
      energy: 2,
      tags: ['stress'],
    },
    heuristic: true,
    ...patch,
  };
}

function edits(patch: Partial<CloseProposalEdits> = {}): CloseProposalEdits {
  return { ...noEdits(), ...patch };
}

describe('close-proposal-view: rowsOf', () => {
  it('lists the proposed todos, then the waiting-on entries, then what was added by hand', () => {
    const added = todo('Order the new certificate', { scope: 'private' });
    const rows = rowsOf(suggestion(), edits({ added: [added] }));

    expect(rows.map((row) => [row.kind, row.at, row.todo.text])).toEqual([
      ['todo', 0, 'Measure the offer list load time'],
      ['todo', 1, 'Write the acceptance protocol'],
      ['waiting', 2, 'the test data'],
      ['added', 0, 'Order the new certificate'],
    ]);
    /* The waiting-on carries its person and the day's scope, the added row is
       its own todo, kept as it stands. */
    expect(rows[2]?.todo.waitingFor).toBe('Stefan');
    expect(rows[2]?.todo.scope).toBe('work');
    expect(rows[3]?.todo).toEqual(added);
    expect(rows.every((row) => row.keep)).toBe(true);
  });

  it('applies a correction to the row it is keyed to, waiting-on rows included', () => {
    const rows = rowsOf(
      suggestion(),
      edits({
        todoEdits: {
          0: { keep: false },
          2: { text: 'the anonymised test data', waitingFor: 'Anna' },
        },
      }),
    );

    expect(rows[0]?.keep).toBe(false);
    /* Row 1 sits between two corrected rows and must stay untouched. */
    expect(rows[1]?.keep).toBe(true);
    expect(rows[1]?.todo).toEqual(suggestion().proposal.todos[1]);
    expect(rows[2]?.todo.text).toBe('the anonymised test data');
    expect(rows[2]?.todo.waitingFor).toBe('Anna');
  });

  it('reads a cleared due date, target or person as chosen, not as untouched', () => {
    const rows = rowsOf(
      suggestion(),
      edits({ todoEdits: { 0: { project: null }, 1: { due: null } } }),
    );

    /* `?? proposed` would silently hand the proposal's value back here. */
    expect(rows[0]?.todo.project).toBeNull();
    expect(rows[1]?.todo.due).toBeNull();
  });
});

describe('close-proposal-view: payloadOf', () => {
  it('payloadOf returns exactly the kept and corrected rows', () => {
    const payload = payloadOf(
      suggestion(),
      edits({
        todoEdits: {
          1: { due: '2026-09-01' },
          2: { keep: false },
        },
      }),
    );

    /* Dropped rows are gone, kept rows carry their correction, and everything
       untouched is passed through unchanged — including the priority and the
       project the card never asked about. */
    expect(payload.todos).toEqual([
      todo('Measure the offer list load time', { project: 'portal-relaunch' }),
      todo('Write the acceptance protocol', { due: '2026-09-01' }),
    ]);
    expect(payload.todos.some((entry) => entry.waitingFor === 'Stefan')).toBe(false);
    /* Untouched areas are written as proposed — no correction, no change. */
    expect(payload.frontmatter.areas).toEqual(['gesundheit']);
    expect(payload.frontmatter).toEqual(suggestion().frontmatter);
    expect(payload.writes).toBe(true);
  });

  it('drops every unticked row and keeps none of them by accident', () => {
    const payload = payloadOf(
      suggestion(),
      edits({ todoEdits: { 0: { keep: false }, 1: { keep: false }, 2: { keep: false } } }),
    );

    expect(payload.todos).toEqual([]);
    /* The frontmatter is still proposed, so accepting does write something. */
    expect(payload.writes).toBe(true);
  });

  it('carries an added todo in the same shape as a proposed one', () => {
    const added = todo('Order the new certificate', { scope: 'private', due: '2026-08-30' });
    const payload = payloadOf(suggestion(), edits({ added: [added], todoEdits: {} }));

    expect(payload.todos.at(-1)).toEqual(added);
    expect(payload.todos).toHaveLength(4);
  });

  it('drops a row whose text is empty after trimming instead of writing a blank todo', () => {
    const payload = payloadOf(
      suggestion(),
      edits({ todoEdits: { 0: { text: '   ' } }, added: [todo('')] }),
    );

    expect(payload.todos.map((entry) => entry.text)).toEqual([
      'Write the acceptance protocol',
      'the test data',
    ]);
  });

  it('an unticked field is dropped from the payload, the others stay', () => {
    const payload = payloadOf(suggestion(), edits({ keepField: { people: false, mood: false } }));

    expect(payload.frontmatter.people).toEqual([]);
    expect(payload.frontmatter.mood).toBeNull();
    expect(payload.frontmatter.projects).toEqual(['portal-relaunch']);
    expect(payload.frontmatter.tags).toEqual(['stress']);
    expect(payload.frontmatter.energy).toBe(2);
  });

  it('a corrected item list wins over the proposal, an emptied one included', () => {
    const payload = payloadOf(
      suggestion(),
      edits({ people: ['Anna'], areas: [], projects: [], tags: ['fokus'] }),
    );

    expect(payload.frontmatter.people).toEqual(['Anna']);
    expect(payload.frontmatter.areas).toEqual([]);
    expect(payload.frontmatter.projects).toEqual([]);
    expect(payload.frontmatter.tags).toEqual(['fokus']);
  });

  it('a corrected mood or energy replaces the proposed value while its box is ticked', () => {
    const payload = payloadOf(suggestion(), edits({ mood: 5, energy: 4 }));

    expect(payload.frontmatter.mood).toBe(5);
    expect(payload.frontmatter.energy).toBe(4);

    /* Unticking still drops the field — the correction does not resurrect it. */
    const dropped = payloadOf(suggestion(), edits({ mood: 5, keepField: { mood: false } }));
    expect(dropped.frontmatter.mood).toBeNull();
  });

  it('reports that nothing would be written when every row and field is gone', () => {
    const empty = suggestion({
      frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
    });
    const payload = payloadOf(
      empty,
      edits({ todoEdits: { 0: { keep: false }, 1: { keep: false }, 2: { keep: false } } }),
    );

    expect(payload.todos).toEqual([]);
    expect(payload.writes).toBe(false);
  });

  it('one kept row alone is enough to write', () => {
    const empty = suggestion({
      frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
    });
    const payload = payloadOf(
      empty,
      edits({ todoEdits: { 0: { keep: false }, 2: { keep: false } } }),
    );

    expect(payload.todos.map((entry) => entry.text)).toEqual(['Write the acceptance protocol']);
    expect(payload.writes).toBe(true);
  });
});
