/* Input selection for condensing a project (story 044, D6). Deterministic and
   model-free, four groups with four bounds. What is under test is not only that
   the right material comes back, but that everything a bound cut away is gone
   from the result *and* counted — an input read in part while `sources:` claims
   the whole file is the failure story 037 shipped and had to fix. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONDENSE_SESSION_LIMIT,
  CONDENSE_SESSION_TAIL_CHARS,
  projectInputs,
  selectProjectCondenseInputs,
  type CondenseProjectSources,
} from '@core/condense/inputs-project';
import { CONDENSE_DAY_WINDOW_DAYS } from '@core/condense/inputs';
import { deriveProjects } from '@core/index/projects';
import { parseTodos } from '@core/index/todos';
import type { IndexedDoc } from '@core/index/types';
import type { ClaudeSession, Project, Todo } from '@shared/types';
import { makeDoc } from '../index/fixtures';

/** "Now" every window computation in this file is measured from. */
const NOW = '2026-08-10';

const FOLDER = 'projects/work/nyota';
const SLUG = 'nyota';

const PROJECT_BODY = [
  '## Stand',
  '',
  'Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren @due:2026-08-15',
  '- [x] Terraform-State migriert @done:2026-08-09',
  '',
].join('\n');

const NOTE_BODY = [
  'Das Rollenkonzept unterscheidet drei Ebenen.',
  '',
  'Die zweite Ebene ist die, die niemand versteht.',
  '',
].join('\n');

function projectDoc(): IndexedDoc {
  return makeDoc({
    path: `${FOLDER}/project.md`,
    docType: 'project',
    title: 'Nyota Auth0 Migration',
    scope: 'work',
    project: SLUG,
    bodyLine: 12,
    frontmatter: {
      type: 'project',
      title: 'Nyota Auth0 Migration',
      slug: SLUG,
      scope: 'work',
      status: 'active',
      waiting_on: [
        { who: 'Stefan', what: 'Freigabe des Rollenkonzepts', since: '2026-08-04' },
        { who: 'Anna', what: 'Gruppenliste', since: '2026-07-01', resolved: true },
      ],
    },
    body: PROJECT_BODY,
  });
}

function noteDoc(name: string, body = NOTE_BODY): IndexedDoc {
  return makeDoc({
    path: `${FOLDER}/notes/${name}.md`,
    docType: 'note',
    title: name,
    project: SLUG,
    body,
  });
}

function journalDoc(date: string, body: string, listed = true): IndexedDoc {
  return makeDoc({
    path: `journal/2026/${date.slice(5, 7)}/${date}.md`,
    docType: 'journal',
    title: date,
    frontmatter: { type: 'journal', date, ...(listed ? { projects: [SLUG] } : {}) },
    body,
  });
}

/** Within the window as seen from `NOW`; long enough that an excerpt would show. */
const RECENT_DAY = journalDoc(
  '2026-07-15',
  `Bei Nyota weitergekommen.\n\n${'Ein langer Absatz über das Rollenkonzept. '.repeat(20)}`,
);

/** Older than 90 days as seen from `NOW` — must be dropped and counted. */
const OLD_DAY = journalDoc('2026-01-05', 'Nyota angefangen.');

/** Names no project at all — never a candidate, not a truncation. */
const UNRELATED_DAY = journalDoc('2026-08-06', 'Keller aufgeräumt.', false);

/** The run's own artifact. Must never become an input to the next run. */
function condensedDoc(): IndexedDoc {
  return makeDoc({
    path: `${FOLDER}/condensed.md`,
    docType: 'condensed',
    title: 'Nyota',
    project: SLUG,
    frontmatter: { type: 'condensed', condensed_at: '2026-08-09T10:00:00.000Z' },
    body: ['## Stand', '', '- [ ] Aus dem Artefakt zurückgelesenes Todo', ''].join('\n'),
  });
}

function docs(): IndexedDoc[] {
  return [
    projectDoc(),
    noteDoc('rollen'),
    noteDoc('architektur'),
    condensedDoc(),
    RECENT_DAY,
    OLD_DAY,
    UNRELATED_DAY,
  ];
}

/** Todos the way the index derives them: parsed out of every document. */
function todosOf(all: readonly IndexedDoc[]): Todo[] {
  return all.flatMap((doc) =>
    parseTodos(doc.body, {
      path: doc.path,
      frontmatter: doc.frontmatter,
      lineOffset: doc.bodyLine,
      today: NOW,
    }),
  );
}

function projectOf(all: readonly IndexedDoc[]): Project {
  const project = deriveProjects(all, todosOf(all), { now: NOW }).find(
    (candidate) => candidate.slug === SLUG,
  );
  if (project === undefined) throw new Error('fixture project missing');
  return project;
}

function sources(all: readonly IndexedDoc[] = docs()) {
  return { project: projectOf(all), docs: all, todos: todosOf(all) };
}

function session(partial: Partial<ClaudeSession> & { id: string }): ClaudeSession {
  return {
    cwd: 'C:/Dev/Hantsch/nyota',
    projectName: 'nyota',
    vaultProject: SLUG,
    gitBranch: 'main',
    startedAt: '2026-08-08T08:00:00.000Z',
    lastActivity: '2026-08-08T09:00:00.000Z',
    messageCount: 12,
    firstPrompt: 'Rollen migrieren',
    summary: null,
    files: [],
    model: null,
    subagents: null,
    contextTokens: null,
    ...partial,
  };
}

describe('selectProjectCondenseInputs', () => {
  it('returns the state section, every note verbatim, all todos and all waiting-on', async () => {
    const selection = await selectProjectCondenseInputs(sources(), { now: NOW });

    expect(selection.slug).toBe(SLUG);
    expect(selection.scope).toBe('work');
    expect(selection.state).toBe(
      'Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten.',
    );

    // Path-ascending, and the *whole* body — not a preview of it.
    expect(selection.notes.map((note) => note.path)).toEqual([
      `${FOLDER}/notes/architektur.md`,
      `${FOLDER}/notes/rollen.md`,
    ]);
    for (const note of selection.notes) expect(note.text).toBe(NOTE_BODY);

    // Open *and* done (D17), with their dates.
    expect(selection.todos.map((todo) => [todo.text, todo.state])).toEqual([
      ['Rollen-Mapping dokumentieren', 'open'],
      ['Terraform-State migriert', 'done'],
    ]);
    expect(selection.todos[0]?.due).toBe('2026-08-15');
    expect(selection.todos[1]?.doneAt).toBe('2026-08-09');

    // Resolved *and* unresolved (D17), with their dates.
    expect(selection.waitingOn.map((entry) => [entry.who, entry.resolved])).toEqual([
      ['Stefan', false],
      ['Anna', true],
    ]);
    expect(selection.waitingOn[0]?.since).toBe('2026-08-04');
  });

  it('reads mentioning day entries in full, not as an excerpt', async () => {
    const selection = await selectProjectCondenseInputs(sources(), { now: NOW });

    expect(selection.days.map((day) => day.date)).toEqual(['2026-07-15']);
    expect(selection.days[0]?.text).toBe(RECENT_DAY.body);
    // The clamp `mentions()` applies for the status suggestion is 400 chars.
    expect(selection.days[0]?.text.length).toBeGreaterThan(400);
  });

  it('finds a day that names the project only in its text', async () => {
    const byTitle = journalDoc('2026-08-01', 'Heute an Nyota Auth0 Migration gesessen.', false);
    const selection = await selectProjectCondenseInputs(sources([...docs(), byTitle]), {
      now: NOW,
    });

    expect(selection.days.map((day) => day.date)).toEqual(['2026-07-15', '2026-08-01']);
  });

  it('drops days outside the 90-day window and counts them', async () => {
    const selection = await selectProjectCondenseInputs(sources(), { now: NOW });

    expect(selection.days.map((day) => day.date)).not.toContain('2026-01-05');
    expect(selection.truncated?.days).toBe(1);
    expect(selection.truncated?.count).toBe(1);
    expect(selection.truncated?.reason).toContain(String(CONDENSE_DAY_WINDOW_DAYS));
  });

  it('reports nothing as truncated when no bound cut anything', async () => {
    const selection = await selectProjectCondenseInputs(
      sources([projectDoc(), noteDoc('rollen'), RECENT_DAY, UNRELATED_DAY]),
      { now: NOW },
    );

    expect(selection.days).toHaveLength(1);
    // A day that never named the project was no candidate — not a truncation.
    expect(selection.truncated).toBeNull();
  });

  it('never reads its own artifact back in', async () => {
    const selection = await selectProjectCondenseInputs(sources(), { now: NOW });

    const paths = [
      ...selection.notes.map((note) => note.path),
      ...selection.todos.map((t) => t.path),
    ];
    expect(paths).not.toContain(`${FOLDER}/condensed.md`);
    expect(selection.todos.map((todo) => todo.text)).not.toContain(
      'Aus dem Artefakt zurückgelesenes Todo',
    );
  });

  it('reads at most the three most recently active linked sessions', async () => {
    const sessions = [
      session({ id: 'old', lastActivity: '2026-08-01T09:00:00.000Z' }),
      session({ id: 'newest', lastActivity: '2026-08-09T09:00:00.000Z' }),
      session({ id: 'second', lastActivity: '2026-08-08T09:00:00.000Z' }),
      session({ id: 'third', lastActivity: '2026-08-07T09:00:00.000Z' }),
      session({ id: 'other-project', vaultProject: 'keller-ausbau' }),
    ];
    const selection = await selectProjectCondenseInputs(
      { ...sources(), sessions, readTranscriptTail: async () => 'kurzer Verlauf' },
      { now: NOW },
    );

    expect(CONDENSE_SESSION_LIMIT).toBe(3);
    expect(selection.sessions.map((entry) => entry.id)).toEqual(['newest', 'second', 'third']);
    expect(selection.sessions[0]?.tail).toBe('kurzer Verlauf');
    // Only the fourth linked session was dropped; the other project's was never
    // a candidate.
    expect(selection.truncated?.sessions).toBe(1);
  });

  it('clamps each session tail and counts the characters it dropped', async () => {
    const tail = `${'a'.repeat(CONDENSE_SESSION_TAIL_CHARS)}ENDE`;
    const sessions = [session({ id: 'one' }), session({ id: 'two' })];
    const selection = await selectProjectCondenseInputs(
      { ...sources(), sessions, readTranscriptTail: async () => tail },
      { now: NOW },
    );

    for (const entry of selection.sessions) {
      expect(entry.tail).toHaveLength(CONDENSE_SESSION_TAIL_CHARS);
      // The clamp keeps the end of the tail — that is where the work stopped.
      expect(entry.tail.endsWith('ENDE')).toBe(true);
      expect(entry.droppedChars).toBe(4);
    }
    expect(selection.truncated?.clampedSessions).toBe(2);
    expect(selection.truncated?.transcriptChars).toBe(8);
    // Two clamped sessions plus the one out-of-window day.
    expect(selection.truncated?.count).toBe(3);
  });

  it("excludes a same-slug session outside this project's repos (review fix)", async () => {
    // `vaultProject` is slug-only (link.ts), so a project in a different scope
    // sharing the slug 'nyota' would look identical from that field alone. When
    // the project names `repos`, only a session whose cwd actually lies under
    // one of them may count — otherwise a private project could pull in a work
    // session's transcript purely by slug coincidence.
    const withRepos = docs().map((doc) =>
      doc.docType === 'project'
        ? { ...doc, frontmatter: { ...doc.frontmatter, repos: ['C:/Dev/Hantsch/nyota'] } }
        : doc,
    );
    const inRepo = session({ id: 'in-repo', cwd: 'C:/Dev/Hantsch/nyota' });
    const otherScope = session({ id: 'other-scope', cwd: 'C:/Dev/other-org/nyota' });

    const selection = await selectProjectCondenseInputs(
      {
        ...sources(withRepos),
        sessions: [inRepo, otherScope],
        readTranscriptTail: async () => 'kurzer Verlauf',
      },
      { now: NOW },
    );

    expect(selection.sessions.map((entry) => entry.id)).toEqual(['in-repo']);
  });

  it('falls back to slug-only matching when the project names no repos', async () => {
    // Unchanged behaviour for the common case: no `repos` in the frontmatter,
    // same as every other test in this file.
    const anySession = session({ id: 'any', cwd: 'C:/wherever/it/lives' });
    const selection = await selectProjectCondenseInputs(
      { ...sources(), sessions: [anySession], readTranscriptTail: async () => 'x' },
      { now: NOW },
    );

    expect(selection.sessions.map((entry) => entry.id)).toEqual(['any']);
  });

  it('emits one agent citation per distinct agent project, not per session', async () => {
    const sessions = [
      session({ id: 'a', cwd: 'C:/Dev/Hantsch/nyota', lastActivity: '2026-08-09T09:00:00.000Z' }),
      session({
        id: 'b',
        cwd: 'c:\\Dev\\Hantsch\\nyota',
        lastActivity: '2026-08-08T09:00:00.000Z',
      }),
      session({ id: 'c', cwd: 'C:/Dev/Hantsch/nyota-infra', lastActivity: '2026-08-07T09:00:00' }),
    ];
    const selection = await selectProjectCondenseInputs(
      { ...sources(), sessions, readTranscriptTail: async () => '' },
      { now: NOW },
    );

    expect(selection.sessions).toHaveLength(3);
    expect(selection.agentRefs).toEqual([
      'agent:claude/c:/dev/hantsch/nyota',
      'agent:claude/c:/dev/hantsch/nyota-infra',
    ]);
  });

  it('leaves the tails empty when no transcript reader was supplied', async () => {
    const selection = await selectProjectCondenseInputs(
      { ...sources(), sessions: [session({ id: 'one', summary: 'Rollen migriert' })] },
      { now: NOW },
    );

    expect(selection.sessions[0]?.tail).toBe('');
    expect(selection.sessions[0]?.text).toBe('Rollen migriert');
    expect(selection.truncated?.clampedSessions).toBe(0);
  });

  it('is stable across repeated calls', async () => {
    const sessions = [session({ id: 'one' }), session({ id: 'two' })];
    const input = { ...sources(), sessions, readTranscriptTail: async () => 'verlauf' };
    const first = await selectProjectCondenseInputs(input, { now: NOW });
    const second = await selectProjectCondenseInputs(input, { now: NOW });

    expect(second).toEqual(first);
  });

  it('involves no model or gateway — the module has no such dependency', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../src/core/condense/inputs-project.ts'),
      'utf8',
    );
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'));
    expect(importLines.join('\n')).not.toMatch(/llm|gateway/i);
  });
});

/* The document inventory for `source_hashes` (D19). Vault documents only: an
   agent session has no vault hash, and recording one would make the staleness
   check compare a number it cannot obtain again (D18). */
describe('projectInputs', () => {
  it('returns project.md, its notes, then the in-window days, each with its hash', () => {
    const all = docs();
    const inputs = projectInputs(sources(all), { now: NOW });

    expect(inputs.map((input) => input.path)).toEqual([
      `${FOLDER}/project.md`,
      `${FOLDER}/notes/architektur.md`,
      `${FOLDER}/notes/rollen.md`,
      RECENT_DAY.path,
    ]);
    for (const input of inputs) {
      const doc = all.find((candidate) => candidate.path === input.path);
      expect(input.hash).toBe(doc?.hash);
      expect(input.hash.length).toBeGreaterThan(0);
    }
  });

  it('lists a further document a todo of this project lives in', () => {
    const log = makeDoc({
      path: `${FOLDER}/log.md`,
      docType: 'note',
      project: SLUG,
      body: '- [ ] Testmandanten anlegen',
    });
    const paths = projectInputs(sources([...docs(), log]), { now: NOW }).map((input) => input.path);

    expect(paths).toContain(`${FOLDER}/log.md`);
  });

  it('is one entry per document, not per note or per todo', () => {
    // project.md alone holds the state section, two todos and two waiting-on
    // entries; one file hash covers all of them.
    const inputs = projectInputs(sources([projectDoc()]), { now: NOW });
    expect(inputs).toHaveLength(1);
  });

  it('carries no agent session and no artifact of its own', () => {
    // Typed as the wider source shape on purpose: `projectInputs` takes it and
    // still records vault documents only (D18).
    const withSessions: CondenseProjectSources = {
      ...sources(),
      sessions: [session({ id: 'one' })],
    };
    const paths = projectInputs(withSessions, { now: NOW }).map((input) => input.path);

    expect(paths.some((path) => path.startsWith('agent:'))).toBe(false);
    expect(paths).not.toContain(`${FOLDER}/condensed.md`);
  });

  it('uses the same window as the selection', async () => {
    const paths = projectInputs(sources(), { now: NOW }).map((input) => input.path);
    const selection = await selectProjectCondenseInputs(sources(), { now: NOW });

    expect(paths).not.toContain(OLD_DAY.path);
    expect(paths).not.toContain(UNRELATED_DAY.path);
    for (const day of selection.days) expect(paths).toContain(day.path);
  });
});
