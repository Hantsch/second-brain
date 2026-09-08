// @vitest-environment jsdom
/* The editable todo row of the day close-out (075, D2).
 *
 * Every other close-out test proves what the model proposed; these prove
 * what the user corrects before accepting — text, target, scope, and (for a
 * waiting-on row) the person and subject both. `payloadOf` is what "Apply"
 * actually sends (see `close-proposal-view.test.ts`), so every assertion
 * here reads it off the live store entry after firing real DOM events on
 * `CloseProposal`'s rendered row, the same way `close-proposal-areas.test.tsx`
 * does for the areas row — never just a callback argument, which would only
 * prove a handler ran, not that the correction reached what gets written. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { JournalCloseSuggestion, Project } from '@shared/types';
import { CloseProposal } from '@renderer/screens/journal/CloseProposal';
import { clear, set, useCloseProposal } from '@renderer/lib/close-proposal';
import { payloadOf, rowsOf } from '@renderer/lib/close-proposal-view';
import type { ClosePayload, CloseRow } from '@renderer/lib/close-proposal-view';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

const DATE = '2026-08-20';
const DAY_PATH = `journal/2026/08/${DATE}.md`;
const NOW = '2026-08-20T18:00:00.000Z';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

function installMock(handlers: Handlers): void {
  const invoke = async (channel: IpcChannel, payload?: unknown) => {
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler) throw Object.assign(new Error(`no handler for ${channel}`), { code: 'invalid' });
    return handler(payload);
  };
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
}

function project(patch: Partial<Project> = {}): Project {
  return {
    path: 'projects/work/portal-relaunch/project.md',
    slug: 'portal-relaunch',
    title: 'Portal Relaunch',
    scope: 'work',
    status: 'active',
    priority: 1,
    favorite: false,
    deadline: null,
    nextStep: null,
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: NOW,
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 0,
    openTodoCount: 0,
    excerpt: '',
    ...patch,
  };
}

const PROJECT_WORK = project();
const PROJECT_PRIVATE = project({
  path: 'projects/private/garden-fence/project.md',
  slug: 'garden-fence',
  title: 'Garden fence',
  scope: 'private',
});

function suggestion(): JournalCloseSuggestion {
  return {
    date: DATE,
    path: DAY_PATH,
    proposal: {
      dumpPath: DAY_PATH,
      title: DATE,
      scope: 'work',
      tags: [],
      primary: { target: 'journal', path: DAY_PATH, section: 'Facts', content: '' },
      extras: [],
      alternatives: [],
      confidence: 1,
      reason: 'Recognised without a model: 1 todo, 1 waiting-on.',
      todos: [
        {
          text: 'Measure the offer list load time',
          scope: 'work',
          due: null,
          waitingFor: null,
          priority: 0,
          project: null,
        },
      ],
      waitingOn: [{ who: 'Stefan', what: 'the rollout sign-off', since: DATE }],
      entities: [],
      heuristic: true,
      createdAt: NOW,
    },
    frontmatter: { people: [], projects: [], areas: [], mood: null, energy: null, tags: [] },
    heuristic: true,
  };
}

/* Reads `payloadOf` off the live store entry rather than a snapshot taken at
   render time — it re-subscribes to the same session store `CloseProposal`
   itself reads, so it reflects every edit fired against the rendered card. */
let latestPayload: ClosePayload | null = null;
let latestRows: CloseRow[] | null = null;

function PayloadProbe({ date }: { date: string }) {
  const entry = useCloseProposal(date);
  latestPayload = entry === undefined ? null : payloadOf(entry.suggestion, entry.edits);
  latestRows = entry === undefined ? null : rowsOf(entry.suggestion, entry.edits);
  return null;
}

function renderPanel(): void {
  installMock({
    'vault:status': () => ({
      root: 'C:/vaults/demo',
      name: 'Demo',
      ready: true,
      docCount: 1,
      indexedAt: NOW,
      indexing: false,
    }),
    'areas:list': () => [],
  });
  set(DATE, suggestion());
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PayloadProbe date={DATE} />
      <CloseProposal
        date={DATE}
        projects={[PROJECT_WORK, PROJECT_PRIVATE]}
        busy={false}
        error={null}
        onApply={() => undefined}
        onDiscard={() => undefined}
        onRunAgain={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe('day close-out: the editable todo row (075, D2)', () => {
  beforeEach(() => {
    setLanguage('en');
    latestPayload = null;
    latestRows = null;
  });
  afterEach(() => clear(DATE));

  it('an edited text replaces the proposed one in the payload (AC1)', async () => {
    renderPanel();
    const rows = await screen.findAllByLabelText('Todo text');
    const todoText = rows[0] as HTMLElement;

    /* Ctrl+A then type, not clear() then type(): the row disappears the
       instant its text is genuinely blank (075, D3 — see the "clearing a
       proposed row's text" case below), so a real edit-in-place replaces the
       selection in one keystroke rather than ever committing an empty value. */
    await userEvent.type(todoText, '{Control>}a{/Control}Measure and report the load time');

    expect(latestPayload?.todos[0]?.text).toBe('Measure and report the load time');
    /* The waiting-on's own subject, next in row order, is untouched. */
    expect(latestPayload?.todos[1]?.text).toBe('the rollout sign-off');
  });

  it("a retargeted todo's project reaches the payload, day to project and project to project (AC2)", async () => {
    renderPanel();
    const target = await screen.findByLabelText('Target');

    await userEvent.selectOptions(target, PROJECT_WORK.slug);
    expect(latestPayload?.todos[0]?.project).toBe(PROJECT_WORK.slug);

    await userEvent.selectOptions(target, PROJECT_PRIVATE.slug);
    expect(latestPayload?.todos[0]?.project).toBe(PROJECT_PRIVATE.slug);

    await userEvent.selectOptions(target, '');
    expect(latestPayload?.todos[0]?.project).toBeNull();
  });

  it('a corrected scope reaches the payload while the row still targets the day (AC3)', async () => {
    renderPanel();
    const scopeRows = await screen.findAllByLabelText('Work or private');
    const todoScope = scopeRows[0] as HTMLElement;

    expect((todoScope as HTMLSelectElement).disabled).toBe(false);
    expect((todoScope as HTMLSelectElement).value).toBe('work');

    await userEvent.selectOptions(todoScope, 'private');

    expect(latestPayload?.todos[0]?.scope).toBe('private');
  });

  it("a project-targeted row's scope control is disabled and shows the project's own scope (AC3)", async () => {
    renderPanel();
    const target = await screen.findByLabelText('Target');

    await userEvent.selectOptions(target, PROJECT_PRIVATE.slug);

    const scopeRows = await screen.findAllByLabelText('Work or private');
    const todoScope = scopeRows[0] as HTMLElement;
    expect((todoScope as HTMLSelectElement).disabled).toBe(true);
    expect((todoScope as HTMLSelectElement).value).toBe('private');
  });

  it("a waiting-on's person and subject are both corrected in the payload (AC4)", async () => {
    renderPanel();
    const subjectInputs = await screen.findAllByLabelText('Todo text');
    const waitingSubject = subjectInputs[1] as HTMLElement;
    const waitingPerson = await screen.findByLabelText('Waiting on (person)');

    /* Same Ctrl+A-then-type reasoning as AC1 above — clear() alone would
       commit a blank subject and drop the row before the replacement text
       ever lands. */
    await userEvent.type(waitingSubject, '{Control>}a{/Control}the corrected rollout sign-off');
    await userEvent.clear(waitingPerson);
    await userEvent.type(waitingPerson, 'Anna');

    expect(latestPayload?.todos[1]?.text).toBe('the corrected rollout sign-off');
    expect(latestPayload?.todos[1]?.waitingFor).toBe('Anna');
    /* The todo row, first in row order, is untouched by the waiting row's edits. */
    expect(latestPayload?.todos[0]?.text).toBe('Measure the offer list load time');
  });

  it('a waiting row never offers a target picker — @wait always goes to the day', async () => {
    renderPanel();

    expect(await screen.findAllByLabelText('Target')).toHaveLength(1);
  });

  it('clearing the waiting-on person crosses as null, not an empty string (finding 2)', async () => {
    renderPanel();
    const waitingPerson = await screen.findByLabelText('Waiting on (person)');

    await userEvent.clear(waitingPerson);

    expect(latestPayload?.todos[1]?.waitingFor).toBeNull();
  });
});

describe('day close-out: adding a todo by hand (075, D3, AC5)', () => {
  beforeEach(() => {
    setLanguage('en');
    latestPayload = null;
    latestRows = null;
  });
  afterEach(() => clear(DATE));

  it('an added todo reaches the payload with text, due, target and scope', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a todo' }));

    const addedText = (await screen.findAllByLabelText('Todo text')).at(-1) as HTMLElement;
    await userEvent.type(addedText, 'Book the venue for the offsite');

    /* Scope first, while it is still editable — picking a target below locks
       it to the project's own scope (075, D2), so the order matters. */
    const addedScope = (await screen.findAllByLabelText('Work or private')).at(-1) as HTMLElement;
    await userEvent.selectOptions(addedScope, 'work');

    const dueGroup = screen.getByRole('group', {
      name: 'Due date for “Book the venue for the offsite”',
    });
    await userEvent.click(within(dueGroup).getByRole('button', { name: 'today' }));

    const addedTarget = (await screen.findAllByLabelText('Target')).at(-1) as HTMLElement;
    await userEvent.selectOptions(addedTarget, PROJECT_PRIVATE.slug);

    /* Formed from the local calendar day, the same way DueField itself
       builds "today" — never toISOString(), which can be a day off around
       midnight in a non-UTC time zone. */
    const today = new Date();
    const expectedDue = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    expect(latestPayload?.todos.at(-1)).toEqual({
      text: 'Book the venue for the offsite',
      scope: 'work',
      due: expectedDue,
      waitingFor: null,
      priority: 0,
      project: PROJECT_PRIVATE.slug,
    });
  });

  it('an added row can be removed without affecting the other rows', async () => {
    renderPanel();

    /* Edit the existing proposed row first — if an added row's `at` were
       wired to the same `editTodo` that patches `edits.todoEdits`, removing
       the added row below would corrupt or lose this edit (the bug this
       deliverable fixes). */
    const proposedText = (await screen.findAllByLabelText('Todo text'))[0] as HTMLElement;
    await userEvent.type(proposedText, '{Control>}a{/Control}Measure and report the load time');

    await userEvent.click(await screen.findByRole('button', { name: 'Add a todo' }));
    const addedText = (await screen.findAllByLabelText('Todo text')).at(-1) as HTMLElement;
    await userEvent.type(addedText, 'A todo to remove');

    expect(latestRows?.some((row) => row.kind === 'added')).toBe(true);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove this todo' }));

    expect(latestRows?.some((row) => row.kind === 'added')).toBe(false);
    expect(latestPayload?.todos.some((entry) => entry.text === 'A todo to remove')).toBe(false);
    expect(latestPayload?.todos[0]?.text).toBe('Measure and report the load time');
  });

  it('an added row renders no keep checkbox — its only removal mechanism is the remove button (finding 1)', async () => {
    renderPanel();
    /* Scoped to the todos fieldset, not the whole screen — the frontmatter
       fields below it (mood, energy) have their own keep checkboxes that
       are irrelevant here. The base suggestion renders one proposed todo and
       one waiting-on entry, each with a real keep/drop checkbox — two
       checkboxes before anything is added. */
    const todosGroup = await screen.findByRole('group', { name: 'Todos' });
    expect(within(todosGroup).getAllByRole('checkbox')).toHaveLength(2);

    await userEvent.click(within(todosGroup).getByRole('button', { name: 'Add a todo' }));

    /* The added row must not grow that count: a regression here (the
       checkbox reappearing on an added row) is exactly finding 1. */
    expect(await within(todosGroup).findAllByRole('checkbox')).toHaveLength(2);
  });

  it("clearing a proposed row's text drops it from the card, but a freshly added row's blank text still renders", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a todo' }));

    expect(await screen.findAllByLabelText('Todo text')).toHaveLength(3);

    const proposedText = (await screen.findAllByLabelText('Todo text'))[0] as HTMLElement;
    await userEvent.clear(proposedText);

    const remaining = await screen.findAllByLabelText('Todo text');
    expect(remaining).toHaveLength(2);
    expect(latestRows?.map((row) => row.kind)).toEqual(['waiting', 'added']);
  });
});
