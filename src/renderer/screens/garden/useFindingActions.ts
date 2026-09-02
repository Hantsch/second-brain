/* The write paths of the maintenance screen and what they leave in the
   outcome strip — split out of `GardenScreen.tsx` so the screen stays about
   layout and this stays about what a click on a finding actually does.

   Every path here follows the same rule as the cards themselves: what the
   confirmation says is decided by the result, not the button's label —
   without a written file, nothing was "written", even if the click sounded
   like it (`applyFix`), and a page that went to the trash is never
   "written" either (`discarded`). `recheck` is that rule at its purest: it
   writes nothing at all, so the only honest thing it can say afterwards is
   whether the finding is still in the new report. */

import { useState } from 'react';
import type { GardenerFinding } from '@shared/types';
import { todayIso } from '../../components/DayList';
import type {
  DiscardPageResult,
  GardenerMutations,
  useGardenerRun,
} from '../../lib/queries/gardener';
import { useJournalDay } from '../../lib/queries/journal';
import type { ModuleMutations } from '../../lib/queries/modules';
import type { SupersedeWrite } from './ContradictionCard';
import type { NearDuplicateSupersedeWrite } from './NearDuplicateCard';
import type { OrphanLinkWrite } from './OrphanCard';
import type { HiddenState } from './exits';
import type { Outcome } from './OutcomeStrip';

/** The run this screen already owns — `recheck` starts exactly that one. */
type GardenerRun = ReturnType<typeof useGardenerRun>;

/** The `undoFix` mark of an outcome that can go back that way — `null` for
    every other kind, `superseded`'s own manual undo included. */
function undoTokenOf(outcome: Outcome): string | null {
  if (outcome.kind === 'fixed') return outcome.undoToken;
  if (outcome.kind === 'discarded') return outcome.undoToken;
  return null;
}

export interface FindingActions {
  outcome: Outcome | null;
  busyId: string | null;
  undoable: boolean;
  reset: () => void;
  applyFix: (finding: GardenerFinding) => void;
  dismiss: (finding: GardenerFinding) => void;
  /** `until` is the day the finding returns — the strip names it. */
  snooze: (finding: GardenerFinding, days: number, until: string) => void;
  /** The way back into the list, from either kind of putting away. */
  restore: (finding: GardenerFinding, state: Exclude<HiddenState, null>) => void;
  /** "Dealt with in the files": a fresh run, no state of its own. */
  recheck: (finding: GardenerFinding) => void;
  supersede: (write: SupersedeWrite) => void;
  supersedeDuplicate: (write: NearDuplicateSupersedeWrite) => void;
  discarded: (result: DiscardPageResult) => void;
  linkOrphan: (write: OrphanLinkWrite) => void;
  /** The loose end's one way out (020 D5/D6): my own words, written into
      today's day. */
  answerLooseEnd: (finding: GardenerFinding, day: string, text: string) => void;
  undo: () => void;
}

/** `pages.savePage` (the contradiction's own path — untouched, story 015's
    recorded follow-up) and `mutations` (the D6/D7 gardener writes) between
    them cover every action a finding card can trigger. */
export function useFindingActions(
  mutations: GardenerMutations,
  pages: ModuleMutations,
  /** The screen's own run — `recheck` starts it, it invents no second one. */
  run: GardenerRun,
  /** Where an "opens only" fix leads — the same path the finding cards use. */
  openPath: (path: string) => void,
): FindingActions {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /* `answerLooseEnd` always writes into *today*'s file (020, D5 — the
     announcing day only supplies the back-reference link), regardless of
     which finding is being answered — so the guard this screen needs is
     today's current hash, not anything about the finding itself. This
     screen has no other reason to load today's day; the same
     `journal:get`-backed query `JournalScreen`/`InterviewDialog` use for the
     day they have open is the only "current hash" source this codebase has,
     so it is reused here rather than inventing a hash-only endpoint. */
  const today = useJournalDay(todayIso());

  const applyFix = (finding: GardenerFinding): void => {
    setBusyId(finding.id);
    mutations.fix.mutate(finding, {
      onSettled: () => setBusyId(null),
      /* What the confirmation says is decided by the result: without a
         written file, nothing was written, even if the button sounded
         like it. */
      onSuccess: (result) => {
        const opened = result.open ?? [];
        if (result.written.length === 0) {
          if (opened.length > 0) {
            setOutcome({ kind: 'opened', paths: opened });
            openPath(opened[0] ?? '');
          }
          return;
        }
        setOutcome({ kind: 'fixed', files: result.written, undoToken: result.undoToken ?? null });
      },
    });
  };

  const dismiss = (finding: GardenerFinding): void => {
    setBusyId(finding.id);
    mutations.dismiss.mutate(finding.id, {
      onSettled: () => setBusyId(null),
      onSuccess: () => setOutcome({ kind: 'dismissed', id: finding.id }),
    });
  };

  /* "Not now" — one click after the day is picked, exactly like dismissing;
     `until` comes from the menu that showed that day, so the strip and the
     menu can't disagree about it. */
  const snooze = (finding: GardenerFinding, days: number, until: string): void => {
    setBusyId(finding.id);
    mutations.snooze.mutate(
      { id: finding.id, days },
      {
        onSettled: () => setBusyId(null),
        onSuccess: () => setOutcome({ kind: 'snoozed', id: finding.id, until }),
      },
    );
  };

  /* Both ways of putting a finding away have the same way back, and which
     channel undoes it is decided by the state the report carries. This is
     the hidden list's own "show it again" (017 D4) — a direct action, not a
     write the outcome strip announces: the mutation's own success handler
     already refreshes the report, so the list re-renders on its own and no
     outcome appears. The strip's "show it again" after a fresh dismiss/snooze
     goes through `undo` below instead, which does set one. */
  const restore = (finding: GardenerFinding, state: Exclude<HiddenState, null>): void => {
    setBusyId(finding.id);
    const mutation = state === 'snoozed' ? mutations.unsnooze : mutations.undismiss;
    mutation.mutate(finding.id, { onSettled: () => setBusyId(null) });
  };

  /* "I dealt with it in the files": nothing is written and nothing is hidden —
     the run decides. Still in the new report (hidden counts as still there, the
     file didn't change): the finding stands. Gone: it's gone. */
  const recheck = (finding: GardenerFinding): void => {
    setBusyId(finding.id);
    run.mutate(undefined, {
      onSettled: () => setBusyId(null),
      onSuccess: (report) => {
        const stillThere =
          report.findings.some((entry) => entry.id === finding.id) ||
          (report.hidden ?? []).some((entry) => entry.finding.id === finding.id);
        setOutcome({ kind: 'rechecked', gone: !stillThere });
      },
    });
  };

  /* The value and the hash were frozen when the card loaded; if someone has
     touched the file since, `conflict` comes back and appears as a card. */
  const supersede = (write: SupersedeWrite): void => {
    pages.savePage.mutate(
      {
        path: write.path,
        frontmatter: { supersedes: write.supersedes },
        expectedHash: write.expectedHash,
      },
      {
        /* The way back needs the earlier state and the current hash. */
        onSuccess: (written) =>
          setOutcome({
            kind: 'superseded',
            file: write.path,
            before: write.before,
            hash: written.hash,
          }),
      },
    );
  };

  /* Same `gardener:supersede` write ContradictionCard's own path uses, but
     through the D6 mutation instead of a raw page save — and its result
     carries an `undoToken` already, so it reads as an ordinary "fixed"
     outcome (a file was written) instead of needing its own kind. */
  const supersedeDuplicate = (write: NearDuplicateSupersedeWrite): void => {
    mutations.supersede.mutate(
      { newerPath: write.newerPath, olderPath: write.olderPath, expectedHash: write.expectedHash },
      {
        onSuccess: (result) =>
          setOutcome({ kind: 'fixed', files: [result.written], undoToken: result.undoToken }),
      },
    );
  };

  /* `DiscardPageAction` runs its own mutation and refresh; this only turns a
     finished discard into the strip's outcome. */
  const discarded = (result: DiscardPageResult): void => {
    setOutcome({ kind: 'discarded', file: result.discarded, undoToken: result.undoToken });
  };

  /* The picked target from `OrphanCard` (016 D5) — same `add-links` fix the
     automatic single-candidate case uses under the hood, so the result reads
     as an ordinary "fixed" outcome, exactly like `supersedeDuplicate`. */
  const linkOrphan = (write: OrphanLinkWrite): void => {
    mutations.linkOrphan.mutate(
      { findingId: write.findingId, target: write.target },
      {
        onSuccess: (result) =>
          setOutcome({ kind: 'fixed', files: result.written, undoToken: result.undoToken ?? null }),
      },
    );
  };

  /* Writes through 020 D5's channel. Success removes the finding from the
     cached report right away (`useGardenerMutations.answerLooseEnd`) — no
     fresh run, since answering never changes what a run would find. A stale
     hash surfaces as `conflict`, the same generic `ErrorState` path every
     other write on this screen already uses (`mutations.*.error` in
     `GardenScreen`) — a second, bespoke conflict banner would just be a
     second way of saying the same thing. */
  const answerLooseEnd = (finding: GardenerFinding, day: string, text: string): void => {
    setBusyId(finding.id);
    mutations.answerLooseEnd.mutate(
      {
        id: finding.id,
        day,
        text,
        ...(today.data?.doc.hash === undefined ? {} : { expectedHash: today.data.doc.hash }),
      },
      {
        onSettled: () => setBusyId(null),
        onSuccess: (result) => setOutcome({ kind: 'fixed', files: [result.path], undoToken: null }),
      },
    );
  };

  const undo = (): void => {
    if (outcome === null) return;
    if (outcome.kind === 'dismissed') {
      mutations.undismiss.mutate(outcome.id, { onSuccess: () => setOutcome(null) });
      return;
    }
    /* A snooze goes back the way `DeadlinesTile` does it: the reminder — here
       the finding — counts again right away. */
    if (outcome.kind === 'snoozed') {
      mutations.unsnooze.mutate(outcome.id, {
        onSuccess: () => setOutcome({ kind: 'unsnoozed' }),
      });
      return;
    }
    /* `fixed` (a normal write, including a supersede) and `discarded` (a page
       moved to the trash) both leave an `undoFix` journal behind them — same
       token, same way back. */
    const undoToken = undoTokenOf(outcome);
    if (undoToken !== null) {
      mutations.undoFix.mutate(undoToken, {
        onSuccess: (result) => setOutcome({ kind: 'undone', kept: result.kept }),
      });
      return;
    }
    if (outcome.kind === 'superseded') {
      /* Back to the earlier state. If the field was empty, an empty list
         remains: a field can't be removed via the merge, and
         `supersedes: []` says the same thing as "supersedes nothing". */
      pages.savePage.mutate(
        {
          path: outcome.file,
          frontmatter: { supersedes: outcome.before },
          expectedHash: outcome.hash,
        },
        { onSuccess: () => setOutcome({ kind: 'undone', kept: [] }) },
      );
    }
  };

  const undoable =
    outcome !== null &&
    (outcome.kind === 'dismissed' ||
      outcome.kind === 'snoozed' ||
      outcome.kind === 'superseded' ||
      outcome.kind === 'discarded' ||
      (outcome.kind === 'fixed' && outcome.undoToken !== null));

  return {
    outcome,
    busyId,
    undoable,
    reset: () => setOutcome(null),
    applyFix,
    dismiss,
    snooze,
    restore,
    recheck,
    supersede,
    supersedeDuplicate,
    discarded,
    linkOrphan,
    answerLooseEnd,
    undo,
  };
}
