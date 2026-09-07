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
import { Checkbox } from '../../atoms/Checkbox';
import { DayList, dayRows, selectableDates, todayIso } from '../../components/DayList';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { MonthCalendar } from '../../components/MonthCalendar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import {
  clear as clearProposal,
  emptySuggestion,
  set as setProposal,
  useCloseProposal,
} from '../../lib/close-proposal';
import { plural } from '../../lib/format';
import { setOpenOnly, useOpenOnly } from '../../lib/journal-filter';
import { countOpenDays } from '../../lib/journal-open';
import { clearStream, useLlmStream } from '../../lib/llm-stream';
import { monthOf } from '../../lib/month-calendar';
import { useReminders } from '../../lib/queries/dashboard';
import { useJournalDays, useProjects } from '../../lib/queries/data';
import {
  useCoachRoute,
  useInterviewMutations,
  useJournalDay,
  useJournalMutations,
  useJournalSettings,
} from '../../lib/queries/journal';
import { CloseProposal } from './CloseProposal';
import { CoachComposer } from './CoachComposer';
import { DayEntry } from './DayEntry';
import type { DayVersion } from './DayText';
import { EntryStream } from './EntryStream';
import { FactsSection } from './FactsSection';
import type { AppliedClose } from './FactsSection';
import { InterviewDialog } from './InterviewDialog';
import { LooseEndRow } from './LooseEndRow';
import { useJournalKeys } from './use-journal-keys';

/** A talk turn in progress: marker and one's own message. */
interface Pending {
  threadId: string;
  messageId: string;
  message: string;
}

/** Whether the month calendar (010, D1/D2) is folded away — `sessionStorage`,
    not `localStorage`: the collapse is a within-session convenience, not a
    setting. A fresh app start therefore always shows the calendar expanded,
    the same default `MonthCalendar`'s own tests assume. */
const CALENDAR_COLLAPSED_KEY = 'sb-journal-calendar-collapsed';

function readCalendarCollapsed(): boolean {
  try {
    return window.sessionStorage.getItem(CALENDAR_COLLAPSED_KEY) === 'true';
  } catch {
    /* Without storage the toggle still works, it just forgets on remount. */
    return false;
  }
}

function writeCalendarCollapsed(collapsed: boolean): void {
  try {
    window.sessionStorage.setItem(CALENDAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    return;
  }
}

export function JournalScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const date = params.get('d') ?? today;

  const days = useJournalDays();
  const view = useJournalDay(date);
  /* `journal:answerLooseEnd` always writes into *today*'s file (see
     `loose-end-answer.ts`), even though a loose-end row is rendered on the day
     the announcement was made — always a day before today. The concurrency
     guard therefore has to carry *today*'s hash, not the viewed day's — the
     same reasoning `InterviewDialog.tsx` already documents for its own
     `expectedHash`. When `date` already is today this is the same cache entry
     as `view` above, so no second fetch. */
  const todayView = useJournalDay(today);
  const projects = useProjects();
  const settings = useJournalSettings();
  const route = useCoachRoute();
  const mutations = useJournalMutations(date);
  /* Loose-end answers go through the interview's own channel (020, D5),
     never through the day's regular mutations — the same
     `journal:answerLooseEnd` `InterviewDialog.tsx` already calls, reused
     here rather than a second write path for the same fact (022, D6). */
  const interview = useInterviewMutations(date);

  /* The stance: defaults from settings, switchable per conversation. */
  const [mode, setMode] = useState<CoachMode | null>(null);
  const stance: CoachMode = mode ?? settings?.mode ?? 'listen';

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [textSaved, setTextSaved] = useState(false);
  /* What the last day-text save wrote, the day it was written for, and the
     file version it was written on top of. It lives here rather than in
     `DayText`, because only the mutation result carries the hash the write
     produced — and the field needs exactly that pair as long as the refetch it
     triggered hasn't landed (see `written` in `DayText.tsx`). `before` is what
     bounds that window: see the release below. */
  const [written, setWritten] = useState<
    (DayVersion & { date: string; before: string | undefined }) | null
  >(null);
  const [moodSaved, setMoodSaved] = useState(false);
  const [applied, setApplied] = useState<AppliedClose | null>(null);
  const [interviewOpen, setInterviewOpen] = useState(false);

  /* 018: the open day-close proposal no longer lives in this component. It
     sits in `lib/close-proposal.ts`, keyed by date — which is what lets it
     survive leaving the screen and coming back (AC 3) and what keeps a
     proposal for one day from ever showing up on another. Read here for
     exactly two decisions: whether the panel renders, and whether the "close
     the day" trigger still does. */
  const proposal = useCloseProposal(date);

  /* 010, D2: the shown month is the calendar's own state, seeded from the
     selected date once, then left alone — paging the grid must not get
     overridden by every render. A jump that lands outside the shown month
     (a list click, a deep link) resyncs it. Adjusted during render rather
     than in an effect (React's own recommended pattern for "state derived
     from a prop that changed"): `syncedDate` is the guard that makes this
     fire only on an actual `date` change, not on every render, which is what
     keeps `onMonth`'s own paging from being immediately undone here. */
  const [month, setMonth] = useState(() => monthOf(date));
  const [syncedDate, setSyncedDate] = useState(date);
  if (date !== syncedDate) {
    setSyncedDate(date);
    const next = monthOf(date);
    if (next !== month) setMonth(next);
  }
  const [calendarCollapsed, setCalendarCollapsed] = useState(readCalendarCollapsed);

  /* 009, D5: the filter is session state, not a setting — `useOpenOnly` keeps
     it across a remount of this screen but not across a restart. It feeds
     `dayRows`, and `selectableDates` therefore follows it for free: the arrow
     keys walk exactly the rows that are on screen, with no separate rule. */
  const openOnly = useOpenOnly();
  const rows = useMemo(
    () => dayRows(days.data ?? [], today, { openOnly }),
    [days.data, today, openOnly],
  );
  const dates = useMemo(() => selectableDates(rows), [rows]);
  const openCount = useMemo(() => countOpenDays(days.data ?? [], today), [days.data, today]);
  /* 070, D4: the calendar badge. `Reminder.date` for an `upcoming-mention`
     reminder is already the day the mention points AT (`refDate`), set by
     `fromUpcomingMentions()` — this screen only has to filter and collect the
     dates, `MonthCalendar`/`monthCells` do the rest. */
  const reminders = useReminders();
  const upcomingMentions = useMemo(
    () =>
      new Set(
        (reminders.data ?? [])
          .filter((reminder) => reminder.source === 'upcoming-mention')
          .map((reminder) => reminder.date),
      ),
    [reminders.data],
  );
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

  /* The written version stands in for the day query only while that query
     still reports the version the save was written on top of. Any newer result
     is authoritative — our own write, but just as much a coach turn, a mood
     click or an editor outside — even when its hash isn't the one the save
     returned: a different hash at that point is real, externally caused
     information, and the field's conflict machinery is exactly what has to see
     it. Waiting for the save's own hash instead would pin `written` for good
     on any day whose file changed again in between, and every later save would
     go out with a hash the file no longer has. A day switch ends it just as
     plainly.

     Adjusted during render like `month` above (React's own pattern for state
     that follows a changed input), not in an effect: an effect would leave one
     committed render in which the field is based on a version the file has
     already moved past. */
  if (written !== null && (written.date !== date || view.data?.doc.hash !== written.before)) {
    setWritten(null);
  }

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

  /* `journal:setClosed` itself (009, D3/D6) — the same hash guard as
     `foldDay`/`applyClose`: without a loaded day there is nothing to patch,
     so `expectedHash` is only added once one exists. 049/D1 removed the
     manual "mark as finished" switch, so this is only ever called with
     `false`, from the reopen action. */
  const setClosed = (closed: boolean): void => {
    mutations.setClosed.mutate({
      date,
      closed,
      ...(view.data === null || view.data === undefined
        ? {}
        : { expectedHash: view.data.doc.hash }),
    });
  };

  /* Runs the close-out and leaves its result in the store — this is both the
     first run and "run again" (018): `set` replaces the whole entry, edits
     included, so a second run is a fresh proposal and never a merge of two.
     `date` is captured here, at click time, and the store is keyed with the
     same value the request was made for — a day switch mid-run therefore
     files the result under the day it was actually computed for, not under
     whatever day is on screen when it lands.
     A `null` result means the day's file exists but carries no (or blank)
     text — there was nothing to run extraction on. With the manual header
     switch gone (049, D1/D2) this trigger is the only way to close such a
     day, so a silent no-op here would be a dead end: the panel still opens,
     with `emptySuggestion` standing in for the real find, honestly saying
     nothing could be pulled out while still letting "apply" close the day
     (049, D4). A stale error from an earlier apply is reset, so the fresh
     proposal doesn't inherit it. */
  const closeDay = (): void => {
    setApplied(null);
    mutations.applyClose.reset();
    mutations.close.mutate(date, {
      onSuccess: (result) => {
        if (result !== null) {
          setProposal(date, result);
          return;
        }
        const path = view.data?.doc.path;
        /* The trigger is disabled without a loaded day (see `closeAction`
           below), so this only guards a render that hasn't caught up yet. */
        if (path === undefined) return;
        setProposal(date, emptySuggestion(date, path, t('journal.close.empty')));
      },
    });
  };

  /* The one write path of this story — unchanged in payload and in hash guard
     (011/009 pattern): without a loaded day there is nothing to guard against,
     so `expectedHash` is only added once one exists, and a stale hash surfaces
     as `conflict` instead of overwriting the user's own edit.

     Why the hash provably belongs to the day being applied, now that the
     proposal outlives the component: `date` is this render's single source for
     the day, `view` is `useJournalDay(date)` from the same render, and it
     carries no previous day's data across a key change (no `placeholderData`
     in `queries/journal.ts`) — so `view.data` is either this day's document or
     nothing at all. On top of that the panel is only rendered for the shown
     day, so no proposal for another date can even reach this function.

     On success the store entry for this day is cleared — the proposal has
     become a written fact, and `applied` takes over as the affordance
     (`FactsSection`'s undo strip, untouched by this story). */
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
          clearProposal(date);
          setApplied(result);
        },
      },
    );
  };

  /* Discard: nothing is written, the proposal is simply gone. The error of a
     previously failed apply goes with it — it belonged to that panel. */
  const discardProposal = (): void => {
    mutations.applyClose.reset();
    clearProposal(date);
  };

  const failed =
    mutations.coach.error ??
    mutations.setMood.error ??
    mutations.setClosed.error ??
    mutations.close.error ??
    /* `applyClose.error` deliberately isn't in this chain any more (018): the
       proposal panel shows it itself, right next to the "apply" button that
       caused it. While it was in a dialog, the screen-level card sat hidden
       behind the modal; without the modal both would show the same error
       twice and both would call `scrollIntoView` on it. The panel can't be
       gone while the error is live — a successful apply has no error, and
       discard/run again reset the mutation. */
    mutations.undo.error ??
    mutations.foldDay.error ??
    view.error ??
    days.error ??
    null;

  /* One button, one spot, in every window width (047, D3): right next to
     the facts (`DayEntry.tsx`), below the day's own text. The action stays
     secondary either way — this screen's one teal point is the stream.

     018, decision 3: while a proposal for the shown day is open, the spot
     goes to the proposal instead. Two triggers for the same run is one too
     many, and the panel's "run again" is the one with the context.

     049, D2: the manual header switch that used to be the second way to
     close a day is gone (D1); this trigger must not become a second one on
     a day that's already closed. A closed day shows the badge + reopen
     ghost in the header (`DayEntry.tsx`) instead. */
  const closeAction =
    proposal !== undefined ||
    (view.data !== null && view.data !== undefined && view.data.day.closed !== null) ? undefined : (
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

  /* 012, D6: the entry point on the day itself. 047/D4: always a small
     secondary action — the screen's one teal accent belongs to the day
     field's own save action now (`DayText.tsx`), not to this button. */
  const interviewAction = (
    <Button
      variant="secondary"
      size="sm"
      icon="message-square"
      onClick={() => setInterviewOpen(true)}
    >
      {t('journal.interview.start')}
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
          <MonthCalendar
            days={days.data ?? []}
            today={today}
            selected={date}
            onSelect={(next) => select(next)}
            month={month}
            onMonth={setMonth}
            upcoming={upcomingMentions}
            collapsed={calendarCollapsed}
            onToggleCollapse={() => {
              setCalendarCollapsed((previous) => {
                const next = !previous;
                writeCalendarCollapsed(next);
                return next;
              });
            }}
          />
          <p className="sb-journal-count sb-mono">
            {openOnly
              ? plural(openCount, 'journal.filter.countOne', 'journal.filter.count')
              : t('journal.list.count', { count: (days.data ?? []).length })}
          </p>
          <Checkbox
            className="sb-journal-filter"
            label={t('journal.filter.openOnly')}
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
          />
          <DayList
            rows={rows}
            selected={date}
            onSelect={(next) => select(next)}
            rowRef={(day, element) => {
              if (element === null) listRows.current.delete(day);
              else listRows.current.set(day, element);
            }}
          />
          {/* Filtered down to nothing: the list itself is never empty — today
              is always in it — so the honest statement goes below it instead
              of leaving the filter looking broken. */}
          {openOnly && openCount === 0 ? (
            <p className="sb-panel-empty sb-journal-none">{t('journal.filter.none')}</p>
          ) : null}
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
                /* Only for the day it was written for: `written` outlives a
                   day switch by a render, and another day's version must
                   never stand in for this one's file. */
                written: written?.date === date ? written : null,
                onSave: (value, expectedHash) => {
                  /* The version the query reports right now, read at click
                     time: it is what tells "the refetch hasn't landed yet"
                     from "the file has moved on" once the write returns. */
                  const before = view.data?.doc.hash;
                  mutations.setDay.mutate(
                    { date, text: value, ...(expectedHash === undefined ? {} : { expectedHash }) },
                    {
                      onSuccess: (result) => {
                        setTextSaved(true);
                        /* The text that went out, with the hash it produced —
                           the field's basis until the refetch lands. */
                        setWritten({ date, text: value, hash: result.hash, before });
                      },
                    },
                  );
                },
                onReload: () => {
                  mutations.setDay.reset();
                  /* Asking for the file's version explicitly gives up our own:
                     what comes back is what the field has to show. */
                  setWritten(null);
                  void view.refetch();
                },
                onReset: () => {
                  mutations.setDay.reset();
                  setTextSaved(false);
                },
              }}
              fieldRef={field}
              onOpenProject={(slug) => void navigate(`/projects?p=${encodeURIComponent(slug)}`)}
              finish={{
                busy: mutations.setClosed.isPending,
                onReopen: () => setClosed(false),
              }}
              interviewAction={interviewAction}
              closeAction={closeAction}
              legacy={{
                busy: mutations.foldDay.isPending,
                error: mutations.foldDay.error,
                onFold: foldDay,
              }}
              dialogue={
                <>
                  {/* One row per loose end announced on this day (022, D6;
                      069, D4) — above the stream, since it belongs to the day
                      the announcement was made, not to the conversation that
                      followed. `looseEnds` carries both still-open items
                      (`openLooseEnds()`, 020 D5) and resolved ones
                      (`dayLooseEnds()`, 069 D2/D3); `LooseEndRow` branches on
                      `resolution` to render the right shape, so no "is this
                      open" check lives here. */}
                  {(view.data?.looseEnds ?? []).map((looseEnd) => (
                    <LooseEndRow
                      key={looseEnd.id}
                      looseEnd={looseEnd}
                      busy={
                        interview.answerLooseEnd.isPending &&
                        interview.answerLooseEnd.variables?.id === looseEnd.id
                      }
                      error={
                        interview.answerLooseEnd.variables?.id === looseEnd.id
                          ? interview.answerLooseEnd.error
                          : undefined
                      }
                      onAnswer={(text) =>
                        interview.answerLooseEnd.mutate({
                          id: looseEnd.id,
                          day: looseEnd.day,
                          text,
                          expectedHash: todayView.data?.doc.hash,
                        })
                      }
                    />
                  ))}
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
                </>
              }
              proposal={
                proposal === undefined ? undefined : (
                  <CloseProposal
                    date={date}
                    projects={projects.data ?? []}
                    /* Both runs make the panel busy: while a re-run is in
                       flight, applying the proposal that is about to be
                       replaced must not be possible. */
                    busy={mutations.applyClose.isPending || mutations.close.isPending}
                    error={mutations.applyClose.error}
                    onApply={apply}
                    onDiscard={discardProposal}
                    onRunAgain={closeDay}
                  />
                )
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
                />
              }
            />
          )}
        </div>
      </div>

      {/* Unmounted while closed, per the remount-per-opening contract
          `InterviewDialog.tsx`'s own header comment asks callers to honour —
          each open is therefore a fresh instance, `session` and all. Closing
          also returns focus to the day's own field — the interview is a
          starting aid, and the acceptance is that walking out of it drops you
          straight back into writing, not onto some unfocused part of the page. */}
      {interviewOpen ? (
        <InterviewDialog
          open={interviewOpen}
          date={date}
          onClose={() => {
            setInterviewOpen(false);
            field.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
