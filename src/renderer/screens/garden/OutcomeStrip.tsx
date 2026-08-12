/* Was gerade passiert ist — und der Weg zurück.

   Dieselbe Haltung wie in der Inbox: die Bestätigung steht im Screen und nicht als
   Meldung, weil eine Meldung nach sechs Sekunden verschwindet und keinen Knopf
   trägt. „Keine Aktion ohne Rückgängig" heißt, dass der Rückweg sichtbar dasteht.

   Und sie behauptet nur, was wirklich geschehen ist: ohne geschriebene Datei
   steht hier kein „geschrieben". Ein Fix, der nur öffnet, sagt „geöffnet"; ein
   Rückweg, der eine seither bearbeitete Datei nicht angefasst hat, sagt auch das
   (`kept`). */

import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';

export type Outcome =
  /** Ein Fix hat geschrieben. Ohne Marke gibt es keinen Rückweg. */
  | { kind: 'fixed'; files: string[]; undoToken: string | null }
  /** „Passt so" — der Befund ist ausgeblendet. */
  | { kind: 'dismissed'; id: string }
  /** Die Überholt-Beziehung steht im Frontmatter. */
  | { kind: 'superseded'; file: string; before: string[]; hash: string }
  /** Ein Fix wurde zurückgedreht; `kept` blieb unberührt. */
  | { kind: 'undone'; kept: string[] }
  /** Ein Lauf wurde abgebrochen. */
  | { kind: 'cancelled' }
  /** Eine Aktion, die nichts schreibt: die zweite Datei bleibt als Weg. */
  | { kind: 'opened'; paths: string[] };

export interface OutcomeStripProps {
  outcome: Outcome;
  busy: boolean;
  /** Der Rückweg, wenn es einen gibt. */
  onUndo?: () => void;
  /** Der zweite Pfad einer „nur öffnen"-Aktion. */
  onOpenSecond?: (path: string) => void;
}

function sentence(outcome: Outcome): { key: string; values?: Record<string, string | number> } {
  if (outcome.kind === 'fixed') {
    return { key: 'garden.card.written', values: { file: outcome.files[0] ?? '' } };
  }
  if (outcome.kind === 'dismissed') return { key: 'garden.card.dismissed' };
  if (outcome.kind === 'superseded') {
    return { key: 'garden.contradiction.superseded', values: { file: outcome.file } };
  }
  if (outcome.kind === 'undone') return { key: 'garden.card.undone' };
  if (outcome.kind === 'cancelled') return { key: 'garden.run.cancelled' };
  return { key: 'garden.card.opened', values: { path: outcome.paths[0] ?? '' } };
}

/** Beschriftung des Rückwegs — „wieder anzeigen" ist kein „rückgängig". */
function undoLabel(outcome: Outcome): string {
  return outcome.kind === 'dismissed' ? 'garden.card.undismiss' : 'garden.card.undo';
}

export function OutcomeStrip({ outcome, busy, onUndo, onOpenSecond }: OutcomeStripProps) {
  const t = useT();
  const line = sentence(outcome);
  const second = outcome.kind === 'opened' ? (outcome.paths[1] ?? null) : null;
  const kept = outcome.kind === 'undone' ? outcome.kept : [];

  return (
    <div className="sb-undostrip" role="status">
      <Icon name="circle-check-big" size={16} />
      <span className="sb-undostrip-text">{t(line.key, line.values)}</span>
      {kept.length === 0 ? null : (
        <span className="sb-mono">
          {plural(kept.length, 'garden.card.keptOne', 'garden.card.kept')}
        </span>
      )}
      {second === null || onOpenSecond === undefined ? null : (
        <Button variant="ghost" size="sm" icon="external-link" onClick={() => onOpenSecond(second)}>
          {t('garden.card.openSecond')}
        </Button>
      )}
      {onUndo === undefined ? null : (
        <Button variant="secondary" size="sm" icon="history" loading={busy} onClick={onUndo}>
          {t(undoLabel(outcome))}
        </Button>
      )}
    </div>
  );
}
