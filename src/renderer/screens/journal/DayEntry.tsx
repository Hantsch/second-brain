/* Der Tag: Kopf mit ausgeschriebenem Datum, Stimmung und Energie, Personen und
 * Projekte — darunter die drei Abschnitte der Datei.
 *
 * Das Datum steht ausgeschrieben da, weil es die Überschrift eines Tages ist und
 * kein Sortierschlüssel. Der Pfad daneben in Mono: die Datei ist die Wahrheit, und
 * sie ist von hier aus erreichbar.
 *
 * Stimmung und Energie sind sofort gespeichert (kein Formular), Personen und
 * Projekte kommen aus dem Frontmatter — Projekte führen mit einem Klick dorthin.
 * Erfunden wird keins: was nicht im Eintrag steht, steht auch nicht hier.
 *
 * Im engen Fenster (≤ 1200 px) trägt der Tag zwei Reiter — „Tag" und
 * „Gespräch" —, weil zwei frühere Bauformen daran scheiterten, beides in eine
 * einzige Rollspalte zu zwingen (siehe `styles/app/journal.css`): entweder
 * verdeckte der Composer den Tag, oder er lag selbst außer Sicht. Getrennte
 * Reiter brauchen das nicht mehr abzuwägen — jeder zeigt nur, wozu er da ist.
 * Im breiten Fenster gibt es die Reiter nicht (`.sb-dayentry-tabs` ist dort per
 * CSS unsichtbar); die beiden Reiter-Hüllen `.sb-dayentry-tagpanel` und
 * `.sb-dayentry-talkpanel` sind dort `display: contents` — ihre Kinder liegen
 * dann wieder direkt im Fluss von `.sb-dayentry`, unverändert zur bisherigen
 * Anordnung. Deshalb bleiben beide Hüllen hier immer im Baum: kein Umschalten
 * entfernt etwas, es blendet im engen Fenster per CSS nur die andere Seite aus. */

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
  /** Der Tag, oder `null`: dann gibt es die Datei noch nicht. */
  view: JournalDayView | null;
  /** Für die Titel der Projekt-Chips. */
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
  /** Der Abschnitt „Gespräch" — vom Screen gebaut, damit der Stream dort lebt. */
  dialogue: ReactNode;
  facts: ReactNode;
  /** Feld und Haltung — direkter Nachfahre von `.sb-dayentry`, damit sein
      Klebe-Rahmen (`position: sticky`, nur im breiten Fenster) die ganze
      Detailspalte umfasst und nicht nur den Rest des Gesprächsabschnitts
      (siehe `CoachComposer.tsx`). */
  composer: ReactNode;
  /** „Tag abschließen", direkt unter den Fakten — nur im engen Fenster: dort
      steht sie im Screen (siehe `JournalScreen.tsx`), weil sie im Reiter „Tag"
      zu Hause ist, nicht im Composer. Im breiten Fenster bleibt sie `undefined`
      — dort steckt der Knopf unverändert im Composer (`footerAction`), damit
      sich an der abgenommenen breiten Ansicht nichts ändert. */
  closeAction?: ReactNode;
  /** Anzahl der Runden für die Kennzahl am Reiter „Gespräch". */
  talkCount: number;
  /** Wird gerufen, sobald jemand ausdrücklich auf „Gespräch" wechselt (Klick
      oder Pfeiltaste) — nicht beim ersten Rendern, auch wenn der Reiter dort
      schon „Gespräch" ist. Sonst risse dieselbe Bedingung („kein Text") dem
      leeren Tagestext-Feld den Fokus weg, den es beim frischen Tag schon
      bekommt (`DayText.tsx`). */
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

  /* Vorgabe: „Tag" — außer der Tag hat noch keinen Text, dann „Gespräch", weil
     wer noch nichts geschrieben hat, offensichtlich reden statt tippen will.
     Einmal berechnet: der Tageswechsel im Screen hängt hinter `key={date}`,
     dieser Baustein entsteht also je Tag neu. */
  const hasText = (view?.text ?? '').trim().length > 0;
  const [tab, setTab] = useState<JournalTab>(hasText ? 'day' : 'talk');

  /* `onEnterTalkRef` hält den jeweils neuesten Rückruf, außerhalb des
     Renderns aktualisiert (React lässt Schreibzugriffe auf `ref.current`
     während des Renderns nicht mehr zu) — der Effekt unten liest ihn im
     Moment des Aufrufs, ohne selbst von ihm abzuhängen: eine Abhängigkeit auf
     eine bei jedem Rendern neue Funktion wäre sonst ein Grund, bei jedem
     Rendern erneut zu greifen, nicht nur beim eigentlichen Reiterwechsel. */
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
    /* Nur Links/Rechts — Auf/Ab und j/k gehören dem Tageswechsel
       (`use-journal-keys.ts`), und Ziffern bleiben in jedem Feld ein Zeichen:
       diese Zeile bindet keine. */
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

      {/* Nur im engen Fenster sichtbar (`journal.css`) — im breiten gibt es
          zwei Spalten statt Reiter, und dieses Element bleibt per CSS
          unsichtbar, ohne dass sich am Baum darunter etwas ändert. */}
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
