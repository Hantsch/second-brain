/* The day: a header with the spelled-out date, mood and energy, people and
 * projects — below that the file's sections, all in one column.
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

import type { ReactNode } from 'react';
import type { JournalDayView } from '@shared/ipc';
import type { Project } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { dateOf, todayIso } from '../../components/DayList';
import { MoodPicker } from '../../components/MoodPicker';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { DayText } from './DayText';
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
    onSave: (value: string, expectedHash: string | undefined) => void;
    onReload: () => void;
    onReset: () => void;
  };
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
  /** "Start interview" (012, D6) — built by the screen, which alone knows
      whether the day already has prose and therefore which variant
      (primary/secondary) applies. Placed right after the header/mood/chips
      block and before the "Day" section itself: the story's own acceptance
      criterion is that it reads as most prominent while the day is still
      empty, which means it must be the first thing seen on a blank day, not
      something found only after scrolling past the composer. */
  interviewAction: ReactNode;
  /** The stream section — built by the screen so `EntryStream` lives there. */
  dialogue: ReactNode;
  /** "Move the conversation into the entry" (011, D9) — the hash it writes
      with is already closed over at the call site in `JournalScreen.tsx`,
      mirroring `text.onSave`. Rendered below `dialogue` only when the open
      day still has a legacy `## Conversation` (`view.turns.length > 0`). */
  legacy: { busy: boolean; error: unknown; onFold: () => void };
  facts: ReactNode;
  /** Field and stance — a direct child of `.sb-dayentry`, so its sticky
      frame (`position: sticky`, only in the wide window) covers the whole
      detail column and not just the rest of the stream section
      (see `CoachComposer.tsx`). */
  composer: ReactNode;
  /** "Close the day", right below the facts — only in the narrow window:
      there it sits in the screen (see `JournalScreen.tsx`), because it
      belongs with the day's own facts, not in the composer. In the wide
      window it stays `undefined` — there the button remains unchanged in
      the composer (`footerAction`), so nothing changes about the
      already-approved wide view. */
  closeAction?: ReactNode;
}

export function DayEntry({
  date,
  view,
  projects,
  mood,
  text,
  onOpenProject,
  finish,
  interviewAction,
  dialogue,
  legacy,
  facts,
  composer,
  closeAction,
}: DayEntryProps) {
  const t = useT();
  const language = useLanguage();
  const long = new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
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

      {interviewAction}

      <section className="sb-daysection" aria-label={t('journal.day.title')}>
        <h3 className="sb-section-title">{t('journal.day.title')}</h3>
        <DayText
          text={view?.text ?? ''}
          hash={view?.doc.hash ?? ''}
          fresh={view === null}
          busy={text.busy}
          error={text.error}
          attemptedAt={text.attemptedAt}
          saved={text.saved}
          onSave={text.onSave}
          onReload={text.onReload}
          onReset={text.onReset}
        />
      </section>

      {facts}
      {closeAction === undefined ? null : (
        <div className="sb-dayentry-closewrap">{closeAction}</div>
      )}

      {dialogue}
      {(view?.turns.length ?? 0) === 0 ? null : (
        <LegacyConversation
          turns={view?.turns ?? []}
          onFold={legacy.onFold}
          busy={legacy.busy}
          error={legacy.error}
        />
      )}
      {composer}
    </div>
  );
}
