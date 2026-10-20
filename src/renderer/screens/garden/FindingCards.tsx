/* Which card a single finding gets — split out of `FindingList.tsx` so that
   file stays about ordering the list, and this one about the one decision
   "how does this finding present itself" needs on its own (017 D4).

   Two cards, two questions:
   - **`OpenFindingCard`** — same choice the screen always made: the
     specialised presentation per kind (contradiction, near-duplicate, orphan)
     where one exists, the generic `FindingCard` otherwise.
   - **`HiddenFindingCard`** — a dismissed or snoozed finding needs none of
     that: it only needs to say why it is hidden and offer the one way back,
     so it is always the generic card, regardless of kind. */

import type { GardenerFinding, GardenerHiddenFinding, UiLanguage } from '@shared/types';
import { FindingCard } from '../../components/FindingCard';
import { useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import type { DiscardPageResult } from '../../lib/queries/gardener';
import { ContradictionCard } from './ContradictionCard';
import type { SupersedeWrite } from './ContradictionCard';
import type { HiddenState } from './exits';
import { LooseEndCard } from './LooseEndCard';
import { NearDuplicateCard } from './NearDuplicateCard';
import type { NearDuplicateSupersedeWrite } from './NearDuplicateCard';
import { OrphanCard } from './OrphanCard';
import type { OrphanLinkWrite } from './OrphanCard';

interface FindingCardCommonProps {
  finding: GardenerFinding;
  busy: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onSnooze: (finding: GardenerFinding, days: number, until: string) => void;
  onRecheck: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
}

/**
 * A hidden finding's card: the same `FindingCard`, regardless of kind — the
 * specialised cards exist for their extra ways *out*; a hidden finding only
 * needs the one way back in, so the generic card is the honest choice. The
 * reason line is the whole point of this component: "this is not a problem"
 * for a dismissal, the return date for a snooze — `until` on the hidden
 * entry, never guessed.
 */
export interface HiddenFindingCardProps extends FindingCardCommonProps {
  entry: GardenerHiddenFinding;
  language: UiLanguage;
  /** The way back — direct, no outcome strip involved (017 D4). */
  onRestore: (finding: GardenerFinding, state: Exclude<HiddenState, null>) => void;
}

export function HiddenFindingCard({
  finding,
  entry,
  language,
  busy,
  onFix,
  onDismiss,
  onSnooze,
  onRecheck,
  onOpenPath,
  onOpenFile,
  onRestore,
}: HiddenFindingCardProps) {
  const t = useT();
  return (
    <FindingCard
      finding={finding}
      busy={busy}
      onFix={onFix}
      onDismiss={onDismiss}
      onSnooze={onSnooze}
      onRecheck={onRecheck}
      onOpenPath={onOpenPath}
      onOpenFile={onOpenFile}
      hidden={entry.state}
      onRestore={() => onRestore(finding, entry.state)}
    >
      <p className="sb-finding-note">
        {entry.state === 'dismissed'
          ? t('garden.hidden.dismissed')
          : t('garden.hidden.snoozed', { date: formatDate(entry.until ?? null, language) })}
      </p>
    </FindingCard>
  );
}

/** An open finding's card — the specialised presentation per kind, unchanged
    from before 017 D4 (contradiction, near-duplicate, orphan, or generic). */
export interface OpenFindingCardProps extends FindingCardCommonProps {
  onSupersede: (write: SupersedeWrite) => void;
  onSupersedeDuplicate: (write: NearDuplicateSupersedeWrite) => void;
  onDiscarded: (result: DiscardPageResult) => void;
  onLinkOrphan: (write: OrphanLinkWrite) => void;
  /** The one way out a loose end has: my own words about what happened
      (020 D5/D6), through 017's `extraActions` slot. */
  onAnswerLooseEnd: (finding: GardenerFinding, day: string, text: string) => void;
}

export function OpenFindingCard({
  finding,
  busy,
  onFix,
  onDismiss,
  onSnooze,
  onRecheck,
  onOpenPath,
  onOpenFile,
  onSupersede,
  onSupersedeDuplicate,
  onDiscarded,
  onLinkOrphan,
  onAnswerLooseEnd,
}: OpenFindingCardProps) {
  if (finding.kind === 'loose-end') {
    return (
      <LooseEndCard
        finding={finding}
        busy={busy}
        onFix={onFix}
        onDismiss={onDismiss}
        onSnooze={onSnooze}
        onRecheck={onRecheck}
        onOpenPath={onOpenPath}
        onOpenFile={onOpenFile}
        onAnswer={onAnswerLooseEnd}
      />
    );
  }
  if (finding.kind === 'contradiction') {
    return (
      <ContradictionCard
        finding={finding}
        busy={busy}
        onFix={onFix}
        onDismiss={onDismiss}
        onSnooze={onSnooze}
        onRecheck={onRecheck}
        onOpenPath={onOpenPath}
        onOpenFile={onOpenFile}
        onSupersede={onSupersede}
      />
    );
  }
  if (finding.kind === 'near-duplicate') {
    return (
      <NearDuplicateCard
        finding={finding}
        busy={busy}
        onFix={onFix}
        onDismiss={onDismiss}
        onSnooze={onSnooze}
        onRecheck={onRecheck}
        onOpenPath={onOpenPath}
        onOpenFile={onOpenFile}
        onSupersede={onSupersedeDuplicate}
        onDiscarded={onDiscarded}
      />
    );
  }
  if (finding.kind === 'orphan' && finding.fix === null) {
    return (
      <OrphanCard
        finding={finding}
        busy={busy}
        onFix={onFix}
        onDismiss={onDismiss}
        onSnooze={onSnooze}
        onRecheck={onRecheck}
        onOpenPath={onOpenPath}
        onOpenFile={onOpenFile}
        onLink={onLinkOrphan}
        onDiscarded={onDiscarded}
      />
    );
  }
  return (
    <FindingCard
      finding={finding}
      busy={busy}
      onFix={onFix}
      onDismiss={onDismiss}
      onSnooze={onSnooze}
      onRecheck={onRecheck}
      onOpenPath={onOpenPath}
      onOpenFile={onOpenFile}
    />
  );
}
