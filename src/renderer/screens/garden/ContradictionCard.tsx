/* Der wichtigste Befundtyp: zwei Seiten, die Widersprüchliches behaupten.

   Er bekommt eine eigene Darstellung, weil er die einzige Art ist, bei der man
   **beides** lesen muss, um zu entscheiden: die zwei Seiten stehen nebeneinander,
   jede mit ihrer Stelle und ihrem Stand.

   Und er hat drei Wege — keiner davon löst auf (docs/MODULE-SCHEMA.md,
   „Widersprüche"):

   1. **Beide behalten und benennen.** Das ist der Fix des Kerns: eine Zeile in den
      Abschnitt „Widersprüche" der ersten Seite, wortwörtlich die Vorschau.
   2. **Die ältere als überholt markieren.** Trägt den Slug der älteren Seite in
      `supersedes` der neueren ein — ein Frontmatter-Feld, das der Kern selbst
      liest (`core/gardener/relations.ts`): der Konflikt gilt danach als benannt.
      Geschrieben wird mit dem Hash, der beim Laden dieser Karte gelesen wurde;
      hat jemand die Datei seither angefasst, kommt ein Konflikt zurück und steht
      sichtbar da, statt eine fremde Änderung zu überschreiben.
   3. **Passt so.** Der Befund wird ausgeblendet, mit Rückgängig.

   Was die Karte **nicht** tut: einen der beiden Texte ändern, eine Seite löschen
   oder entscheiden, welche recht hat. */

import type { GardenerFinding, VaultDoc, WikiPage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { FindingCard } from '../../components/FindingCard';
import { useLanguage, useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import { useModulePage } from '../../lib/queries/modules';
import { contradictionPassage } from './sections';

/** Feldname aus docs/MODULE-SCHEMA.md: die neuere Seite überholt die ältere. */
const SUPERSEDES = 'supersedes';

export interface SupersedeWrite {
  path: string;
  /** Der ganze neue Wert des Feldes — Listen werden ersetzt, nicht gemergt. */
  supersedes: string[];
  expectedHash: string;
  /** Für die Rücknahme: der Wert, der vorher dort stand. */
  before: string[];
  /** Die Zeile, die im Frontmatter landet — zugleich die Vorschau. */
  line: string;
}

export interface ContradictionCardProps {
  finding: GardenerFinding;
  busy?: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** Trägt die Überholt-Beziehung ein. Der Aufrufer schreibt und meldet. */
  onSupersede: (write: SupersedeWrite) => void;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

/** Welche Seite ist die neuere? `null`, wenn beide dasselbe Datum tragen. */
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
