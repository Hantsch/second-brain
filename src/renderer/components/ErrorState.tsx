/* Fehlerzustand. Die Formulierung kommt aus `IpcError.code`; die technische
   Message steckt hinter „Details anzeigen", nie als roher Stacktrace.

   Drei Regeln aus ARCHITECTURE.md stecken in der Form: die Karte steht dort, wo
   die auslösende Aktion war (das entscheidet der Aufrufer), sie bietet einen
   Fluchtweg (`onRetry` führt dieselbe Aktion noch einmal aus), und sie nennt den
   Gegenstand — „der Vault ‚kaputter-vault' ließ sich nicht öffnen" ist eine
   Auskunft, „das hat nicht funktioniert" ein Rätsel.

   `variant` entscheidet über das Teal: hat der Screen eine eigene primäre
   Aktion, bleibt „Erneut versuchen" sekundär. Zwei Fokuspunkte auf einer Fläche
   sind keiner. */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { decodeIpcError } from '../lib/ipc-error';

export interface ErrorStateProps {
  /** Alles, was ein IPC-Aufruf werfen kann. */
  error: unknown;
  onRetry?: () => void;
  /**
   * Worum es ging: Vaultname, Pfad, Titel. Bereits übersetzt bzw. ein Datum aus
   * dem Vault — steht als Gegenstand im Satz.
   */
  subject?: string;
  /**
   * `primary`: „Erneut versuchen" ist der Fokuspunkt der Fläche (Standard).
   * `secondary`: der Screen hat schon einen — dann bleibt der Knopf ruhig.
   */
  variant?: 'primary' | 'secondary';
  /** In den Sichtbereich rollen, sobald der Fehler erscheint. */
  scrollIntoView?: boolean;
}

export function ErrorState({
  error,
  onRetry,
  subject,
  variant = 'primary',
  scrollIntoView = false,
}: ErrorStateProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const failure = decodeIpcError(error);

  /* Ein Fehler, den der Nutzer nicht sieht, ist ein stiller Fehler. */
  useEffect(() => {
    if (!scrollIntoView) return;
    box.current?.scrollIntoView({ block: 'nearest' });
  }, [scrollIntoView, failure.code, failure.message]);

  const sentence =
    subject === undefined || subject.length === 0
      ? t(`error.code.${failure.code}`)
      : t(`error.about.${failure.code}`, { subject });

  return (
    <div ref={box}>
      <Card padded={false} className="sb-error" role="alert">
        <div className="sb-error-body">
          <span className="sb-error-icon">
            <Icon name="triangle-alert" size={18} />
          </span>
          <div className="sb-error-text">
            <h2 className="sb-error-title">{t('error.title')}</h2>
            <p className="sb-empty-body">{sentence}</p>
            <div className="sb-error-actions">
              {onRetry ? (
                <Button
                  variant={variant === 'secondary' ? 'secondary' : 'primary'}
                  icon="refresh-cw"
                  size="sm"
                  onClick={onRetry}
                >
                  {t('error.retry')}
                </Button>
              ) : null}
              <Button
                variant={variant === 'secondary' && onRetry ? 'ghost' : 'secondary'}
                size="sm"
                icon={open ? 'chevron-up' : 'chevron-down'}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? t('error.detailsHide') : t('error.details')}
              </Button>
            </div>
            {open ? (
              <span className="sb-note-detail">
                {failure.code}: {failure.message}
              </span>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
