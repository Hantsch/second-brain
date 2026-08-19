// @vitest-environment jsdom
/* The target picker's own ordering rule: the app's current filing answer
 * stays first no matter what, and among the rest, a favourite project
 * outranks a plainer one that would otherwise come first in proposal order. */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilingAction, Project } from '@shared/types';
import { TargetPicker } from '@renderer/components/TargetPicker';
import { setLanguage } from '@renderer/i18n';

function project(patch: Partial<Project> & { slug: string; title: string }): Project {
  return {
    path: `projects/work/${patch.slug}/project.md`,
    scope: 'work',
    status: 'active',
    priority: 2,
    favorite: false,
    deadline: null,
    nextStep: null,
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: '2026-08-01T10:00:00.000Z',
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 0,
    openTodoCount: 0,
    excerpt: '',
    ...patch,
  };
}

function action(
  patch: Partial<FilingAction> & { target: FilingAction['target']; path: string },
): FilingAction {
  return { section: null, content: '', ...patch };
}

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

const plainProject = project({ slug: 'plain', title: 'Unauffälliges Projekt' });
const starProject = project({ slug: 'stern', title: 'Favorisiertes Projekt', favorite: true });

const inboxAction = action({ target: 'inbox', path: 'inbox/' });
const plainAction = action({ target: 'project', path: plainProject.path });
const starAction = action({ target: 'project', path: starProject.path });
const journalAction = action({ target: 'journal', path: 'journal/2026-08-19.md' });

/* Proposal order deliberately does NOT already favour the star project or the
   selected one — otherwise the test wouldn't tell the reorder apart from the
   original order. */
const actions: FilingAction[] = [inboxAction, plainAction, starAction, journalAction];

const names = { projects: [plainProject, starProject], modules: [] };

function itemNames(): string[] {
  return Array.from(document.querySelectorAll('.sb-picker-item .sb-picker-path')).map(
    (node) => node.textContent ?? '',
  );
}

describe('TargetPicker: Reihenfolge', () => {
  it('hält die aktuell gewählte Ablage vorn und zieht einen Favoriten vor die übrigen', () => {
    render(
      <TargetPicker
        open
        actions={actions}
        current={journalAction}
        names={names}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const order = itemNames();
    expect(order[0]).toBe(journalAction.path);
    expect(order.indexOf(starAction.path)).toBeLessThan(order.indexOf(plainAction.path));
    expect(order.indexOf(starAction.path)).toBeLessThan(order.indexOf(inboxAction.path));
    /* Jede Aktion kommt genau einmal vor, auch wenn current selbst kein
       Favorit ist und keine Verdopplung entstehen darf. */
    expect(order).toHaveLength(actions.length);
    expect(new Set(order).size).toBe(actions.length);
  });

  it('verdoppelt die aktuelle Aktion nicht, wenn sie selbst ein Favorit ist', () => {
    render(
      <TargetPicker
        open
        actions={actions}
        current={starAction}
        names={names}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const order = itemNames();
    expect(order[0]).toBe(starAction.path);
    expect(order.filter((path) => path === starAction.path)).toHaveLength(1);
    expect(order).toHaveLength(actions.length);
  });
});
