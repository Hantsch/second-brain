/* Tagebuch — der Screen, auf dem die App nicht nützlich, sondern menschlich sein
   muss.

   Aufbau: links eine schmale Liste der Tage (mit benannten Lücken, „Heute" oben),
   rechts der Tag — Kopf, Tagestext, Gespräch, Fakten.

   Die vier Zustände aus ARCHITECTURE.md, alle ausdrücklich:
   - **Leer**: gar kein Eintrag im Vault → zwei Sätze, was hier entsteht, und ein
     Feld, das gleich losgeht. Heute ohne Eintrag ist kein Leerzustand, sondern die
     Frage „Wie war der Tag?" mit fokussiertem Feld.
   - **Kein Modell**: der Eintrag lässt sich schreiben, das Gespräch sagt ehrlich,
     dass es ohne Modell nicht antwortet — und zeigt im Modus „analysieren" die
     früheren Stellen, die es wirklich gefunden hat.
   - **Fehler**: was beim Schreiben, Abschließen oder Zurücknehmen schiefgeht, steht
     als Karte da, nie stumm.
   - **Kein Vault**: dafür sorgt die Hülle (`App.tsx`).

   Der offene Tag steht in der Adresse (`#/journal?d=2026-08-10`): so führt ein
   Verweis von außen — Dashboard, Befehlspalette, ein Beleg des Coachs — direkt
   dorthin.

   Der Stream läuft nicht über TanStack Query: die Stücke landen im Puffer aus
   `lib/llm-stream.ts`, und der Hauptprozess lädt den Tag über
   `event:vault-changed` neu, sobald die Runde als Datei steht. */

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
import { CoachPanel } from './CoachPanel';
import { DayEntry } from './DayEntry';
import { FactsSection } from './FactsSection';
import type { AppliedClose } from './FactsSection';
import { useJournalKeys } from './use-journal-keys';

/** Eine laufende Gesprächsrunde: Marke und der eigene Satz. */
interface Pending {
  threadId: string;
  messageId: string;
  message: string;
}

/** Dieselbe Schwelle wie `journal.css` (`@media (max-width: 1200px)`) — die
    einzige Stelle, an der dieser Screen selbst wissen muss, welche der beiden
    Bauformen gerade gilt: „Tag abschließen" steht im engen Fenster bei den
    Fakten (Reiter „Tag"), im breiten Fenster neben dem Sendeknopf, nie an
    beiden Stellen zugleich (siehe `closeAction` unten). Nach demselben Muster
    wie `useGridColumns` im Dashboard (`screens/dashboard/TileGrid.tsx`). */
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

  /* Die Haltung: Vorgabe aus den Einstellungen, umschaltbar pro Gespräch. */
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
    /* Ein Tageswechsel beendet die Sicht auf die laufende Runde: sie gehört zum
       anderen Tag und steht dort in der Datei. */
    setPending(null);
    setApplied(null);
    setTextSaved(false);
    if (focus) listRows.current.get(next)?.focus();
  };

  useJournalKeys({ dates, current: date, select, onMode: setMode });

  const busy = pending !== null && !stream.done;

  /* Solange eine Antwort läuft, wird keine zweite Runde geschickt: zwei
     Schreibvorgänge in dieselbe Datei würden sich überholen, und eine Runde ginge
     verloren. Der Composer zeigt in dieser Zeit „Abbrechen"; die Enter-Taste
     braucht denselben Riegel. */
  const say = (): void => {
    const message = draft.trim();
    if (message.length === 0 || busy || mutations.coach.isPending) return;
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
    view.error ??
    days.error ??
    null;

  /* Ein Knopf, zwei mögliche Stellen — nie beide zugleich. Im breiten Fenster
     steht er neben dem Composer, am unteren Rand der Detailspalte verankert
     (`footerAction`), damit keiner der beiden Aktionen, die den Tag
     betreffen, unter den sichtbaren Rand rutscht. Im engen Fenster gehört er
     stattdessen zum Reiter „Tag", direkt bei den Fakten (`DayEntry.tsx`) —
     der Reiter „Gespräch" zeigt sonst nur Verlauf und Feld. `narrow`
     entscheidet, welcher der beiden Wege den Knopf tatsächlich bekommt; der
     andere bleibt `undefined`. Sekundär bleibt die Aktion in jedem Fall — der
     eine Teal-Punkt dieses Screens ist das Gespräch, und im Dialog dessen
     „Übernehmen". */
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

  /* „Anzahl Runden" am Reiter „Gespräch" — jede Runde beginnt mit genau einer
     eigenen Zeile, die Antwort folgt oder bleibt aus (siehe `CoachPanel.tsx`);
     die laufende Runde zählt erst mit, sobald sie in der Datei steht. */
  const talkCount = (view.data?.turns ?? []).filter((turn) => turn.role === 'user').length;

  const header = (
    <ScreenHeader overline={t('screen.journal.overline')} title={t('screen.journal.title')} />
  );

  /* Gar kein Eintrag im Vault und auch heute keiner: dann erklärt der Screen in
     zwei Sätzen, was hier entsteht — und der Tag darunter ist der Anfang. */
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
                  /* Ohne eingefrorenen Hash: ein Feld-Patch schreibt keine
                     Nutzerzeile um, und ein Konflikt wäre hier reine Reibung
                     (dieselbe Abwägung wie beim nächsten Schritt im Projekt). */
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
              talkCount={talkCount}
              onEnterTalk={() => field.current?.focus()}
              dialogue={
                <CoachPanel
                  turns={view.data?.turns ?? []}
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
