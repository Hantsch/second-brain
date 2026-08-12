/* Warte auf: wer, worauf, seit wann, bis wann.

   Überfälliges steht oben und ist rot — es ist der Grund, warum diese Liste
   existiert. „Erledigt" schreibt `resolved: true` ins Frontmatter; erledigte
   Einträge verschwinden danach aus der Liste, bleiben aber in der Datei stehen.
   Nichts wird gelöscht. */

import { Button } from '../atoms/Button';
import type { WaitingOn } from '@shared/types';
import { useLanguage, useT } from '../i18n';
import { dayDiff, formatDate } from '../lib/format';
import { DeadlineChip } from './DeadlineChip';

interface Row {
  entry: WaitingOn;
  /** Stelle in `waiting_on` — genau die braucht `projects:resolveWaiting`. */
  index: number;
  overdue: boolean;
}

export interface WaitingListProps {
  entries: readonly WaitingOn[];
  /** Für welchen Eintrag der Schreibvorgang läuft. */
  busyIndex?: number | null;
  onResolve: (index: number) => void;
  /** Das „heute" dieser Anzeige. Tests geben eine feste Zeit. */
  now?: Date;
}

/** Offene Einträge, Überfälliges zuerst, dann das Älteste. */
export function waitingRows(entries: readonly WaitingOn[], today: Date): Row[] {
  const rows: Row[] = [];
  for (const [index, entry] of entries.entries()) {
    if (entry.resolved === true) continue;
    const overdue =
      entry.due !== undefined && dayDiff(today, new Date(`${entry.due}T00:00:00`)) < 0;
    rows.push({ entry, index, overdue });
  }
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.entry.since.localeCompare(b.entry.since);
  });
}

export function WaitingListEmpty({ text }: { text: string }) {
  return <p className="sb-panel-empty">{text}</p>;
}

export function WaitingList({ entries, busyIndex = null, onResolve, now }: WaitingListProps) {
  const t = useT();
  const language = useLanguage();
  const today = now ?? new Date();
  const rows = waitingRows(entries, today);

  if (rows.length === 0) return <WaitingListEmpty text={t('project.waiting.empty')} />;

  return (
    <ul className="sb-waitlist">
      {rows.map(({ entry, index, overdue }) => (
        <li key={`${entry.who}-${index}`} className="sb-waitrow">
          <div className="sb-waitrow-main">
            <span className="sb-waitrow-who">
              {entry.who}
              {overdue ? (
                <span className="sb-waitrow-overdue">{t('project.waiting.overdue')}</span>
              ) : null}
            </span>
            {entry.what.length > 0 ? <span className="sb-waitrow-what">{entry.what}</span> : null}
            <span className="sb-waitrow-meta">
              <span className="sb-mono">
                {t('project.waiting.since', { date: formatDate(entry.since, language) })}
              </span>
              {entry.due === undefined ? null : <DeadlineChip date={entry.due} now={today} />}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon="check"
            loading={busyIndex === index}
            aria-label={t('project.waiting.resolveAria', { who: entry.who })}
            onClick={() => onResolve(index)}
          >
            {t('project.waiting.resolve')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
