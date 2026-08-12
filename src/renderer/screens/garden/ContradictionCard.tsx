/* The most important finding type: two pages that claim contradictory things.

   It gets its own presentation because it's the only kind where you need to
   read **both** to decide: the two sides sit next to each other, each with its
   passage and its version.

   And it has three paths — none of them resolve the contradiction
   (docs/MODULE-SCHEMA.md, "Contradictions"):

   1. **Keep both and name it.** This is the core's fix: a line in the
      "Contradictions" section of the first page, verbatim the preview.
   2. **Mark the older one as superseded.** Enters the older page's slug into
      the newer page's `supersedes` — a frontmatter field the core itself reads
      (`core/gardener/relations.ts`): the conflict then counts as named. It's
      written with the hash read when this card was loaded; if someone has
      touched the file since, a conflict comes back and shows visibly, instead
      of overwriting someone else's change.
   3. **Looks fine.** The finding is hidden, with undo.

   What the card does **not** do: change either of the two texts, delete a
   page, or decide which one is right. */

import type { GardenerFinding, VaultDoc, WikiPage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { FindingCard } from '../../components/FindingCard';
import { useLanguage, useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useModulePage } from '../../lib/queries/modules';
import { contradictionPassage } from './sections';

/** Field name from docs/MODULE-SCHEMA.md: the newer page supersedes the older one. */
const SUPERSEDES = 'supersedes';

export interface SupersedeWrite {
  path: string;
  /** The whole new value of the field — lists are replaced, not merged. */
  supersedes: string[];
  expectedHash: string;
  /** For undo: the value that stood there before. */
  before: string[];
  /** The line that lands in the frontmatter — also the preview. */
  line: string;
}

export interface ContradictionCardProps {
  finding: GardenerFinding;
  busy?: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** Records the supersede relationship. The caller writes and reports it. */
  onSupersede: (write: SupersedeWrite) => void;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

/** Which page is the newer one? `null` if both carry the same date. */
function newerOf(a: { page: WikiPage } | null, b: { page: WikiPage } | null): 'a' | 'b' | null {
  if (a === null || b === null) return null;
  const left = a.page.updated;
  const right = b.page.updated;
  if (left === right) return null;
  return left > right ? 'a' : 'b';
}

interface SideProps {
  path: string;
  loaded: { page: WikiPage; doc: VaultDoc } | null | undefined;
  onOpenPath: (path: string) => void;
}

function Side({ path, loaded, onOpenPath }: SideProps) {
  const t = useT();
  const language = useLanguage();
  const passage =
    loaded === undefined || loaded === null ? null : contradictionPassage(loaded.doc.body);

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
          : `${t('garden.contradiction.updated')} ${formatDate(loaded.page.updated, language)}`}
      </span>
      {passage === null ? null : (
        <>
          <span className="gs-overline">
            {t(passage.named ? 'garden.contradiction.section' : 'garden.contradiction.excerpt')}
          </span>
          <p className="sb-contra-passage">{passage.text}</p>
        </>
      )}
    </div>
  );
}

export function ContradictionCard({
  finding,
  busy = false,
  onFix,
  onDismiss,
  onOpenPath,
  onOpenFile,
  onSupersede,
}: ContradictionCardProps) {
  const t = useT();
  const [firstPath, secondPath] = [finding.paths[0] ?? '', finding.paths[1] ?? ''];
  const first = useModulePage(firstPath.length > 0 ? firstPath : null);
  const second = useModulePage(secondPath.length > 0 ? secondPath : null);

  const newer = newerOf(first.data ?? null, second.data ?? null);
  const newerSide = newer === 'a' ? first.data : newer === 'b' ? second.data : null;
  const olderSide = newer === 'a' ? second.data : newer === 'b' ? first.data : null;

  const write: SupersedeWrite | null =
    newerSide === null || newerSide === undefined || olderSide === null || olderSide === undefined
      ? null
      : (() => {
          const before = stringList(newerSide.doc.frontmatter[SUPERSEDES]);
          if (before.includes(olderSide.page.slug)) return null;
          const next = [...before, olderSide.page.slug];
          return {
            path: newerSide.page.path,
            supersedes: next,
            expectedHash: newerSide.doc.hash,
            before,
            line: `${SUPERSEDES}: [${next.join(', ')}]`,
          };
        })();

  return (
    <FindingCard
      finding={finding}
      busy={busy}
      onFix={onFix}
      onDismiss={onDismiss}
      onOpenPath={onOpenPath}
      onOpenFile={onOpenFile}
      extraActions={
        write === null ? null : (
          <Button
            variant="secondary"
            size="sm"
            icon="history"
            loading={busy}
            onClick={() => onSupersede(write)}
          >
            {t('garden.contradiction.supersede', {
              newer: newerSide?.page.title ?? '',
              older: olderSide?.page.title ?? '',
            })}
          </Button>
        )
      }
    >
      <div className="sb-contra">
        <Side path={firstPath} loaded={first.data} onOpenPath={onOpenPath} />
        <Side path={secondPath} loaded={second.data} onOpenPath={onOpenPath} />
      </div>
      <p className="sb-finding-note">{t('garden.contradiction.never')}</p>
      {finding.fix === null ? (
        <p className="sb-finding-note">{t('garden.contradiction.named')}</p>
      ) : null}
      {write === null ? (
        newer === null && first.data && second.data ? (
          <p className="sb-finding-note">{t('garden.contradiction.sameDate')}</p>
        ) : null
      ) : (
        <p className="sb-finding-note">
          {t('garden.contradiction.supersedeHint', {
            slug: olderSide?.page.slug ?? '',
            file: write.path,
          })}
        </p>
      )}
      {write === null ? null : (
        <pre className="sb-finding-preview sb-mono">
          <code>{`+ ${write.line}`}</code>
        </pre>
      )}
    </FindingCard>
  );
}
