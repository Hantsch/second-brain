/* Der Abschnitt „Gespräch": die Runden bis hierher — Feld, Haltung und
 * Tagesabschluss stehen separat in `CoachComposer`, verankert am unteren Rand
 * der Detailspalte, nicht hier. Getrennt, weil ein direkter Nachfahre von
 * `.sb-dayentry` sein muss, was am Bildschirmrand kleben soll: verschachtelt
 * unter „Gespräch" wäre sein eigener Klebe-Rahmen nur der schmale Rest dieses
 * Abschnitts, nicht die ganze Detailspalte (siehe Kommentar in
 * `styles/app/journal.css`, Abschnitt „Composer, Haltung und Tagesabschluss").
 *
 * Drei Zustände, alle ausdrücklich:
 *
 * - **Läuft.** Die eigene Runde steht sofort da (sie ist geschrieben, bevor
 *   irgendein Modell gefragt wird), darunter wächst die Antwort.
 * - **Fertig.** Beide Runden kommen aus der Datei — der Puffer wird nicht mehr
 *   gebraucht.
 * - **Ohne Antwort.** Eine Feststellung mit Grund, kein simuliertes Mitgefühl. Im
 *   Modus „analysieren" darunter die früheren Stellen, die wirklich gefunden
 *   wurden, mit Sprung dorthin.
 * - **Leer.** Ein Satz, was hier entsteht.
 */

import { useNavigate } from 'react-router-dom';
import type { Citation } from '@shared/types';
import type { JournalTurn } from '@shared/ipc';
import { DialogTurn } from '../../components/DialogTurn';
import { useT } from '../../i18n';

/** Gründe, für die es einen eigenen Satz gibt (`LlmUnavailable.reason` plus Abbruch). */
const KNOWN_FAILURES: readonly string[] = [
  'no-route',
  'provider-disabled',
  'no-key',
  'unreachable',
  'error',
  'cancelled',
];

/** Der Weg in die Routing-Einstellung — dieselbe Adresse wie in `LlmMissing`. */
const ROUTING_ROUTE = '/settings?tab=models';

export interface CoachLive {
  /** Die eigene Runde dieser Fahrt, wörtlich wie abgeschickt. */
  message: string;
  /** Der Text, der bisher angekommen ist. */
  text: string;
  done: boolean;
  /** Grund, wenn keine Antwort kam. */
  error: string | null;
  /** Frühere Stellen als Belege (Modus „analysieren"). */
  citations: readonly Citation[];
}

export interface CoachPanelProps {
  /** Die Runden aus der Datei, älteste zuerst. */
  turns: readonly JournalTurn[];
  live: CoachLive | null;
  /** Sprung zu einem früheren Tag. */
  onOpenDay: (date: string) => void;
}

export function CoachPanel({ turns, live, onOpenDay }: CoachPanelProps) {
  const t = useT();
  const navigate = useNavigate();

  /* Die eigene Runde steht schon in der Datei, sobald der Tag neu geladen ist —
     bis dahin zeigt sie der Puffer. Zweimal wäre einmal zu viel. */
  const pendingUser =
    live === null || turns.some((turn) => turn.role === 'user' && turn.text === live.message)
      ? null
      : live.message;
  const failure = live?.error ?? null;
  const evidence = live?.citations ?? [];

  return (
    <section className="sb-coach" aria-label={t('journal.dialogue.title')}>
      <h3 className="sb-section-title">{t('journal.dialogue.title')}</h3>

      {turns.length === 0 && live === null ? (
        <p className="sb-panel-empty">{t('journal.dialogue.empty')}</p>
      ) : (
        <div className="sb-dialogue">
          {turns.map((turn, at) => (
            <DialogTurn key={`${turn.role}-${at}-${turn.at ?? ''}`} turn={turn} />
          ))}
          {pendingUser === null ? null : (
            <DialogTurn turn={{ role: 'user', text: pendingUser, at: null }} />
          )}
          {live === null || failure !== null ? null : (
            <DialogTurn
              turn={{ role: 'assistant', text: live.text, at: null }}
              streaming={!live.done}
            />
          )}

          {failure === null ? null : (
            <div className="sb-coach-failure" role="status">
              <p className="sb-turn-note">
                {t(`journal.failure.${KNOWN_FAILURES.includes(failure) ? failure : 'other'}`)}{' '}
                {failure === 'no-route' ||
                failure === 'no-key' ||
                failure === 'provider-disabled' ? (
                  <button
                    type="button"
                    className="sb-textlink"
                    onClick={() => void navigate(ROUTING_ROUTE)}
                  >
                    {t('llm.note.action')}
                  </button>
                ) : null}
              </p>
              {evidence.length === 0 ? null : (
                <div className="sb-evidence">
                  <span className="gs-overline">{t('journal.evidence.title')}</span>
                  <ul className="sb-evidence-list">
                    {evidence.map((citation) => (
                      <li key={citation.path}>
                        <button
                          type="button"
                          className="sb-evidence-item"
                          onClick={() => onOpenDay(citation.title)}
                        >
                          <span className="sb-mono sb-evidence-date">{citation.title}</span>
                          <span className="sb-evidence-quote">{citation.quote}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
