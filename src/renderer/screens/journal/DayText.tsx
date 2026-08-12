/* Der Abschnitt „Tag": der Prosatext, gerendert — ein Klick macht ihn editierbar.
 *
 * Der Konfliktschutz ist der Kern dieser Datei, und er hängt an einem Detail:
 * **Wert und Hash werden beim Öffnen eingefroren, nicht beim Klick auf Speichern
 * gelesen.** Der Watcher erneuert die Tagesabfrage, sobald jemand von außen
 * schreibt; würde erst beim Speichern der aktuelle Hash genommen, ginge der alte
 * Text mit dem neuen Hash raus — und der Hauptprozess nähme ihn an. Das ist der
 * stille Verlust, den CLAUDE.md ausschließt.
 *
 * Zwei Sorten fremder Änderung, zwei Antworten:
 *
 * - **Der Abschnitt selbst hat sich geändert** → Leiste am Feld mit zwei Wegen
 *   (fremden Stand holen oder den eigenen behalten). Verglichen wird der Wert, denn
 *   nur er ist die Änderung, um die es geht.
 * - **Die Datei hat sich geändert, dieser Abschnitt nicht** (eine Coaching-Runde
 *   ist dazugekommen, der Tagesabschluss hat Fakten geschrieben) → der eingefrorene
 *   Hash zieht still nach. Ein Konflikt wäre hier reine Reibung: gespeichert wird
 *   ohnehin nur dieser Abschnitt.
 *
 * Kommt vom Hauptprozess trotzdem ein `conflict` zurück, steht der Entwurf still
 * und die Meldung bietet den ausdrücklichen Weg zum Überschreiben. Nichts geht
 * verloren, ohne dass jemand es entschieden hat.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Kbd } from '../../atoms/Kbd';
import { ErrorState } from '../../components/ErrorState';
import { Markdown } from '../../components/Markdown';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';

/** Die Fassung, auf der ein Entwurf beruht: Text und Hash gehören zusammen. */
interface Base {
  text: string;
  hash: string;
}

export interface DayTextProps {
  /** Der Prosatext des Abschnitts, wie er in der Datei steht. */
  text: string;
  /** Hash der Datei, in der er steht. */
  hash: string;
  /** Der Tag hat noch keine Datei — dann ist das Feld der Einstieg. */
  fresh: boolean;
  busy: boolean;
  /** Der Hauptprozess hat den letzten Versuch abgelehnt. */
  error: unknown;
  /** Zeitpunkt des letzten Versuchs — dieselbe Karte, neuer Anlass. */
  attemptedAt: number;
  saved: boolean;
  /** Speichern mit dem eingefrorenen Hash; `undefined` heißt ausdrücklich überschreiben. */
  onSave: (text: string, expectedHash: string | undefined) => void;
  /** Der Nutzer will den fremden Stand sehen. */
  onReload: () => void;
  onReset: () => void;
}

export function DayText({
  text,
  hash,
  fresh,
  busy,
  error,
  attemptedAt,
  saved,
  onSave,
  onReload,
  onReset,
}: DayTextProps) {
  const t = useT();
  /**
   * Der Entwurf **und** die Fassung, auf der er beruht — ein Stand, nicht zwei.
   * Er entsteht beim Öffnen des Editors und beim ersten Zeichen im einladenden
   * Feld; abgeleitet, nicht in einem Effekt nachgezogen (`useProposalEdit` macht
   * es genauso). So gibt es kein Bild, in dem Text und Hash nicht zusammenpassen.
   */
  const [stored, setStored] = useState<{ draft: string; base: Base } | null>(null);
  /** Fremde Fassung, deren Meldung der Nutzer weggeklickt hat. */
  const [accepted, setAccepted] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  /* Nach dem Speichern ist der Entwurf angekommen — dann gilt wieder die Datei. */
  const draft = saved ? null : (stored?.draft ?? null);
  const base = saved ? null : (stored?.base ?? null);
  /* Ein Tag ohne Prosa lädt ein, statt eine leere Fläche mit Stift zu zeigen —
     auch dann, wenn die Datei schon existiert (ein Tag, an dem nur geredet wurde). */
  const inviting = draft === null && (fresh || text.trim().length === 0);
  const editing = draft !== null || inviting;
  const conflict =
    error !== null && error !== undefined && decodeIpcError(error).code === 'conflict';
  const changedOutside = base !== null && text !== base.text && accepted !== text;

  /**
   * Der Hash, mit dem gespeichert wird.
   *
   * Steht in der Datei noch derselbe Abschnitt wie beim Öffnen, zählt der aktuelle
   * Hash: eine Coaching-Runde oder ein Tagesabschluss hat die Datei geändert, aber
   * nicht diesen Text — ein Konflikt wäre da reine Reibung. Hat sich der Abschnitt
   * selbst geändert, bleibt der eingefrorene Hash stehen: dann **muss** der
   * Schreibvorgang scheitern, statt fremden Text zu überschreiben.
   */
  const expected = base === null || base.text === text ? hash : base.hash;
  const frozen = expected.length > 0 ? expected : undefined;

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const start = (): void => {
    onReset();
    setAccepted(null);
    setStored({ draft: text, base: { text, hash } });
  };

  const stop = (): void => {
    setStored(null);
    setAccepted(null);
    onReset();
  };

  /* Das erste Zeichen im einladenden Feld friert ein, was dort vorher stand. */
  const type = (value: string): void => {
    setStored({ draft: value, base: stored?.base ?? { text, hash } });
  };

  const save = (expectedHash: string | undefined): void => {
    if (draft === null && !inviting) return;
    onSave(draft ?? '', expectedHash);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save(frozen);
      return;
    }
    if (event.key === 'Escape' && !inviting) {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  };

  if (!editing) {
    return (
      <div className="sb-daytext">
        {saved ? <p className="sb-note-line">{t('journal.day.saved')}</p> : null}
        {/* Ein Klick auf den Text öffnet ihn — deshalb ist der Text der Knopf. */}
        <button
          type="button"
          className="sb-daytext-view"
          aria-label={t('journal.day.edit')}
          onClick={start}
        >
          <Markdown text={text} className="sb-daytext-md" />
          <Icon name="pencil" size={14} className="sb-daytext-pen" />
        </button>
      </div>
    );
  }

  return (
    <div className="sb-daytext sb-daytext--editing">
      <label className="gs-label" htmlFor="sb-day-field">
        {inviting ? t('journal.day.ask') : t('journal.day.editLabel')}
      </label>
      <textarea
        id="sb-day-field"
        ref={field}
        className="gs-input sb-daytext-field"
        rows={inviting ? 4 : 8}
        placeholder={t('journal.day.placeholder')}
        value={draft ?? ''}
        onChange={(event) => type(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {/* Die Meldung steht zwischen Feld und Fußzeile, nicht darüber: wer unten
          klickt und oben eine Antwort bekommt, sieht keine. */}
      {conflict ? (
        <AlertCard
          title={t('journal.day.conflict.title')}
          body={t('journal.day.conflict.body')}
          nonce={attemptedAt}
        >
          <Button size="sm" icon="refresh-cw" onClick={onReload}>
            {t('journal.day.conflict.reload')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="pencil"
            loading={busy}
            onClick={() => save(undefined)}
          >
            {t('journal.day.conflict.overwrite')}
          </Button>
        </AlertCard>
      ) : error === null || error === undefined ? null : (
        <ErrorState error={error} variant="secondary" scrollIntoView />
      )}

      {changedOutside && !conflict ? (
        <AlertCard
          title={t('journal.day.external.title')}
          body={t('journal.day.external.body')}
          nonce={hash}
        >
          <Button
            size="sm"
            icon="refresh-cw"
            onClick={() => {
              setStored({ draft: text, base: { text, hash } });
              setAccepted(null);
              field.current?.focus();
            }}
          >
            {t('journal.day.external.take')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="pencil"
            onClick={() => {
              setAccepted(text);
              field.current?.focus();
            }}
          >
            {t('journal.day.external.keep')}
          </Button>
        </AlertCard>
      ) : null}

      <div className="sb-daytext-foot">
        <Button
          icon="check"
          loading={busy}
          disabled={(draft ?? '').trim().length === 0}
          onClick={() => save(frozen)}
        >
          {t('journal.day.save')}
        </Button>
        {inviting ? null : (
          <Button variant="ghost" onClick={stop}>
            {t('common.cancel')}
          </Button>
        )}
        {conflict ? (
          <span className="sb-pageedit-warn">{t('journal.day.unsaved')}</span>
        ) : (
          <span className="sb-capture-hint">
            <Kbd keys={['Ctrl', 'Enter']} />
            <span>{inviting ? t('journal.day.askHint') : t('journal.day.hint')}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Eine Meldung, die man nicht verpassen darf: sie rollt beim Erscheinen in den
 * Blick und meldet sich als `alert` an. `nonce` ist der Anlass — bleibt die Karte
 * stehen und wird nur erneut ausgelöst, rollt sie wieder.
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
