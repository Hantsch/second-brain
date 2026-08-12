/* Das Feld, in dem der Tag entsteht: Vertraulichkeitszeile, Composer mit
 * Haltung — im breiten Fenster als ein Block am unteren Rand der Detailspalte
 * verankert (`position: sticky`, `styles/app/journal.css`), samt „Tag
 * abschließen" (`footerAction`) direkt daneben.
 *
 * Ein eigener Baustein statt ein Teil von `CoachPanel`, aus genau einem Grund:
 * `position: sticky` klebt nur innerhalb der Box, die dieses Element umgibt
 * (seines nächsten block-bildenden Vorfahren) — nicht am ganzen Rollbereich.
 * Als Nachfahre von `.sb-coach` wäre dieser Rahmen nur der schmale Rest des
 * Gesprächsabschnitts gewesen, tief unten auf der Seite, ohne Spielraum nach
 * oben. Als direkter Nachfahre von `.sb-dayentry` (siehe `DayEntry.tsx`) ist
 * der Rahmen die ganze Detailspalte — das Feld erreicht so den unteren Rand
 * des Fensters, ohne dass jemand scrollen muss.
 *
 * Im engen Fenster (≤ 1200 px) trägt der Tag eigene Reiter „Tag" und
 * „Gespräch" (siehe `DayEntry.tsx`, `styles/app/journal.css`): dort lebt
 * dieser Baustein allein im Reiter „Gespräch", ohne `footerAction` — „Tag
 * abschließen" steht dort stattdessen neben den Fakten im Reiter „Tag"
 * (`JournalScreen.tsx` entscheidet anhand der Fensterbreite, wohin der eine
 * Knopf geht; verdoppelt wird er nirgends). Das Kleben braucht der Composer
 * dort ohnehin nicht mehr: sein Reiter zeigt nichts außer dem Verlauf über
 * ihm, und er ist als letztes, nicht wachsendes Element seiner eigenen,
 * begrenzten Spalte ohnehin immer im Fenster.
 */

import type { RefObject } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CoachMode } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { ChatComposer } from '../../components/ChatComposer';
import { CoachModeSwitch } from '../../components/CoachModeSwitch';
import { useT } from '../../i18n';
import type { CoachRoute } from '../../lib/queries/journal';

/** Der Weg in die Routing-Einstellung — dieselbe Adresse wie in `LlmMissing`. */
const ROUTING_ROUTE = '/settings?tab=models';

export interface CoachComposerProps {
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  busy: boolean;
  mode: CoachMode;
  onMode: (mode: CoachMode) => void;
  route: CoachRoute;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /** „Tag abschließen" — nur im breiten Fenster (`JournalScreen.tsx` reicht sie
      dort und nur dort durch): sie steht neben dem Sendeknopf, damit beide
      Aktionen, die den Tag betreffen, gemeinsam am unteren Rand der
      Detailspalte stehen und nie unter den sichtbaren Rand rutschen
      (dasselbe Anker-Muster wie die Aktionsleiste der Inbox). Im engen
      Fenster steht derselbe Knopf stattdessen bei den Fakten im Reiter „Tag"
      (`DayEntry.tsx`) — hier bleibt die Stelle dann leer. */
  footerAction?: ReactNode;
}

export function CoachComposer({
  draft,
  onDraft,
  onSend,
  onCancel,
  busy,
  mode,
  onMode,
  route,
  fieldRef,
  footerAction,
}: CoachComposerProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="sb-journal-footer">
      {/* Eine Tatsache in einer Zeile, direkt über dem Feld. Solange die
          Route unbekannt ist, steht hier nichts: eine Zusage über
          Vertraulichkeit darf nicht auf einer Annahme stehen. */}
      {route.routed === undefined ? null : (
        <p className="sb-privacy">
          <Icon name={route.local ? 'sprout' : 'globe'} size={13} />
          {route.routed && route.local ? (
            <span>{t('journal.privacy.local')}</span>
          ) : route.routed ? (
            <>
              <span>{t('journal.privacy.remote', { provider: route.provider ?? '' })}</span>
              <button
                type="button"
                className="sb-textlink"
                onClick={() => void navigate(ROUTING_ROUTE)}
              >
                {t('journal.privacy.action')}
              </button>
            </>
          ) : (
            <>
              <span>{t('journal.privacy.none')}</span>
              <button
                type="button"
                className="sb-textlink"
                onClick={() => void navigate(ROUTING_ROUTE)}
              >
                {t('llm.note.action')}
              </button>
            </>
          )}
        </p>
      )}

      <ChatComposer
        value={draft}
        onChange={onDraft}
        onSubmit={onSend}
        onCancel={onCancel}
        busy={busy}
        fieldId="sb-journal-field"
        fieldRef={fieldRef}
        texts={{
          label: t('journal.field.label'),
          placeholder: t('journal.field.placeholder'),
          hintSend: t('journal.field.hintSend'),
          send: t('journal.send'),
          cancel: t('common.cancel'),
        }}
        /* Die Haltung sitzt in der Fußzeile des Feldes: man muss wissen, mit
           wem man spricht, während man tippt. */
        extra={<CoachModeSwitch value={mode} onChange={onMode} disabled={busy} />}
      />

      {footerAction === undefined ? null : (
        <div className="sb-journal-footer-close">{footerAction}</div>
      )}
    </div>
  );
}
