// @vitest-environment jsdom
/* `ProjectList` (story 001, D12): the cards `AgentsScreen` shows once
 * projects for the chosen CLI have loaded. Covers the six facts the
 * story's acceptance criteria calls for (name, path, session count, last
 * and first activity, linked vault project), that a project without a
 * link never gets a fabricated one, that the given order survives
 * untouched (the core does the sorting, not this component), and that a
 * click opens the right project. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentProject } from '@shared/types';
import { ProjectList } from '@renderer/screens/agents/ProjectList';
import { setLanguage } from '@renderer/i18n';

const NOW = '2026-08-12T09:00:00+02:00';

/* Same constant as `tests/helpers/time.ts`, restated here: `tsconfig.web.json`
   only knows `tests/renderer/**` — an import from there would be a type
   error, not a gain (see `tests/renderer/projects.test.tsx`). */
function freezeTime(): void {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
}

function apple(): AgentProject {
  return {
    key: 'c:/repos/apple',
    path: 'C:/repos/apple',
    name: 'apple',
    agent: 'claude',
    sessionCount: 4,
    firstActivity: '2026-07-01T09:00:00+02:00',
    lastActivity: NOW,
    vaultProject: 'website-redesign',
  };
}

function banana(): AgentProject {
  return {
    key: 'c:/repos/banana',
    path: 'C:/repos/banana',
    name: 'banana',
    agent: 'claude',
    sessionCount: 1,
    firstActivity: '2026-08-01T09:00:00+02:00',
    lastActivity: '2026-08-09T09:00:00+02:00',
    vaultProject: null,
  };
}

beforeEach(() => {
  setLanguage('en');
  document.documentElement.lang = 'en';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectList', () => {
  it('shows name, path, session count, last and first activity, and the linked vault project', () => {
    freezeTime();
    render(<ProjectList projects={[apple()]} onOpen={() => undefined} />);

    const card = within(screen.getByRole('button', { name: 'Open project apple' }));
    expect(card.getByText('apple')).toBeTruthy();
    expect(card.getByText('C:/repos/apple')).toBeTruthy();
    expect(card.getByText('4 sessions · last active today')).toBeTruthy();
    expect(card.getByText('since 1 Jul 2026')).toBeTruthy();
    expect(card.getByText('linked to website-redesign')).toBeTruthy();
  });

  it('does not invent a vault project when none is linked', () => {
    freezeTime();
    render(<ProjectList projects={[banana()]} onOpen={() => undefined} />);

    const card = within(screen.getByRole('button', { name: 'Open project banana' }));
    expect(card.getByText('one session · last active 3 days ago')).toBeTruthy();
    expect(screen.queryByText(/linked to/)).toBeNull();
  });

  it('keeps the order it was given instead of re-sorting', () => {
    freezeTime();
    render(<ProjectList projects={[banana(), apple()]} onOpen={() => undefined} />);

    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Open project banana', 'Open project apple']);
  });

  it('opens the clicked project by key', async () => {
    freezeTime();
    const onOpen = vi.fn();
    render(<ProjectList projects={[apple(), banana()]} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open project banana' }));
    expect(onOpen).toHaveBeenCalledWith('c:/repos/banana');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
