/* Journal — the screen where the app must not be useful, but human.

   Layout: on the left a narrow list of days (with named gaps, "Today" on
   top), on the right the day — header, the unified entry stream, facts.

   The four states from ARCHITECTURE.md, all explicit:
   - **Empty**: no entry at all in the vault → two sentences about what's
     forming here, and a field ready to go. Today without an entry isn't an
     empty state, but the question "How was the day?" with a focused field.
   - **No model**: the entry can still be written, the talk honestly says
     it can't respond without a model — and in "analyze" mode shows the
     earlier spots it actually found.
   - **Error**: whatever goes wrong while writing, closing out, or undoing
     shows up as a card, never silently.
   - **No vault**: handled by the shell (`App.tsx`).

   The open day lives in the address (`#/journal?d=2026-08-10`): that way a
   link from elsewhere — dashboard, command palette, a coach citation —
   leads straight there.

   The stream doesn't run through TanStack Query: the chunks land in the
   buffer from `lib/llm-stream.ts`, and the main process reloads the day via
   `event:vault-changed` as soon as the turn is on disk as a file. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CoachMode, ProposedTodo } from '@shared/types';
import type { JournalCloseSuggestion } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { DayList, dayRows, selectableDates, todayIso } from '../../components/DayList';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { clearStream, useLlmStream } from '../../lib/llm-stream';
import { useJournalDays, useProjects } from '../../lib/queries/data';
import {
  useCoachRoute,
  useJournalDay,
  useJournalMutations,
  useJournalSettings,
} from '../../lib/queries/journal';
import { CloseDialog } from './CloseDialog';
import { CoachComposer } from './CoachComposer';
import { DayEntry } from './DayEntry';
import { EntryStream } from './EntryStream';
import { FactsSection } from './FactsSection';
import type { AppliedClose } from './FactsSection';
import { useJournalKeys } from './use-journal-keys';

/** A talk turn in progress: marker and one's own message. */
interface Pending {
  threadId: string;
  messageId: string;
  message: string;
}

/** Same threshold as `journal.css` (`@media (max-width: 1200px)`) — the only
    place where this screen itself needs to know which of the two designs
    currently applies: "close the day" sits in the narrow window next to the
    facts (`DayEntry.tsx`), in the wide window next to the send button, never
    in both places at once (see `closeAction` below). Same pattern as
    `useGridColumns` in the dashboard (`screens/dashboard/TileGrid.tsx`). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth <= 1200,
  );
  useEffect(() => {
    const update = (): void => setNarrow(window.innerWidth <= 1200);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return narrow;
}

export function JournalScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const date = params.get('d') ?? today;

  const days = useJournalDays();
  const view = useJournalDay(date);
  const projects = useProjects();
  const settings = useJournalSettings();
  const route = useCoachRoute();
  const mutations = useJournalMutations(date);
  const narrow = useNarrow();

  /* The stance: defaults from settings, switchable per conversation. */
  const [mode, setMode] = useState<CoachMode | null>(null);
  const stance: CoachMode = mode ?? settings?.mode ?? 'listen';

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [textSaved, setTextSaved] = useState(false);
  const [moodSaved, setMoodSaved] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<JournalCloseSuggestion | null>(null);
  const [applied, setApplied] = useState<AppliedClose | null>(null);

  const rows = useMemo(() => dayRows(days.data ?? [], today), [days.data, today]);
  const dates = useMemo(() => selectableDates(rows), [rows]);
  const stream = useLlmStream(pending?.messageId ?? null);
  const listRows = useRef(new Map<string, HTMLButtonElement>());
  const field = useRef<HTMLTextAreaElement>(null);

  const select = (next: string, focus = false): void => {
    setParams(next === today ? {} : { d: next }, { replace: true });
    /* A day switch ends the view of the running turn: it belongs to the
       other day and lives in its file there. */
    setPending(null);
    setApplied(null);
    setTextSaved(false);
    if (focus) listRows.current.get(next)?.focus();
  };

  useJournalKeys({ dates, current: date, select, onMode: setMode });

  const busy = pending !== null && !stream.done;

  /* A fresh day (no file yet) puts the cursor straight into the one field —
     the same "ready to type into immediately" promise the old DayText
     inviting field made (011, D8 removed it) now lives here instead. An
     existing day never steals focus this way: only the transition into
     `view.data === null` does. */
  useEffect(() => {
    if (view.data === null) field.current?.focus();
  }, [date, view.data]);

  /* While an answer is running, no second turn gets sent: two writes to the
     same file would race each other, and one turn would be lost. The
     composer shows "Cancel" during this time; the Enter key needs the same
     lock. An append races the same way against itself (two clicks before the
     first write lands), guarded the same way even though it never streams. */
  const say = (): void => {
    const message = draft.trim();
    if (message.length === 0 || busy || mutations.coach.isPending || mutations.append.isPending) {
      return;
    }
    if (stance === 'listen') {
      /* Listen never touches the gateway: journal:append is the only path,
         which makes "no model was asked" verifiable at the IPC boundary
         rather than just in a prompt (011, D1). No streaming UI exists for
         it — the paragraph shows up once the day refetches. */
      mutations.append.mutate({ date, text: message }, { onSuccess: () => setDraft('') });
      return;
    }
    if (pending !== null) clearStream(pending.messageId);
    mutations.coach.mutate(
      { mode: stance, date, message, useHistory: true },
      {
        onSuccess: (marker) => {
          setDraft('');
          setPending({ ...marker, message });
        },
      },
    );
  };

  /* "Move the conversation into the entry" (011, D9) — hash-guarded exactly
     like `text.onSave`: without a loaded day there is nothing to fold, so
     `expectedHash` is only added once one exists. */
  const foldDay = (): void => {
    mutations.foldDay.mutate({
      date,
      ...(view.data === null || view.data === undefined
        ? {}
        : { expectedHash: view.data.doc.hash }),
    });
  };

  const closeDay = (): void => {
    setApplied(null);
    mutations.close.mutate(date, {
      onSuccess: (result) => {
        setSuggestion(result);
        setCloseOpen(true);
      },
    });
  };

  const apply = (input: {
    todos: ProposedTodo[];
    frontmatter: JournalCloseSuggestion['frontmatter'];
  }): void => {
    mutations.applyClose.mutate(
      {
        date,
        todos: input.todos,
        frontmatter: input.frontmatter,
        ...(view.data === null || view.data === undefined
          ? {}
          : { expectedHash: view.data.doc.hash }),
      },
      {
        onSuccess: (result) => {
          setCloseOpen(false);
          setApplied(result);
        },
      },
    );
  };

  const failed =
    mutations.coach.error ??
    mutations.setMood.error ??
    mutations.close.error ??
    mutations.applyClose.error ??
    mutations.undo.error ??
    mutations.foldDay.error ??
    view.error ??
    days.error ??
    null;

  /* One button, two possible spots — never both at once. In the wide
     window it sits next to the composer, anchored at the bottom edge of
     the detail column (`footerAction`), so neither of the two actions
     concerning the day slides below the visible edge. In the narrow window
     it instead sits right next to the facts (`DayEntry.tsx`) — there is no
     tab to place it in any more (011, D7 removed it). `narrow` decides
     which of the two paths actually gets the button; the other stays
     `undefined`. The action remains secondary either way — this screen's
     one teal point is the stream, and in the dialog, its "apply". */
  const closeAction = (
    <Button
      variant="secondary"
      size="sm"
      icon="circle-check-big"
      loading={mutations.close.isPending}
      disabled={view.data === null || view.data === undefined}
      onClick={closeDay}
    >
      {t('journal.close.action')}
    </Button>
  );

  const header = (
    <ScreenHeader overline={t('screen.journal.overline')} title={t('screen.journal.title')} />
  );

  /* No entry at all in the vault and none for today either: then the
     screen explains in two sentences what's forming here — and the day
     below it is the beginning. */
  const nothingYet = (days.data ?? []).length === 0 && view.data === null;

  if (days.isPending || days.data === undefined) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        <Skeleton lines={6} height={44} />
      </div>
    );
  }

  return (
    <div className="sb-screen sb-screen--wide sb-screen--fill">
      {header}
      {failed === null ? null : (
        <ErrorState error={failed} variant="secondary" subject={date} scrollIntoView />
      )}

      <div className="sb-journal">
        <aside className="sb-journal-side" aria-label={t('journal.list.title')}>
          <p className="sb-journal-count sb-mono">
            {t('journal.list.count', { count: (days.data ?? []).length })}
          </p>
          <DayList
            rows={rows}
            selected={date}
            onSelect={(next) => select(next)}
            rowRef={(day, element) => {
              if (element === null) listRows.current.delete(day);
              else listRows.current.set(day, element);
            }}
          />
          <p className="sb-journal-keys">{t('journal.keys')}</p>
        </aside>

        <div className="sb-journal-main">
          {nothingYet ? (
            <EmptyState
              icon="notebook-pen"
              title={t('screen.journal.empty.title')}
              body={t('screen.journal.empty.body')}
            />
          ) : null}

          {view.isPending && view.data === undefined ? (
            <Skeleton lines={5} height={32} />
          ) : (
            <DayEntry
              key={date}
              date={date}
              view={view.data ?? null}
              projects={projects.data ?? []}
              mood={{
                busy: mutations.setMood.isPending,
                saved: moodSaved,
                onPick: (kind, level) => {
                  setMoodSaved(false);
                  /* Without a frozen hash: a field patch doesn't rewrite any
                     user line, and a conflict here would be pure friction
                     (same trade-off as with a project's next step). */
                  mutations.setMood.mutate(
                    { date, ...(kind === 'mood' ? { mood: level } : { energy: level }) },
                    { onSuccess: () => setMoodSaved(true) },
                  );
                },
              }}
              text={{
                busy: mutations.setDay.isPending || mutations.append.isPending,
                error: mutations.setDay.error,
                attemptedAt: mutations.setDay.submittedAt,
                saved: textSaved,
                onSave: (value, expectedHash) => {
                  mutations.setDay.mutate(
                    { date, text: value, ...(expectedHash === undefined ? {} : { expectedHash }) },
                    { onSuccess: () => setTextSaved(true) },
                  );
                },
                onReload: () => {
                  mutations.setDay.reset();
                  void view.refetch();
                },
                onReset: () => {
                  mutations.setDay.reset();
                  setTextSaved(false);
                },
              }}
              onOpenProject={(slug) => void navigate(`/projects?p=${encodeURIComponent(slug)}`)}
              closeAction={narrow ? closeAction : undefined}
              legacy={{
                busy: mutations.foldDay.isPending,
                error: mutations.foldDay.error,
                onFold: foldDay,
              }}
              dialogue={
                <EntryStream
                  stream={view.data?.stream ?? []}
                  live={
                    pending === null
                      ? null
                      : {
                          message: pending.message,
                          text: stream.text,
                          done: stream.done,
                          error: stream.error,
                          citations: stream.citations,
                        }
                  }
                  onOpenDay={(day) => select(day)}
                />
              }
              facts={
                <FactsSection
                  facts={view.data?.facts ?? ''}
                  applied={applied}
                  undoBusy={mutations.undo.isPending}
                  onUndo={() => {
                    if (applied === null) return;
                    mutations.undo.mutate(applied.undo, { onSuccess: () => setApplied(null) });
                  }}
                />
              }
              composer={
                <CoachComposer
                  draft={draft}
                  onDraft={setDraft}
                  onSend={say}
                  onCancel={() => {
                    if (pending !== null) mutations.abort.mutate(pending.messageId);
                  }}
                  busy={busy}
                  mode={stance}
                  onMode={setMode}
                  route={route}
                  fieldRef={field}
                  footerAction={narrow ? undefined : closeAction}
                />
              }
            />
          )}
        </div>
      </div>

      {closeOpen && suggestion !== null ? (
        <CloseDialog
          key={suggestion.proposal.createdAt}
          open={closeOpen}
          suggestion={suggestion}
          projects={projects.data ?? []}
          busy={mutations.applyClose.isPending}
          error={mutations.applyClose.error}
          onClose={() => {
            mutations.applyClose.reset();
            setCloseOpen(false);
          }}
          onApply={apply}
        />
      ) : null}
    </div>
  );
}
