/* Ein Befund als Karte: was es ist, warum es eines ist, welche Dateien es
   betrifft — und die Wege, damit umzugehen.

   Vier Zusagen stecken in der Form:

   - **Der Titel sagt die Sache, der Satz darunter die Folge.** Beides kommt fertig
     aus dem Kern (`GardenerFinding.title`/`detail` sind Sätze, kein Code); die
     Karte formuliert nichts nach.
   - **Die Vorschau ist die geschriebene Zeile,** wortwörtlich, mit der Datei
     darüber. Bei `mark-reviewed` und `add-to-index` ist das der ganze Unterschied,
     den der Klick macht — deshalb steht er als `+`-Zeile da und nicht als
     Beschreibung.
   - **Was nichts schreibt, sagt das.** „Beide Seiten vergleichen" und die
     `open-*`-Aktionen öffnen nur; die Karte behauptet keinen Schreibvorgang.
   - **Jede Fläche ist ein Knopf mit Namen.** Die Pfade in Mono sind klickbar und
     führen dorthin, wo die Datei in der App sichtbar ist (`targets.ts`); „im
     Editor öffnen" führt zur Datei selbst.
   - **Die Karte endet nie bei „ist kein Problem".** Welche Wege es gibt,
     entscheidet `exits.ts`; hier stehen nur ihre Knöpfe. Ohne Fix sagt ein
     ruhiger Satz, dass hier nichts automatisch zu richten ist — statt die
     Karte ohne Ausweg dastehen zu lassen. */

import type { ReactNode } from 'react';
import type { GardenerFinding } from '@shared/types';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { useT } from '../i18n';
import { exitsOf } from '../screens/garden/exits';
import type { FindingExit, HiddenState } from '../screens/garden/exits';
import { writeTargetOf, writesNothing } from '../screens/garden/fixes';
import { leafOf } from '../screens/garden/targets';
import { SnoozeMenu } from './SnoozeMenu';

const SEVERITY_VARIANT = {
  high: 'danger',
  warn: 'warning',
  info: 'neutral',
} as const;

export interface FindingCardProps {
  finding: GardenerFinding;
  /** Läuft gerade eine Aktion an diesem Befund? */
  busy?: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  /** „Nicht jetzt": `until` ist der Tag, den die Auswahl gezeigt hat. */
  onSnooze: (finding: GardenerFinding, days: number, until: string) => void;
  /** „In den Dateien erledigt" — prüft neu, schreibt nichts. */
  onRecheck: (finding: GardenerFinding) => void;
  /** Klick auf einen Pfad: dorthin, wo die Datei in der App steht. */
  onOpenPath: (path: string) => void;
  /** Die Datei selbst im Editor des Systems. */
  onOpenFile: (path: string) => void;
  /** Liegt der Befund schon weg? Dann steht der Rückweg statt der Wege hinaus. */
  hidden?: HiddenState;
  /** Der Rückweg eines weggelegten Befunds. */
  onRestore?: (finding: GardenerFinding) => void;
  /** Zusätzlicher Inhalt — der Widerspruch stellt hier seine zwei Seiten hin. */
  children?: ReactNode;
  /** Zusätzliche Wege, vor „passt so". */
  extraActions?: ReactNode;
}

export function FindingCard({
  finding,
  busy = false,
  onFix,
  onDismiss,
  onSnooze,
  onRecheck,
  onOpenPath,
  onOpenFile,
  hidden = null,
  onRestore,
  children,
  extraActions,
}: FindingCardProps) {
  const t = useT();
  const fix = finding.fix;
  const target = writeTargetOf(finding);
  const first = finding.paths[0] ?? null;
  const exits = exitsOf(finding, hidden);
  /* Der ruhige Satz gilt der Karte, die wirklich nichts anzubieten hat: eine
     Karte mit eigenen Wegen (015/016) hat sehr wohl etwas, nur keinen Fix. */
  const nothingToFix = fix === null && (extraActions ?? null) === null;

  /* Ein Knopf je Weg — die Liste kommt aus `exits.ts`, die Beschriftung von
     hier. */
  const exit = (kind: FindingExit): ReactNode => {
    if (kind === 'fix') {
      return fix === null ? null : (
        <Button
          key="fix"
          variant="secondary"
          size="sm"
          icon={writesNothing(fix.action) ? 'external-link' : 'check'}
          loading={busy}
          onClick={() => onFix(finding)}
        >
          {fix.label}
        </Button>
      );
    }
    if (kind === 'handled') {
      return (
        <Button
          key="handled"
          variant="ghost"
          size="sm"
          icon="refresh-cw"
          loading={busy}
          onClick={() => onRecheck(finding)}
        >
          {t('garden.card.handled')}
        </Button>
      );
    }
    if (kind === 'snooze') {
      return (
        <SnoozeMenu
          key="snooze"
          label={t('garden.card.snooze', { title: finding.title })}
          disabled={busy}
          onSnooze={(days, until) => onSnooze(finding, days, until)}
        />
      );
    }
    if (kind === 'dismiss') {
      return (
        <Button
          key="dismiss"
          variant="ghost"
          size="sm"
          icon="eye-off"
          onClick={() => onDismiss(finding)}
        >
          {t('garden.card.dismiss')}
        </Button>
      );
    }
    if (kind === 'restore') {
      return onRestore === undefined ? null : (
        <Button
          key="restore"
          variant="secondary"
          size="sm"
          icon="eye"
          loading={busy}
          onClick={() => onRestore(finding)}
        >
          {t('garden.card.undismiss')}
        </Button>
      );
    }
    return first === null ? null : (
      <Button
        key="open"
        variant="ghost"
        size="sm"
        icon="file-text"
        onClick={() => onOpenFile(first)}
      >
        {t('common.openInEditor')}
      </Button>
    );
  };

  return (
    <Card padded={false} className="sb-finding">
      <div className="sb-finding-head">
        <Badge variant={SEVERITY_VARIANT[finding.severity]}>
          {t(`garden.severity.${finding.severity}`)}
        </Badge>
        {/* h4: der Screen hat h1, das Modul h2, die Gruppe h3 — die Karte ist die
            vierte Ebene. Eine übersprungene Ebene wäre ein A11y-Verstoß. */}
        <h4 className="sb-finding-title">{finding.title}</h4>
        {finding.module === null ? null : (
          <span className="sb-finding-module sb-mono">{finding.module}</span>
        )}
      </div>

      <p className="sb-finding-why">{finding.detail}</p>

      {finding.paths.length === 0 ? null : (
        <div className="sb-finding-files">
          <span className="gs-overline">{t('garden.card.files')}</span>
          <ul className="sb-finding-paths">
            {finding.paths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className="sb-pathref sb-finding-path"
                  aria-label={t('garden.card.openThis', { path })}
                  onClick={() => onOpenPath(path)}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      {nothingToFix ? <p className="sb-finding-note">{t('garden.card.noFix')}</p> : null}

      {fix === null ? null : (
        <div className="sb-finding-fix">
          {writesNothing(fix.action) ? (
            <p className="sb-finding-note">{t('garden.card.previewNothing')}</p>
          ) : (
            <>
              <p className="sb-finding-note">
                {t('garden.card.preview', { file: target ?? leafOf(first ?? '') })}
              </p>
              {fix.preview === null ? null : (
                <pre className="sb-finding-preview sb-mono">
                  <code>{`+ ${fix.preview}`}</code>
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {/* Die eigenen Wege einer Karte (015/016) stehen hinter dem Fix und vor den
          allgemeinen — sie sind die besseren Antworten, wenn es sie gibt. */}
      <div className="sb-finding-actions">
        {exit('fix')}
        {extraActions}
        {exits.filter((kind) => kind !== 'fix').map(exit)}
      </div>
    </Card>
  );
}
