// @vitest-environment jsdom
/* The session store for the open day-close proposal (018, D1).
 *
 * Three promises: a date without an entry reads as nothing, a patch touches
 * only the edit fields it names, and a fresh `set` for the same date wins
 * outright — no merge of the old edits into the new suggestion. */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { JournalCloseSuggestion } from '@shared/ipc';
import { clear, emptySuggestion, patch, set, useCloseProposal } from '@renderer/lib/close-proposal';

function suggestion(date: string, reason = 'reason'): JournalCloseSuggestion {
  return {
    date,
    path: `journal/2026/08/${date}.md`,
    proposal: {
      dumpPath: `journal/2026/08/${date}.md`,
      title: date,
      scope: 'work',
      tags: [],
      primary: { kind: 'journal', target: `journal/2026/08/${date}.md' `, reason },
      extras: [],
      alternatives: [],
      todos: [],
      waitingOn: [],
      reason,
    },
    frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
    heuristic: false,
  } as unknown as JournalCloseSuggestion;
}

describe('close-proposal: emptySuggestion (049, D4)', () => {
  it('builds a suggestion with every list empty, no frontmatter change and the given reason', () => {
    const result = emptySuggestion('2026-08-20', 'journal/2026/08/2026-08-20.md', 'nothing found');

    expect(result.date).toBe('2026-08-20');
    expect(result.path).toBe('journal/2026/08/2026-08-20.md');
    expect(result.heuristic).toBe(false);
    expect(result.proposal.heuristic).toBe(false);
    expect(result.proposal.reason).toBe('nothing found');
    expect(result.proposal.todos).toEqual([]);
    expect(result.proposal.waitingOn).toEqual([]);
    expect(result.proposal.entities).toEqual([]);
    expect(result.frontmatter).toEqual({
      people: [],
      projects: [],
      areas: [],
      mood: null,
      energy: null,
      tags: [],
    });
  });
});

describe('close-proposal: set / patch / clear / useCloseProposal', () => {
  beforeEach(() => {
    clear('2026-08-19');
    clear('2026-08-20');
  });

  it('reads nothing for a date that was never set', () => {
    const { result } = renderHook(() => useCloseProposal('2026-08-19'));
    expect(result.current).toBeUndefined();
  });

  it('setting a proposal for one date leaves a different date empty', () => {
    set('2026-08-20', suggestion('2026-08-20'));

    const { result } = renderHook(() => useCloseProposal('2026-08-19'));
    expect(result.current).toBeUndefined();
  });

  it('reflects a set proposal for its own date', () => {
    const s = suggestion('2026-08-20');
    set('2026-08-20', s);

    const { result } = renderHook(() => useCloseProposal('2026-08-20'));
    expect(result.current?.suggestion).toBe(s);
    expect(result.current?.edits).toEqual({
      keepTodo: {},
      dueTodo: {},
      keepField: {},
      areas: null,
    });
  });

  it('patch updates only the named edit fields, leaving the rest untouched', () => {
    const s = suggestion('2026-08-20');
    set('2026-08-20', s);

    const { result } = renderHook(() => useCloseProposal('2026-08-20'));
    act(() => patch('2026-08-20', { keepTodo: { 0: false } }));

    expect(result.current?.suggestion).toBe(s);
    expect(result.current?.edits.keepTodo).toEqual({ 0: false });
    expect(result.current?.edits.dueTodo).toEqual({});
    expect(result.current?.edits.keepField).toEqual({});

    act(() => patch('2026-08-20', { keepField: { mood: false } }));

    /* The earlier patch to keepTodo survives a later, unrelated patch. */
    expect(result.current?.edits.keepTodo).toEqual({ 0: false });
    expect(result.current?.edits.keepField).toEqual({ mood: false });
  });

  it('patch sets the area slugs, leaving the other edit fields untouched', () => {
    const s = suggestion('2026-08-20');
    set('2026-08-20', s);

    const { result } = renderHook(() => useCloseProposal('2026-08-20'));
    act(() => patch('2026-08-20', { areas: ['gesundheit', 'finanzen'] }));

    expect(result.current?.edits.areas).toEqual(['gesundheit', 'finanzen']);
    expect(result.current?.edits.keepTodo).toEqual({});
    expect(result.current?.edits.keepField).toEqual({});

    act(() => patch('2026-08-20', { areas: [] }));

    /* Emptying the set is a distinct, valid edit — not "unset". */
    expect(result.current?.edits.areas).toEqual([]);
  });

  it('patch on a date with no entry does nothing', () => {
    const { result } = renderHook(() => useCloseProposal('2026-08-20'));
    act(() => patch('2026-08-20', { keepTodo: { 0: false } }));
    expect(result.current).toBeUndefined();
  });

  it('clear empties the entry for that date', () => {
    set('2026-08-20', suggestion('2026-08-20'));
    const { result } = renderHook(() => useCloseProposal('2026-08-20'));
    expect(result.current).not.toBeUndefined();

    act(() => clear('2026-08-20'));
    expect(result.current).toBeUndefined();
  });

  it('a new set for the same date replaces the entry, discarding previous edits', () => {
    const first = suggestion('2026-08-20', 'first run');
    set('2026-08-20', first);

    const { result } = renderHook(() => useCloseProposal('2026-08-20'));
    act(() => patch('2026-08-20', { keepTodo: { 0: false }, keepField: { mood: false } }));
    expect(result.current?.edits.keepTodo).toEqual({ 0: false });

    const second = suggestion('2026-08-20', 'second run');
    act(() => set('2026-08-20', second));

    expect(result.current?.suggestion).toBe(second);
    expect(result.current?.suggestion).not.toBe(first);
    expect(result.current?.edits).toEqual({
      keepTodo: {},
      dueTodo: {},
      keepField: {},
      areas: null,
    });
  });

  it('survives an unmount/remount within the session', () => {
    const s = suggestion('2026-08-20');
    set('2026-08-20', s);
    act(() => patch('2026-08-20', { keepTodo: { 1: false } }));

    const first = renderHook(() => useCloseProposal('2026-08-20'));
    first.unmount();

    const second = renderHook(() => useCloseProposal('2026-08-20'));
    expect(second.result.current?.suggestion).toBe(s);
    expect(second.result.current?.edits.keepTodo).toEqual({ 1: false });
  });
});
