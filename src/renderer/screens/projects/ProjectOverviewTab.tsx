/* The Overview tab: everything about a project you need after a break,
   except its sessions.

   The next step (the one line that carries the re-entry) first, then what's
   pending — waiting-on, todos. After that the status as prose and the filed
   notes. The work trail moved out with story 008: it lives on the Sessions
   tab, together with the sessions themselves, so no session data stays
   behind here.

   This component owns the project's write paths below the head — next step,
   waiting-on, todos. The head above it (title, status) belongs to
   `ProjectDetail`, which stays mounted across both tabs; the screen above
   that handles selection and filtering, so there is no chain of callbacks
   running through three layers. */

import { useState } from 'react';
import type { Project, Todo, VaultDoc, WaitingOn } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Checkbox } from '../../atoms/Checkbox';
import { ErrorState } from '../../components/ErrorState';
import { LlmMissing } from '../../components/LlmMissing';
import { Markdown } from '../../components/Markdown';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { TodoList } from '../../components/TodoList';
import { NextStepEditor } from '../../components/NextStepEditor';
import { WaitingList } from '../../components/WaitingList';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useTaskRouted } from '../../lib/queries/llm';
import { useProjectMutations } from '../../lib/queries/projects';
import type { StatusSuggestion } from '../../lib/queries/projects';
import { useProjectTodos, useTodoMutations } from '../../lib/queries/todos';
import { pushToast } from '../../lib/toast';
import { SuggestionCard } from './SuggestionCard';
import { SECTION_NOTES, SECTION_STATE, datedEntries, sectionOf } from './sections';
import { useTodoKeys } from './use-project-keys';

function openFile(path: string): void {
  void api.shell.openPath(path).catch(() => undefined);
}

/**
 * The `waiting_on` list as it stands in the file — including fields the app
 * doesn't interpret. This exact version is what an undo restores:
 * `project.waitingOn` only knows the four recognized fields, and an undo
 * that costs user content isn't an undo. Every entry is validated in the
 * main process (`checkProjectPatch`).
 */
function rawWaiting(doc: VaultDoc, fallback: readonly WaitingOn[]): WaitingOn[] {
  const raw = doc.frontmatter['waiting_on'];
  return Array.isArray(raw) ? (raw as WaitingOn[]) : [...fallback];
}

export interface ProjectOverviewTabProps {
  project: Project;
  doc: VaultDoc;
  now?: Date;
}

export function ProjectOverviewTab({ project, doc, now }: ProjectOverviewTabProps) {
  const t = useT();
  const todos = useProjectTodos(project.slug);
  const mutations = useProjectMutations();
  const todoMutations = useTodoMutations();
  const modelRouted = useTaskRouted('project-status');

  const [suggestion, setSuggestion] = useState<StatusSuggestion | null | undefined>(undefined);
  /* The state the suggestion was computed from. It's frozen when the
     suggestion arrives, not read at click time: a suggestion about a file
     that has since changed is stale, and writing it with the new hash would
     mean silently overwriting a change made elsewhere. */
  const [suggestBase, setSuggestBase] = useState<string | null>(null);
  const [stepSaved, setStepSaved] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [waitingBusy, setWaitingBusy] = useState<number | null>(null);
  const [focused, setFocused] = useState<Todo | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const saveStep = (next: string): void => {
    setStepSaved(false);
    mutations.patch.mutate(
      { slug: project.slug, patch: { next_step: next }, expectedHash: doc.hash },
      { onSuccess: () => setStepSaved(true) },
    );
  };

  /* The suggestion only disappears once it's in the file: if the write
     fails, it stays visible alongside the error. */
  const accept = (what: 'both' | 'step'): void => {
    if (suggestion === undefined || suggestion === null) return;
    mutations.patch.mutate(
      {
        slug: project.slug,
        patch:
          what === 'both'
            ? { status: suggestion.status, next_step: suggestion.nextStep }
            : { next_step: suggestion.nextStep },
        expectedHash: suggestBase ?? doc.hash,
      },
      {
        onSuccess: () => {
          setSuggestion(undefined);
          setSuggestBase(null);
        },
      },
    );
  };

  /* "Resolved" writes `resolved: true`, the entry disappears from the list —
     without a message that would look like deletion. So the message says
     what's now in the file, and takes it back on request (same pattern as
     the dismiss toast). */
  const resolveWaiting = (index: number): void => {
    const who = project.waitingOn[index]?.who ?? '';
    const before = rawWaiting(doc, project.waitingOn);
    setWaitingBusy(index);
    mutations.resolveWaiting.mutate(
      { slug: project.slug, index },
      {
        onSuccess: () =>
          pushToast('success', {
            message: 'project.waiting.resolved',
            values: { who },
            description: 'project.waiting.resolvedWhere',
            action: {
              label: 'common.undo',
              run: () =>
                mutations.patch.mutate({ slug: project.slug, patch: { waiting_on: before } }),
            },
          }),
      },
    );
  };

  /* Only the row that currently has focus. Without focus, nothing happens:
     an `x` that checks off some random todo would be worse than an `x` that
     does nothing. */
  const toggleFocused = (): void => {
    if (focused === null) return;
    todoMutations.toggle.mutate(focused.id);
  };

  useTodoKeys({ compose: () => setComposeOpen(true), toggle: toggleFocused });

  const state = sectionOf(doc.body, SECTION_STATE);
  const notes = sectionOf(doc.body, SECTION_NOTES);
  const noteCount = datedEntries(notes);
  const openWaiting = project.waitingOn.filter((entry) => entry.resolved !== true).length;
  const failed =
    mutations.patch.error ??
    mutations.resolveWaiting.error ??
    mutations.suggest.error ??
    todoMutations.toggle.error ??
    todoMutations.create.error ??
    todoMutations.update.error ??
    todoMutations.reorder.error ??
    null;
  const allTodos = todos.data ?? [];
  const shownTodos = showDone ? allTodos : allTodos.filter((todo) => todo.state === 'open');

  /* Reordering the visible rows still sends every file row. Completed todos
     keep their hidden slots, so filtering cannot turn a drag into a conflict. */
  const reorderShown = (ids: string[]): void => {
    const visible = new Set(shownTodos.map((todo) => todo.id));
    let nextVisible = 0;
    const allIds = allTodos.map((todo) =>
      visible.has(todo.id) ? (ids[nextVisible++] ?? todo.id) : todo.id,
    );
    todoMutations.reorder.mutate({ ids: allIds });
  };

  return (
    <>
      {failed === null ? null : (
        <ErrorState error={failed} variant="secondary" subject={project.title} scrollIntoView />
      )}

      <NextStepEditor
        value={project.nextStep}
        busy={mutations.patch.isPending}
        saved={stepSaved}
        onSave={saveStep}
        suggestBusy={mutations.suggest.isPending}
        onSuggest={() =>
          mutations.suggest.mutate(project.slug, {
            onSuccess: (result) => {
              setSuggestion(result);
              setSuggestBase(doc.hash);
            },
          })
        }
      />
      {modelRouted === false && suggestion !== undefined ? (
        <LlmMissing task="project-status" tone="note" />
      ) : null}
      {suggestion === null ? <p className="sb-note-line">{t('project.suggest.none')}</p> : null}
      {suggestion === undefined || suggestion === null ? null : (
        <SuggestionCard
          suggestion={suggestion}
          current={project.status}
          busy={mutations.patch.isPending}
          onAccept={accept}
          onReject={() => {
            setSuggestion(undefined);
            setSuggestBase(null);
          }}
        />
      )}

      <Panel
        title={t('project.waiting.title')}
        meta={openWaiting === 0 ? undefined : String(openWaiting)}
      >
        <WaitingList
          entries={project.waitingOn}
          busyIndex={mutations.resolveWaiting.isPending ? waitingBusy : null}
          onResolve={resolveWaiting}
          {...(now === undefined ? {} : { now })}
        />
      </Panel>

      <Panel
        title={t('project.todos.title')}
        meta={t('todos.openOf', { open: project.openTodoCount, total: project.todoCount })}
        action={
          <Checkbox
            label={t('todos.showDone')}
            checked={showDone}
            onChange={(event) => setShowDone(event.target.checked)}
          />
        }
      >
        {todos.isPending ? (
          <Skeleton lines={3} height={30} />
        ) : (
          <TodoList
            todos={shownTodos}
            emptyText={
              allTodos.length > 0 && !showDone ? t('todos.scopeEmpty') : t('project.todos.empty')
            }
            activeId={focused?.id ?? null}
            busyId={
              todoMutations.toggle.isPending
                ? (todoMutations.toggle.variables ?? null)
                : todoMutations.update.isPending
                  ? (todoMutations.update.variables?.id ?? null)
                  : null
            }
            createBusy={todoMutations.create.isPending}
            composerOpen={composeOpen}
            onComposerChange={setComposeOpen}
            onFocusTodo={setFocused}
            onToggle={(todo) => todoMutations.toggle.mutate(todo.id)}
            onEdit={(todo, values) => todoMutations.update.mutateAsync({ id: todo.id, ...values })}
            onReorder={reorderShown}
            onCreate={(text, due, priority) =>
              todoMutations.create.mutateAsync({
                text,
                scope: project.scope,
                project: project.slug,
                due,
                priority,
              })
            }
            {...(now === undefined ? {} : { now })}
          />
        )}
      </Panel>

      <Panel
        title={t('project.state.title')}
        action={
          <Button variant="ghost" size="sm" icon="external-link" onClick={() => openFile(doc.path)}>
            {t('common.openInEditor')}
          </Button>
        }
      >
        {state.length === 0 ? (
          <p className="sb-panel-empty">{t('project.state.empty')}</p>
        ) : (
          <Markdown text={state} onOpenPath={openFile} />
        )}
      </Panel>

      <Panel
        title={t('project.notes.title')}
        meta={noteCount === 0 ? undefined : String(noteCount)}
        action={
          notes.length === 0 ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              icon={notesOpen ? 'chevron-up' : 'chevron-down'}
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen(!notesOpen)}
            >
              {t(notesOpen ? 'project.notes.hide' : 'project.notes.show')}
            </Button>
          )
        }
      >
        {notes.length === 0 ? (
          <p className="sb-panel-empty">{t('project.notes.empty')}</p>
        ) : notesOpen ? (
          <Markdown text={notes} onOpenPath={openFile} />
        ) : null}
      </Panel>
    </>
  );
}
