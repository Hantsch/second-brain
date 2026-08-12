/* Die Bestätigung nach einer Aktion: was passiert ist, und der Weg zurück.

   Sie steht bewusst im Screen und nicht als Meldung: eine Meldung verschwindet
   nach sechs Sekunden und trägt keinen Knopf. „Keine Aktion ohne Rückgängig"
   heißt, dass der Rückweg zehn Sekunden sichtbar dasteht.

   Die Zeile behauptet nur, was wirklich geschehen ist. „Abgelegt in" ohne Pfad
   wäre ein abgebrochener Satz — und bei einem Dump, der bewusst liegen bleibt,
   sogar eine Falschaussage. Deshalb entscheidet nicht die Absicht des Aufrufers,
   sondern das Ergebnis: ohne geschriebene Datei gilt „bleibt liegen". */

import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';

export interface UndoOffer {
  kind: 'filed' | 'discarded' | 'kept';
  /** Geschriebene Dateien — bei „verworfen" und „bleibt liegen" keine. */
  paths: readonly string[];
  /** Ohne Marke gibt es nichts zurückzunehmen. Jede der drei Aktionen liefert
      inzwischen eine — auch „bleibt liegen" (`capture:keep`) schreibt etwas
      und ist damit rücknehmbar. */
  undoToken: string | null;
}

export interface UndoStripProps {
  offer: UndoOffer;
  busy: boolean;
  onUndo: () => void;
}

/** Der Text, der zum Ergebnis passt — nicht der, den der Aufrufer meinte. */
function textKey(offer: UndoOffer): string {
  if (offer.kind === 'discarded') return 'inbox.undo.discarded';
  /* Kein Pfad heißt: es wurde keine Datei geschrieben. Dann ist der Dump
     liegengeblieben, egal mit welchem Knopf. */
  if (offer.kind === 'kept' || offer.paths.length === 0) return 'inbox.undo.kept';
  return 'inbox.undo.filed';
}

export function UndoStrip({ offer, busy, onUndo }: UndoStripProps) {
  const t = useT();
  const first = offer.paths[0] ?? null;
  return (
    <div className="sb-undostrip" role="status">
      <Icon name="circle-check-big" size={16} />
      <span className="sb-undostrip-text">{t(textKey(offer))}</span>
      {first === null ? null : <span className="sb-mono sb-undostrip-path">{first}</span>}
      {offer.paths.length > 1 ? (
        <span className="sb-mono">{t('inbox.undo.more', { count: offer.paths.length - 1 })}</span>
      ) : null}
      {offer.undoToken === null ? null : (
        <Button variant="secondary" size="sm" icon="history" loading={busy} onClick={onUndo}>
          {t('inbox.undo.action')}
        </Button>
      )}
    </div>
  );
}
