/* Der Editor einer Wiki-Seite: Feld, Meldungen, Fußzeile.
   Herausgelöst aus PageView.tsx — Anzeigen und Ändern sind zwei Aufgaben.

   Die Reihenfolge im Markup ist der Kern dieser Datei: **die Meldung steht
   zwischen Feld und Fußzeile, nicht über dem Feld.** Das Feld ist 380 px hoch;
   eine Karte darüber lag nach dem Klick auf „Speichern" außerhalb des Sichtfelds
   (gemessen: 182 px hoch bei `top = -136` — zwei Pixel sichtbar). Wer unten
   klickt und oben eine Antwort bekommt, sieht keine und hält den Entwurf für
   gespeichert. Dazu: `role="alert"`, `scrollIntoView` beim Erscheinen und eine
   Zeile neben dem Knopf, die ausspricht, dass nichts geschrieben wurde. */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

export interface PageEditProps {
  /** Der Entwurf, wie er im Feld steht. */
  draft: string;
  onDraft: (next: string) => void;
  /** Der Hauptprozess hat mit `conflict` abgelehnt. */
  conflict: boolean;
  /** Ein anderer Fehler des Schreibwegs; `null`, wenn keiner ansteht. */
  error: unknown;
  /** Die Datei hat sich geändert, seit der Editor geöffnet wurde. */
  changedOutside: boolean;
  /** Hash der Fassung, die gerade in der Datei steht — der Anlass der Meldung. */
  docHash: string;
  /** Der Schreibvorgang läuft. */
  busy: boolean;
  /** Zeitpunkt des letzten Versuchs — dieselbe Karte, neuer Anlass. */
  attemptedAt: number;
  /** Pfad der Seite, für die Fehlerkarte. */
  subject: string;
  /** Speichern mit dem eingefrorenen Hash. */
  onSave: () => void;
  /** Ausdrückliches Überschreiben, ohne Hash. */
  onOverwrite: () => void;
  /** Entwurf verwerfen und den fremden Stand holen. */
  onReload: () => void;
  /** Die eigene Fassung behalten, trotz fremder Änderung. */
  onKeep: () => void;
  onCancel: () => void;
}

export function PageEdit({
  draft,
  onDraft,
  conflict,
  error,
  changedOutside,
  docHash,
  busy,
  attemptedAt,
  subject,
  onSave,
  onOverwrite,
  onReload,
  onKeep,
  onCancel,
}: PageEditProps) {
  const t = useT();
  return (
    <div className="sb-pageedit">
      <label className="gs-label" htmlFor="sb-page-draft">
        {t('page.editLabel')}
      </label>
      <textarea
        id="sb-page-draft"
        className="gs-input sb-pageedit-field"
        value={draft}
        spellCheck={false}
        onChange={(event) => onDraft(event.target.value)}
      />

      {conflict ? (
        <AlertCard
          title={t('page.conflict.title')}
          body={t('page.conflict.body')}
          nonce={attemptedAt}
        >
          {/* Sekundär: der Fokuspunkt gehört jetzt der Entscheidung in dieser
              Karte, nicht dem Fußzeilen-„Speichern" — das kann in diesem
              Zustand nur dieselbe Ablehnung erzeugen. „Überschreiben" bleibt
              die einzige Aktion mit Gewicht, weil sie die einzige ist, die
              wirklich etwas ändert. */}
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={onReload}>
            {t('page.conflict.reload')}
          </Button>
          <Button variant="danger" size="sm" icon="pencil" loading={busy} onClick={onOverwrite}>
            {t('page.conflict.overwrite')}
          </Button>
        </AlertCard>
      ) : error === null ? null : (
        <ErrorState error={error} variant="secondary" subject={subject} scrollIntoView />
      )}

      {/* Die fremde Änderung kommt über den Watcher an, nicht erst beim Speichern:
          wer sie kennt, verliert seinen Text nicht aus Unwissenheit. */}
      {changedOutside && !conflict ? (
        <AlertCard title={t('page.external.title')} body={t('page.external.body')} nonce={docHash}>
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={onReload}>
            {t('page.external.reload')}
          </Button>
          <Button variant="secondary" size="sm" icon="pencil" onClick={onKeep}>
            {t('page.external.keep')}
          </Button>
        </AlertCard>
      ) : null}

      <div className="sb-pageedit-foot">
        {/* Während eine Karte oben steht, kann dieser Knopf nur dieselbe
            Ablehnung erzeugen — sekundär, damit nicht zwei Teal-Flächen
            gleichzeitig um die Aufmerksamkeit konkurrieren. */}
        <Button
          variant={conflict || changedOutside ? 'secondary' : 'primary'}
          icon="check"
          loading={busy}
          onClick={onSave}
        >
          {t('page.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('page.cancel')}
        </Button>
        {/* Ohne diese Zeile hätte der Klick auf „Speichern" keine Antwort am Knopf
            selbst. Keine eigene Live-Region: die Karte darüber ist die Ansage,
            zweimal wäre einmal zu viel. */}
        {conflict ? (
          <span className="sb-pageedit-warn">{t('page.unsaved')}</span>
        ) : (
          <span className="gs-hint">{t('page.editHint')}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Eine Meldung, die man nicht verpassen darf: sie rollt beim Erscheinen in den
 * Blick und meldet sich als `alert` an.
 *
 * `nonce` ist der Anlass. Bleibt die Karte stehen und wird nur erneut ausgelöst
 * (zweiter Klick auf „Speichern", zweite Ablehnung), ändert sich der Wert — und
 * die Karte rollt wieder in den Blick, statt still dieselbe zu bleiben.
 */
function AlertCard({
  title,
  body,
  nonce,
  children,
}: {
  title: string;
  body: string;
  nonce: number | string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* Optional gerufen: eine Umgebung ohne Layout (jsdom) kennt `scrollIntoView`
     nicht — geprüft wird dort die Meldung, nicht das Rollen. */
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest' });
  }, [nonce]);
  return (
    <div ref={box}>
      <Card className="sb-conflict" role="alert">
        <h3 className="sb-conflict-title">{title}</h3>
        <p className="sb-empty-body">{body}</p>
        <div className="sb-conflict-actions">{children}</div>
      </Card>
    </div>
  );
}
