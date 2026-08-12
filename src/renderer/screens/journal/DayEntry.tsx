/* The day: a header with the spelled-out date, mood and energy, people and
 * projects — below that the file's three sections.
 *
 * The date is spelled out because it's the heading of a day, not a sort key.
 * The path next to it in mono: the file is the source of truth, and it's
 * reachable from here.
 *
 * Mood and energy save immediately (no form), people and projects come from
 * the frontmatter — projects lead there with one click. Nothing is invented:
 * what isn't in the entry doesn't appear here either.
 *
 * In the narrow window (≤ 1200 px) the day carries two tabs — "Day" and
 * "Talk" — because two earlier designs failed at forcing both into a single
 * scrolling column (see `styles/app/journal.css`): either the composer
 * covered the day, or it ended up out of sight itself. Separate tabs no
 * longer have to weigh that trade-off — each shows only what it's there for.
 * In the wide window there are no tabs (`.sb-dayentry-tabs` is invisible
 * there via CSS); the two tab wrappers `.sb-dayentry-tagpanel` and
 * `.sb-dayentry-talkpanel` are `display: contents` there — their children
 * then sit directly in the flow of `.sb-dayentry` again, unchanged from the
 * previous layout. That's why both wrappers always stay in the tree here: no
 * switch removes anything, it only hides the other side via CSS in the
 * narrow window. */

import type { KeyboardEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { JournalDayView } from '@shared/ipc';
import type { Project } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Tabs } from '../../atoms/Tabs';
import { dateOf, todayIso } from '../../components/DayList';
import { MoodPicker } from '../../components/MoodPicker';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { DayText } from './DayText';

type JournalTab = 'day' | 'talk';

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
  /** The "Talk" section — built by the screen so the stream lives there. */
  dialogue: ReactNode;
  facts: ReactNode;
  /** Field and stance — a direct child of `.sb-dayentry`, so its sticky
      frame (`position: sticky`, only in the wide window) covers the whole
      detail column and not just the rest of the talk section
      (see `CoachComposer.tsx`). */
  composer: ReactNode;
  /** "Close the day", right below the facts — only in the narrow window:
      there it sits in the screen (see `JournalScreen.tsx`), because it
      belongs in the "Day" tab, not in the composer. In the wide window it
      stays `undefined` — there the button remains unchanged in the composer
      (`footerAction`), so nothing changes about the already-approved wide
      view. */
  closeAction?: ReactNode;
  /** Number of turns for the badge on the "Talk" tab. */
  talkCount: number;
  /** Called as soon as someone explicitly switches to "Talk" (click or
      arrow key) — not on the first render, even if the tab is already
      "Talk" there. Otherwise the same condition ("no text") would rip focus
      away from the empty day-text field, which it already gets on a fresh
      day (`DayText.tsx`). */
  onEnterTalk: () => void;
}

export function DayEntry({
  date,
  view,
  projects,
  mood,
  text,
  onOpenProject,
  dialogue,
  facts,
  composer,
  closeAction,
  talkCount,
  onEnterTalk,
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

  /* Default: "Day" — unless the day has no text yet, then "Talk", because
     someone who hasn't written anything yet obviously wants to talk instead
     of type. Computed once: the day switch in the screen hangs off
     `key={date}`, so this component is recreated fresh for each day. */
  const hasText = (view?.text ?? '').trim().length > 0;
  const [tab, setTab] = useState<JournalTab>(hasText ? 'day' : 'talk');

  /* `onEnterTalkRef` holds the most recent callback, updated outside of
     rendering (React no longer allows writes to `ref.current` during
     rendering) — the effect below reads it at the moment of the call
     without depending on it itself: a dependency on a function that's new
     on every render would otherwise be a reason to fire again on every
     render, not just on the actual tab switch. */
  const onEnterTalkRef = useRef(onEnterTalk);
  useLayoutEffect(() => {
    onEnterTalkRef.current = onEnterTalk;
  });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (tab === 'talk') onEnterTalkRef.current();
  }, [tab]);

  const onTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    /* Left/right only — up/down and j/k belong to the day switch
       (`use-journal-keys.ts`), and digits remain a character in every field:
       this line doesn't bind any. */
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setTab(tab === 'day' ? 'talk' : 'day');
  };

  return (
    <div className="sb-dayentry" data-tab={tab}>
      <div className="sb-dayentry-head">
        <div className="sb-dayentry-title">
          <span className="gs-overline">{date === todayIso() ? t('journal.today') : ''}</span>
          <h2 className="sb-dayentry-date">{long.format(dateOf(date))}</h2>
          {view === null ? null : <span className="sb-mono sb-dayentry-path">{view.doc.path}</span>}
        </div>
        {view === null ? null : (
          <Button
            variant="ghost"
            size="sm"
            icon="external-link"
            onClick={() => void api.shell.openPath(view.doc.path).catch(() => undefined)}
          >
            {t('journal.file.open')}
          </Button>
        )}
      </div>

      {/* Only visible in the narrow window (`journal.css`) — in the wide
          window there are two columns instead of tabs, and this element
          stays invisible via CSS without changing anything in the tree
          below it. */}
      <Tabs
        className="sb-dayentry-tabs"
        items={[
          { id: 'day', label: t('journal.tab.day'), icon: 'notebook-pen' },
          { id: 'talk', label: t('journal.tab.talk'), icon: 'message-square', count: talkCount },
        ]}
        value={tab}
        onChange={(id) => setTab(id as JournalTab)}
        onKeyDown={onTabsKeyDown}
      />

      <div className="sb-dayentry-tagpanel">
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
      </div>

      <div className="sb-dayentry-talkpanel">
        {dialogue}
        {composer}
      </div>
    </div>
  );
}
