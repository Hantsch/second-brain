/* The day: a header with the spelled-out date, people and projects, mood and
 * energy — below that the file's sections, all in one column, in the order
 * the day is actually lived (047): head, chips, mood, energy, interview,
 * day text, close, facts, legacy fold, history, coach composer.
 *
 * The date is spelled out because it's the heading of a day, not a sort key.
 * The path next to it in mono: the file is the source of truth, and it's
 * reachable from here.
 *
 * Mood and energy save immediately (no form), people and projects come from
 * the frontmatter — projects lead there with one click. Nothing is invented:
 * what isn't in the entry doesn't appear here either.
 *
 * There is no tab split any more (011, D7): the day used to carry two tabs,
 * "Day" and "Talk", in the narrow window, because two earlier designs failed
 * at forcing both into a single scrolling column (see the history in
 * `styles/app/journal.css`). The story turns the day into one chronological
 * stream instead, so a "which half am I looking at" question no longer
 * applies — both halves render, stacked, in every window width, and the
 * narrow window scrolls the whole column like the wide one already did.
 */

import type { ReactNode, RefObject } from 'react';
import type { JournalDayView } from '@shared/ipc';
import type { Project } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { dateOf, todayIso } from '../../components/DayList';
import { MoodPicker } from '../../components/MoodPicker';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, locale } from '../../lib/format';
import { DayText, type DayVersion } from './DayText';
import { LegacyConversation } from './LegacyConversation';

export interface DayEntryProps {
  date: string;
  /** The day, or `null`: then the file doesn't exist yet. */
  view: JournalDayView | null;
  /** For the titles of the project chips. */
  projects: readonly Project[];
  mood: { busy: boolean; saved: boolean; onPick: (kind: 'mood' | 'energy', level: number) => void };
  text: {
    busy: boolean;
    error: unknown;
    attemptedAt: number;
    saved: boolean;
    /** What the last save wrote, for as long as the day query still reports
        the version it was written on top of — passed straight through to
        `DayText`'s own `written`, which documents why the field must not fall
        back to `view` in that window, and why the window has to end. */
    written: DayVersion | null;
    onSave: (value: string, expectedHash: string | undefined) => void;
    onReload: () => void;
    onReset: () => void;
  };
  /** Lets the screen put the cursor in the day's own field (047/D4) — a fresh
      day autofocuses it, and closing the interview dialog returns focus to
      it. Passed straight through to `DayText`'s own `fieldRef`. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  onOpenProject: (slug: string) => void;
  /** The manual "mark as finished" / "reopen" switch (009, D3/D6) — a plain
      on/off field on the day, separate from the day close-out below
      (`closeAction`, which extracts facts and todos via a model or
      heuristic). Only rendered once the day has a file (`view !== null`):
      `journal:setClosed` itself refuses to create one, so there is nothing
      to mark finished on a day that doesn't exist yet. */
  finish: {
    busy: boolean;
    onMarkFinished: () => void;
    onReopen: () => void;
  };
  /** "Start interview" (012, D6) — built by the screen, unconditionally as a
      small secondary action: 047/D4 dropped the `dayEmpty` variant switch,
      since the one teal accent now belongs to the day field's own save.
      Placed right after the header/chips/mood/energy block and before the
      "Day" section itself — it is the offer for someone who does not know
      where to start, so it is read before the field, not found after
      scrolling past it. Rendered in `.sb-dayentry-interview`, which keeps it
      at its own width in the stretching column (047, Q4). */
  interviewAction: ReactNode;
  /** The stream section — built by the screen so `EntryStream` lives there. */
  dialogue: ReactNode;
  /** "Move the conversation into the entry" (011, D9) — the hash it writes
      with is already closed over at the call site in `JournalScreen.tsx`,
      mirroring `text.onSave`. Rendered above `dialogue`, as the fold action
      for the legacy `## Conversation` the stream replaces, only when the
      open day still has one (`view.turns.length > 0`). */
  legacy: { busy: boolean; error: unknown; onFold: () => void };
  facts: ReactNode;
  /** The open day-close proposal (018), or `undefined` while there is none.
      Sits directly below the day's own text and above the facts, so a
      finding and the sentence it was computed from are on screen at the
      same time, which is the whole point of the story: the proposal is
      checkable, not a modal that hides its own evidence. Built by the
      screen (`JournalScreen.tsx`), which owns the store lookup and the
      apply/discard/run-again wiring. */
  proposal?: ReactNode;
  /** Field and stance — a direct child of `.sb-dayentry`, so its frame spans
      the whole detail column instead of just the tail of the stream section
      (see `CoachComposer.tsx`). Rendered last, as the coach's own field, in
      normal flow: 047/D3 removed the `position: sticky` this used to carry,
      so nothing is pinned to the window edge any more. */
  composer: ReactNode;
  /** "Close the day", right below the day's own text and above the facts —
      in every window width (047, D3). Built by the screen (see
      `JournalScreen.tsx`), which owns the click handler and the mutual
      exclusion with `proposal` below; `undefined` only while a proposal for
      the shown day is open, never because of window width. */
  closeAction: ReactNode;
}

export function DayEntry({
  date,
  view,
  projects,
  mood,
  text,
  fieldRef,
  onOpenProject,
  finish,
  interviewAction,
  dialogue,
  legacy,
  facts,
  proposal,
  composer,
  closeAction,
}: DayEntryProps) {
  const t = useT();
  const language = useLanguage();
  const long = new Intl.DateTimeFormat(locale(language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const day = view?.day ?? null;

  return (
    <div className="sb-dayentry">
      <div className="sb-dayentry-head">
        <div className="sb-dayentry-title">
          <span className="gs-overline">{date === todayIso() ? t('journal.today') : ''}</span>
          <h2 className="sb-dayentry-date">{long.format(dateOf(date))}</h2>
          {view === null ? null : <span className="sb-mono sb-dayentry-path">{view.doc.path}</span>}
          {day?.closed === null || day?.closed === undefined ? null : (
            <Badge variant="success">
              {t('journal.finish.badge', { date: formatDate(day.closed, language) })}
            </Badge>
          )}
        </div>
        {view === null ? null : (
          <div className="sb-dayentry-actions">
            {day?.closed === null || day?.closed === undefined ? (
              <Button
                variant="secondary"
                size="sm"
                icon="circle-check-big"
                loading={finish.busy}
                onClick={finish.onMarkFinished}
              >
                {t('journal.finish.markFinished')}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon="refresh-cw"
                loading={finish.busy}
                onClick={finish.onReopen}
              >
                {t('journal.finish.reopen')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon="external-link"
              onClick={() => void api.shell.openPath(view.doc.path).catch(() => undefined)}
            >
              {t('journal.file.open')}
            </Button>
          </div>
        )}
      </div>

      {(day?.people.length ?? 0) + (day?.projects.length ?? 0) === 0 ? null : (
        <div className="sb-dayentry-chips">
          {(day?.people ?? []).length === 0 ? null : (
            <span className="sb-chips" role="group" aria-label={t('journal.people')}>
              <span className="sb-chips-label">{t('journal.people')}</span>
              {(day?.people ?? []).map((name) => (
                <span key={name} className="sb-chip sb-chip--static">
                  {name}
                </span>
              ))}
            </span>
          )}
          {(day?.projects ?? []).length === 0 ? null : (
            <span className="sb-chips" role="group" aria-label={t('journal.projects')}>
              <span className="sb-chips-label">{t('journal.projects')}</span>
              {(day?.projects ?? []).map((slug) => {
                const known = projects.find((project) => project.slug === slug);
                const title = known?.title ?? slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    className="sb-chip"
                    aria-label={t('journal.project.open', { title })}
                    onClick={() => onOpenProject(slug)}
                  >
                    {title}
                  </button>
                );
              })}
            </span>
          )}
        </div>
      )}

      <div className="sb-dayentry-levels">
        <MoodPicker
          kind="mood"
          value={day?.mood ?? null}
          busy={mood.busy}
          saved={mood.saved}
          onPick={(level) => mood.onPick('mood', level)}
        />
        <MoodPicker
          kind="energy"
          value={day?.energy ?? null}
          busy={mood.busy}
          saved={mood.saved}
          onPick={(level) => mood.onPick('energy', level)}
        />
      </div>

      {/* Wrapped, not bare: `.sb-dayentry` is a stretching flex column, in
          which a `size="sm"` button would still span the full 74ch — a
          secondary action has to read as one (047, Q4). */}
      <div className="sb-dayentry-interview">{interviewAction}</div>

      <section className="sb-daysection" aria-label={t('journal.day.title')}>
        <h3 className="sb-section-title">{t('journal.day.title')}</h3>
        <DayText
          text={view?.text ?? ''}
          hash={view?.doc.hash ?? ''}
          written={text.written}
          busy={text.busy}
          error={text.error}
          attemptedAt={text.attemptedAt}
          saved={text.saved}
          onSave={text.onSave}
          onReload={text.onReload}
          onReset={text.onReset}
          fieldRef={fieldRef}
        />
      </section>

      {/* Proposal and trigger are mutually exclusive by construction: the
          screen stops rendering `closeAction` as soon as a proposal exists
          for this day, so there is never a "close the day" button below an
          open proposal (018, decision 3). */}
      {proposal}
      {closeAction === undefined ? null : (
        <div className="sb-dayentry-closewrap">{closeAction}</div>
      )}

      {facts}

      {(view?.turns.length ?? 0) === 0 ? null : (
        <LegacyConversation
          turns={view?.turns ?? []}
          onFold={legacy.onFold}
          busy={legacy.busy}
          error={legacy.error}
        />
      )}
      {dialogue}
      {composer}
    </div>
  );
}
