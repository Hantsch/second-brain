// @vitest-environment jsdom
/* Favourite projects sort first in the picker — same rule as the dashboard
 * tiles and the project list, applied here to the dropdown that links a
 * Claude session (or an agent's working directory) to a vault project. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@shared/types';
import { SessionLink } from '@renderer/components/tiles/SessionLink';
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

beforeEach(() => {
  setLanguage('de');
  document.documentElement.lang = 'de';
});

const projects: Project[] = [
  project({ slug: 'jung', title: 'Jüngst berührt', lastTouch: '2026-08-10T10:00:00.000Z' }),
  project({
    slug: 'stern',
    title: 'Favorit',
    favorite: true,
    lastTouch: '2026-08-01T10:00:00.000Z',
  }),
  project({ slug: 'alt', title: 'Alt und unauffällig', lastTouch: '2026-07-01T10:00:00.000Z' }),
];

describe('SessionLink: Favoriten zuerst', () => {
  it('stellt ein favorisiertes Projekt vor ein jünger berührtes, unfavorisiertes', () => {
    render(<SessionLink name="Sitzung" projects={projects} onPick={vi.fn()} />);

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    /* Erste Option ist der Platzhalter "Projekt zuordnen" — danach zählt die Reihenfolge. */
    expect(options.slice(1)).toEqual(['Favorit', 'Jüngst berührt', 'Alt und unauffällig']);
  });

  it('ordnet trotzdem korrekt zu, wenn eine Option gewählt wird', async () => {
    const onPick = vi.fn();
    render(<SessionLink name="Sitzung" projects={projects} onPick={onPick} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'jung');

    expect(onPick).toHaveBeenCalledWith('jung');
  });
});
