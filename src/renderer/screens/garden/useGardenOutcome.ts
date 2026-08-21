/* The write paths of the maintenance screen and what they leave in the
   outcome strip — split out of `GardenScreen.tsx` so the screen stays about
   layout and this stays about what a click on a finding actually does.

   Every path here follows the same rule as the cards themselves: what the
   confirmation says is decided by the result, not the button's label —
   without a written file, nothing was "written", even if the click sounded
   like it (`applyFix`), and a page that went to the trash is never
   "written" either (`discarded`). */

import { useState } from 'react';
import type { GardenerFinding } from '@shared/types';
import type { DiscardPageResult, GardenerMutations } from '../../lib/queries/gardener';
import type { ModuleMutations } from '../../lib/queries/modules';
import type { SupersedeWrite } from './ContradictionCard';
import type { NearDuplicateSupersedeWrite } from './NearDuplicateCard';
import type { OrphanLinkWrite } from './OrphanCard';
import type { Outcome } from './OutcomeStrip';

/** The `undoFix` mark of an outcome that can go back that way — `null` for
    every other kind, `superseded`'s own manual undo included. */
function undoTokenOf(outcome: Outcome): string | null {
  if (outcome.kind === 'fixed') return outcome.undoToken;
  if (outcome.kind === 'discarded') return outcome.undoToken;
  return null;
}

export interface GardenOutcome {
  outcome: Outcome | null;
  busyId: string | null;
  undoable: boolean;
  reset: () => void;
  cancelled: () => void;
  applyFix: (finding: GardenerFinding) => void;
  dismiss: (finding: GardenerFinding) => void;
  supersede: (write: SupersedeWrite) => void;
  supersedeDuplicate: (write: NearDuplicateSupersedeWrite) => void;
  discarded: (result: DiscardPageResult) => void;
  linkOrphan: (write: OrphanLinkWrite) => void;
  undo: () => void;
}

/** `pages.savePage` (the contradiction's own path — untouched, story 015's
    recorded follow-up) and `mutations` (the D6/D7 gardener writes) between
    them cover every action a finding card can trigger. */
export function useGardenOutcome(
  mutations: GardenerMutations,
  pages: ModuleMutations,
  /** Where an "opens only" fix leads — the same path the finding cards use. */
  openPath: (path: string) => void,
): GardenOutcome {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const undo = (): void => {
    if (outcome === null) return;
    if (outcome.kind === 'dismissed') {
      mutations.undismiss.mutate(outcome.id, { onSuccess: () => setOutcome(null) });
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
      outcome.kind === 'superseded' ||
      outcome.kind === 'discarded' ||
      (outcome.kind === 'fixed' && outcome.undoToken !== null));

  return {
    outcome,
    busyId,
    undoable,
    reset: () => setOutcome(null),
    cancelled: () => setOutcome({ kind: 'cancelled' }),
    applyFix,
    dismiss,
    supersede,
    supersedeDuplicate,
    discarded,
    linkOrphan,
    undo,
  };
}
