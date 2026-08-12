/* Der Abschnitt „Fakten": was der Tagesabschluss herausgezogen und der Mensch
 * bestätigt hat — plus der Rückweg danach. Der Knopf, der den Abschluss anwirft
 * („Tag abschließen"), steht nicht hier: er ist am unteren Rand der
 * Detailspalte verankert, neben dem Composer (CoachPanel), damit er nie unter
 * den sichtbaren Rand rutscht.
 *
 * Zwei Entscheidungen:
 *
 * - **Die Zeilen stehen wörtlich da**, nicht als gerendertes Markdown. Eine
 *   Checkbox mit `@due:2026-08-17 #work` ist genau die Zeile, die in der Datei
 *   steht; als Liste gedeutet würden daraus lose Klammern und die Marker
 *   verschwänden.
 * - **Die Bestätigung nennt nur, was wirklich geschrieben wurde**, und den Rückweg
 *   nur, wenn es einen gibt. Der Rückweg ist die Liste der `vault:write`-Aufträge
 *   aus `journal:applyClose` — jeder mit dem Hash des Stands, den er zurückdreht.
 */

import type { WriteRequest } from '@shared/ipc';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';

/** Was ein ausgeführter Tagesabschluss hinterlassen hat. */
export interface AppliedClose {
  written: string[];
  undo: WriteRequest[];
}

export interface FactsSectionProps {
  /** Der Abschnitt aus der Datei, wörtlich. */
  facts: string;
  applied: AppliedClose | null;
  undoBusy: boolean;
  onUndo: () => void;
}

export function FactsSection({ facts, applied, undoBusy, onUndo }: FactsSectionProps) {
  const t = useT();
  const first = applied?.written[0] ?? null;

  return (
    <section className="sb-dayfacts" aria-label={t('journal.facts.title')}>
      <h3 className="sb-section-title">{t('journal.facts.title')}</h3>

      {facts.trim().length === 0 ? (
        <p className="sb-panel-empty">{t('journal.facts.empty')}</p>
      ) : (
        <p className="sb-dayfacts-text">{facts}</p>
      )}

      {applied === null ? null : (
        /* Dieselbe Leiste wie in der Inbox — sie bleibt stehen, bis der Tag
           wechselt: zehn Sekunden sind für eine Entscheidung zu kurz. */
        <div className="sb-undostrip" role="status">
          <span className="sb-undostrip-text">
            {applied.written.length === 0
              ? t('journal.close.doneNothing')
              : t('journal.close.done')}
          </span>
          {first === null ? null : <span className="sb-mono sb-undostrip-path">{first}</span>}
          {applied.written.length > 1 ? (
            <span className="sb-mono">
              {t('journal.close.doneMore', { count: applied.written.length - 1 })}
            </span>
          ) : null}
          {applied.undo.length === 0 ? null : (
            <Button
              variant="secondary"
              size="sm"
              icon="history"
              loading={undoBusy}
              onClick={onUndo}
            >
              {t('common.undo')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
