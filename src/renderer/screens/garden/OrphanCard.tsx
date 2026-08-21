/* An orphaned wiki page with no unambiguous target (story 016 D5).
 *
 * The core's own fix (`add-links`) only auto-appears when exactly one page
 * mentions the orphan — that case falls through to the plain `FindingCard`
 * unchanged (`FindingList.tsx`). This card is the other case: zero or several
 * candidates, so a human picks.
 *
 * Two ways in, ranked and filtered server-side by `gardener:orphanTargets`
 * (never re-ranked or re-filtered here):
 * 1. One click on the module's overview page, when it's among the candidates
 *    — a fixed path per `docs/VAULT-FORMAT.md`, not a heuristic.
 * 2. A searchable picker over the rest, mirroring `SessionLink`'s markup
 *    (search field from the same candidate count on, a `<select>`) but never
 *    writing on pick — picking only selects a candidate and reveals the
 *    preview, same "no write before confirm" discipline as every other fix
 *    on this screen.
 *
 * The write itself (`gardener:linkOrphan`) is not this card's job: like
 * `NearDuplicateCard`'s `onSupersede`, the card only reports the write it
 * wants through `onLink`; `useGardenOutcome.ts` owns the mutation and turns
 * the result into an outcome-strip entry with undo. The read
 * (`orphanTargets`) is different — nothing depends on it being undoable or
 * shared across cards, so this card fetches it itself, the same way
 * `DiscardPageAction` owns its own `discardPlan` read.
 *
 * A third way out (016 D6): giving up on the page entirely, via the shared
 * `DiscardPageAction` from story 015 — mounted exactly like `NearDuplicateCard`
 * mounts it, but with no `keep` at all. An orphan has nothing linking to it by
 * definition, so there is nothing to repoint inbound links at; the dialog
 * still says plainly if something now does point at it (changed since the
 * maintenance run), the same honesty `DiscardPageAction` already gives the
 * near-duplicate case when a page has no chosen survivor.
 */

import { useEffect, useRef, useState } from 'react';
import type { GardenerFinding, OrphanTarget } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { Input } from '../../atoms/Input';
import { DiscardPageAction } from '../../components/DiscardPageAction';
import { ErrorState } from '../../components/ErrorState';
import { FindingCard } from '../../components/FindingCard';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import type { DiscardPageResult } from '../../lib/queries/gardener';
import { useGardenerMutations } from '../../lib/queries/gardener';
import { leafOf } from './targets';

const OVERVIEW_SUFFIX = '/wiki/overview.md';

/** From the same count on, a search field sits above the `<select>` —
    matching `SessionLink.SEARCH_FROM`. A module's own pages run in the same
    range as an agent's vault projects, so the same threshold applies. */
const SEARCH_FROM = 8;

export interface OrphanLinkWrite {
  findingId: string;
  target: string;
}

export interface OrphanCardProps {
  finding: GardenerFinding;
  busy?: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** Reports the pick to write. The caller writes and reports it, same split
      as `onSupersede`/`onSupersedeDuplicate`. */
  onLink: (write: OrphanLinkWrite) => void;
  /** A discard of the orphan page finished. The caller decides what to show
      — same prop, same wiring `NearDuplicateCard` already uses. */
  onDiscarded: (result: DiscardPageResult) => void;
}

interface PagePickerProps {
  targets: readonly OrphanTarget[];
  pickedPath: string | null;
  onPick: (path: string) => void;
}

/** The rest of the candidates, searchable — `SessionLink`'s markup, adapted
    for `OrphanTarget` and for "select only picks, it never writes". */
function PagePicker({ targets, pickedPath, onPick }: PagePickerProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const found =
    needle.length === 0
      ? targets
      : targets.filter((target) => target.title.toLowerCase().includes(needle));

  return (
    <span className="sb-line-link">
      {targets.length < SEARCH_FROM ? null : (
        <Input
          className="sb-line-search"
          icon="search"
          label={t('garden.orphan.searchLabel')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <span className="gs-inputwrap sb-line-picker">
        <select
          className="gs-input gs-select"
          aria-label={t('garden.orphan.pickAria')}
          value={pickedPath ?? ''}
          onChange={(event) => {
            const path = event.target.value;
            if (path.length > 0) onPick(path);
          }}
        >
          <option value="">{t('garden.orphan.pickPlaceholder')}</option>
          {found.map((target) => (
            <option key={target.path} value={target.path}>
              {target.title}
            </option>
          ))}
        </select>
        <span className="gs-select-chevron">
          <Icon name="chevron-down" size={14} />
        </span>
      </span>
      {/* An empty match list is a statement, not a blank field. */}
      {found.length === 0 ? (
        <span className="sb-line-none">{t('garden.orphan.noMatch', { query: query.trim() })}</span>
      ) : null}
    </span>
  );
}

export function OrphanCard({
  finding,
  busy = false,
  onFix,
  onDismiss,
  onOpenPath,
  onOpenFile,
  onLink,
  onDiscarded,
}: OrphanCardProps) {
  const t = useT();
  const mutations = useGardenerMutations();
  const orphanTargets = mutations.orphanTargets;
  const orphanPath = finding.paths[0] ?? '';

  /* Fetched once per finding, not on every re-render — a ref survives the
     mutation object being a fresh instance each render (`useMutation`'s
     result isn't referentially stable). A manual retry bypasses the guard
     on purpose. */
  const fetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (fetchedFor.current === finding.id) return;
    fetchedFor.current = finding.id;
    orphanTargets.mutate(finding.id);
  }, [finding.id, orphanTargets]);

  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pending = orphanTargets.isPending;
  const data = orphanTargets.data ?? null;
  const failed = data === null && !pending ? orphanTargets.error : null;

  const targets = data?.targets ?? [];
  const overview = targets.find((target) => target.path.endsWith(OVERVIEW_SUFFIX)) ?? null;
  const rest = targets.filter((target) => target !== overview);
  const picked =
    pickedPath === null ? null : (targets.find((target) => target.path === pickedPath) ?? null);

  const retry = (): void => orphanTargets.mutate(finding.id);

  return (
    <FindingCard
      finding={finding}
      busy={busy}
      onFix={onFix}
      onDismiss={onDismiss}
      onOpenPath={onOpenPath}
      onOpenFile={onOpenFile}
      extraActions={
        <>
          <DiscardPageAction target={{ path: orphanPath }} busy={busy} onDone={onDiscarded} />
          {picked === null || data === null ? null : (
            <Button
              variant="secondary"
              size="sm"
              icon="link"
              loading={busy}
              onClick={() => onLink({ findingId: finding.id, target: picked.path })}
            >
              {t('garden.orphan.confirm', { file: leafOf(picked.path) })}
            </Button>
          )}
        </>
      }
    >
      {pending ? (
        <Skeleton lines={2} height={16} />
      ) : failed !== null ? (
        <ErrorState error={failed} onRetry={retry} variant="secondary" subject={finding.title} />
      ) : data === null ? null : targets.length === 0 ? (
        <p className="sb-finding-note">{t('garden.orphan.empty')}</p>
      ) : (
        <div className="sb-orphan-pick">
          <span className="gs-overline">{t('garden.orphan.targetLabel')}</span>
          <div className="sb-finding-actions">
            {overview === null ? null : (
              <Button
                variant="secondary"
                size="sm"
                icon="link"
                onClick={() => setPickedPath(overview.path)}
              >
                {t('garden.orphan.fromOverview', { module: finding.module ?? '' })}
              </Button>
            )}
            {rest.length === 0 ? null : pickerOpen ? (
              <PagePicker targets={rest} pickedPath={pickedPath} onPick={setPickedPath} />
            ) : (
              <button type="button" className="sb-textlink" onClick={() => setPickerOpen(true)}>
                {t('garden.orphan.pickToggle')}
              </button>
            )}
          </div>

          {picked === null ? null : (
            <>
              <p className="sb-finding-note">{t('garden.card.preview', { file: picked.path })}</p>
              <pre className="sb-finding-preview sb-mono">
                <code>{`+ ${data.line}`}</code>
              </pre>
            </>
          )}
        </div>
      )}
    </FindingCard>
  );
}
