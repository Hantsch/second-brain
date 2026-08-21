/* Two pages that say almost the same thing (015 D8).
 *
 * The core's own fix (`merge`) only opens both pages — nothing here ever
 * merges text on its own (`core/gardener/checks/near-duplicate.ts`). Beside
 * that "compare both pages" action and "fine as it is", this card offers two
 * more paths, neither of which the core check itself proposes:
 *
 * 1. **Discard one of the two.** `DiscardPageAction` (015 D7), mounted once
 *    per page — each targets that page and offers to repoint at its sibling.
 * 2. **Name one as superseding the other.** The same frontmatter relation
 *    `ContradictionCard` writes, but through the dedicated `gardener:supersede`
 *    mutation (015 D6) instead of a raw page save — and unlike the
 *    contradiction, near duplicates carry no reliable "which one is newer"
 *    signal from the check itself. The card suggests a direction from
 *    `created` when both pages carry one and they differ; otherwise there is
 *    no default; the two options below start unselected and the person must
 *    pick one before a preview — let alone a write — exists.
 *
 * The write itself is only proposed: the preview (file + `supersedes: [...]`)
 * sits on the card before the button is enabled, same "no write before
 * confirm" discipline as the discard dialog.
 */

import { useState } from 'react';
import type { GardenerFinding, VaultDoc, WikiPage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Radio } from '../../atoms/Radio';
import { DiscardPageAction } from '../../components/DiscardPageAction';
import { FindingCard } from '../../components/FindingCard';
import { useLanguage, useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import type { DiscardPageResult } from '../../lib/queries/gardener';
import { useModulePage } from '../../lib/queries/modules';
import { leafOf } from './targets';

type Loaded = { page: WikiPage; doc: VaultDoc };
type Direction = 'first' | 'second';

export interface NearDuplicateSupersedeWrite {
  newerPath: string;
  olderPath: string;
  expectedHash: string;
  /** The line that lands in the frontmatter — also the preview. */
  line: string;
}

export interface NearDuplicateCardProps {
  finding: GardenerFinding;
  busy?: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onSnooze: (finding: GardenerFinding, days: number, until: string) => void;
  onRecheck: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** Records the supersede relationship. The caller writes and reports it. */
  onSupersede: (write: NearDuplicateSupersedeWrite) => void;
  /** A discard on either side finished. The caller decides what to show. */
  onDiscarded: (result: DiscardPageResult) => void;
}

/** `created` straight from the frontmatter — never the fallback `pages.ts`
    derives when it's missing. A guessed date must not steer a suggestion. */
function rawCreated(doc: VaultDoc): string | null {
  const value = doc.frontmatter['created'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The direction the app would suggest — `null` when it must not guess: a
    missing `created` on either side, or the same date on both. */
function suggestedDirection(
  first: Loaded | null | undefined,
  second: Loaded | null | undefined,
): Direction | null {
  if (first === null || first === undefined || second === null || second === undefined) {
    return null;
  }
  const a = rawCreated(first.doc);
  const b = rawCreated(second.doc);
  if (a === null || b === null || a === b) return null;
  return a > b ? 'first' : 'second';
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

interface SideProps {
  path: string;
  loaded: Loaded | null | undefined;
  onOpenPath: (path: string) => void;
}

function Side({ path, loaded, onOpenPath }: SideProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <div className="sb-contra-side">
      <button
        type="button"
        className="sb-contra-title"
        onClick={() => onOpenPath(path)}
        aria-label={t('garden.card.openThis', { path })}
      >
        {loaded?.page.title ?? path}
      </button>
      <span className="sb-mono sb-contra-date">
        {loaded === undefined || loaded === null
          ? path
          : `${t('garden.nearDuplicate.created')} ${formatDate(loaded.page.created, language)}`}
      </span>
    </div>
  );
}

export function NearDuplicateCard({
  finding,
  busy = false,
  onFix,
  onDismiss,
  onSnooze,
  onRecheck,
  onOpenPath,
  onOpenFile,
  onSupersede,
  onDiscarded,
}: NearDuplicateCardProps) {
  const t = useT();
  const [firstPath, secondPath] = [finding.paths[0] ?? '', finding.paths[1] ?? ''];
  const first = useModulePage(firstPath.length > 0 ? firstPath : null);
  const second = useModulePage(secondPath.length > 0 ? secondPath : null);

  /* `null` until the person picks — a suggestion is not a selection. */
  const [chosen, setChosen] = useState<Direction | null>(null);
  const suggestion = suggestedDirection(first.data ?? null, second.data ?? null);
  const direction = chosen ?? suggestion;

  const newerLoaded =
    direction === 'first' ? first.data : direction === 'second' ? second.data : null;
  const olderLoaded =
    direction === 'first' ? second.data : direction === 'second' ? first.data : null;

  const write: NearDuplicateSupersedeWrite | null =
    newerLoaded === null ||
    newerLoaded === undefined ||
    olderLoaded === null ||
    olderLoaded === undefined
      ? null
      : (() => {
          const before = stringList(newerLoaded.doc.frontmatter['supersedes']);
          if (before.includes(olderLoaded.page.slug)) return null;
          const next = [...before, olderLoaded.page.slug];
          return {
            newerPath: newerLoaded.page.path,
            olderPath: olderLoaded.page.path,
            expectedHash: newerLoaded.doc.hash,
            line: `supersedes: [${next.join(', ')}]`,
          };
        })();

  /* Why not simply `write === null && direction !== null`: `write` is also `null`
     when a side could not be read at all — the page is gone (the discard action on
     this very card just moved it to the trash, and the finding stays on screen
     until the next run) or the read failed. Reading that as "the relation is
     already named" would tell the person something about the frontmatter that this
     card cannot know. `undefined` without an error is only the read still running:
     then neither sentence is shown. */
  const missing = first.isError || first.data === null || second.isError || second.data === null;
  const bothLoaded =
    first.data !== null &&
    first.data !== undefined &&
    second.data !== null &&
    second.data !== undefined;
  const alreadyNamed = bothLoaded && direction !== null && write === null;

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
      extraActions={
        <>
          <DiscardPageAction
            target={{ path: firstPath }}
            keep={{ path: secondPath }}
            busy={busy}
            onDone={onDiscarded}
          />
          <DiscardPageAction
            target={{ path: secondPath }}
            keep={{ path: firstPath }}
            busy={busy}
            onDone={onDiscarded}
          />
          {write === null ? null : (
            <Button
              variant="secondary"
              size="sm"
              icon="history"
              loading={busy}
              onClick={() => onSupersede(write)}
            >
              {t('garden.nearDuplicate.supersede', {
                older: leafOf(olderLoaded?.page.path ?? ''),
                newer: leafOf(newerLoaded?.page.path ?? ''),
              })}
            </Button>
          )}
        </>
      }
    >
      <div className="sb-contra">
        <Side path={firstPath} loaded={first.data} onOpenPath={onOpenPath} />
        <Side path={secondPath} loaded={second.data} onOpenPath={onOpenPath} />
      </div>

      <p className="sb-finding-note">{t('garden.nearDuplicate.neverMerged')}</p>

      <div className="sb-ndup-direction">
        <span className="gs-overline">{t('garden.nearDuplicate.directionLabel')}</span>
        {suggestion === null ? (
          <p className="sb-finding-note">{t('garden.nearDuplicate.noDefault')}</p>
        ) : null}
        <Radio
          name={`ndup-direction-${finding.id}`}
          label={t('garden.nearDuplicate.optionNewer', { file: leafOf(firstPath) })}
          checked={direction === 'first'}
          disabled={first.data === undefined || first.data === null}
          onChange={() => setChosen('first')}
        />
        <Radio
          name={`ndup-direction-${finding.id}`}
          label={t('garden.nearDuplicate.optionNewer', { file: leafOf(secondPath) })}
          checked={direction === 'second'}
          disabled={second.data === undefined || second.data === null}
          onChange={() => setChosen('second')}
        />
      </div>

      {missing ? (
        <p className="sb-finding-note">{t('garden.nearDuplicate.pageMissing')}</p>
      ) : alreadyNamed ? (
        <p className="sb-finding-note">{t('garden.nearDuplicate.alreadyNamed')}</p>
      ) : null}

      {write === null ? null : (
        <>
          <p className="sb-finding-note">
            {t('garden.nearDuplicate.supersedeHint', {
              slug: olderLoaded?.page.slug ?? '',
              file: write.newerPath,
            })}
          </p>
          <pre className="sb-finding-preview sb-mono">
            <code>{`+ ${write.line}`}</code>
          </pre>
        </>
      )}
    </FindingCard>
  );
}
