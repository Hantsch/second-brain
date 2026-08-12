/* Laufende und vergangene Aufträge.

   Jede Zeile sagt in Klartext, wo der Auftrag steht („Transcript geholt", „wird
   verdichtet"), und bietet genau die Wege, die es an dieser Stelle gibt:
   abbrechen, solange etwas läuft; wiederholen, wenn er stehengeblieben ist; den
   Weg zur Rohquelle und zur Wiki-Seite, wenn es sie gibt.

   Zwei Zustände sind eigene Aussagen und keine Fehler:
   - **awaiting-llm** — die Rohquelle liegt, die Verdichtung braucht ein Modell.
   - **aufgenommen ohne Modul** — so gewollt bei „später einordnen".
   Beide bekommen ihre zwei Wege, statt als halber Erfolg dazustehen. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IngestJob } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';

/** Der Modelle-Tab: dort wird die Route für „Quelle verdichten" gesetzt. */
const ROUTING_ROUTE = '/settings?tab=models';

/** Stufen, bei denen nichts mehr läuft — wie `TERMINAL_STAGES` im Kern. */
const TERMINAL: readonly IngestJob['stage'][] = ['done', 'error', 'awaiting-llm'];

/* `job.message` trägt entweder einen `IngestNoteCode` — dann gibt es einen Satz
   dazu — oder ein technisches Detail. Ein Detail als Key durchzuschieben ergäbe
   „ingest.note.ENOENT" auf dem Schirm. */
const NOTE_CODES: readonly string[] = [
  'pdf-not-read',
  'binary-not-read',
  'no-transcript',
  'partial-metadata',
  'ytdlp-missing',
  'content-truncated',
  'unsupported-content',
  'awaiting-llm',
];

export interface JobListProps {
  jobs: readonly IngestJob[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  /** Rohquelle im Ordner zeigen. */
  onOpenRaw: (path: string) => void;
  /** Zur Wiki-Seite springen (Pfad einer berührten Seite). */
  onOpenPage: (path: string) => void;
}

function percent(job: IngestJob): number {
  return Math.max(0, Math.min(100, Math.round(job.progress * 100)));
}

/** Die erste berührte Seite ist die Source-Seite — der Weg ins Wiki. */
function firstPage(job: IngestJob): string | null {
  return job.touchedPages[0] ?? null;
}

function JobRow({
  job,
  onCancel,
  onRetry,
  onOpenRaw,
  onOpenPage,
}: JobListProps & { job: IngestJob }) {
  const t = useT();
  /** Ein Hinweis als Satz, ein Detail als Detail. */
  const note = (message: string): string =>
    NOTE_CODES.includes(message) ? t(`ingest.note.${message}`) : message;
  const navigate = useNavigate();
  const [details, setDetails] = useState(false);
  const running = !TERMINAL.includes(job.stage);
  const page = firstPage(job);
  const unfiled = job.stage === 'done' && job.module === null && job.touchedPages.length === 0;

  return (
    <li className="sb-job">
      <div className="sb-job-head">
        <span className="sb-job-label">{job.label}</span>
        <Badge
          variant={job.stage === 'error' ? 'danger' : job.stage === 'done' ? 'success' : 'neutral'}
        >
          {t(`sources.stage.${job.stage}`)}
        </Badge>
        <span className="sb-job-meta sb-mono">
          {t(`sources.kind.${job.kind}`)}
          {' · '}
          {job.module === null
            ? t('sources.job.noModule')
            : t('sources.job.module', { module: job.module })}
        </span>
        {running ? <span className="sb-job-percent sb-mono">{percent(job)} %</span> : null}
      </div>

      {running ? (
        <div
          className="sb-job-bar"
          role="progressbar"
          aria-label={t(`sources.stage.${job.stage}`)}
          aria-valuenow={percent(job)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="sb-job-fill" style={{ width: `${percent(job)}%` }} />
        </div>
      ) : null}

      {job.stage === 'error' ? (
        <div className="sb-job-note sb-job-note--error">
          <span>{t(`error.code.${job.error ?? 'unknown'}`)}</span>
          <button type="button" className="sb-textlink" onClick={() => setDetails((open) => !open)}>
            {details ? t('error.detailsHide') : t('error.details')}
          </button>
          {details && job.message !== null ? (
            <span className="sb-note-detail">{note(job.message)}</span>
          ) : null}
        </div>
      ) : null}

      {job.stage === 'awaiting-llm' ? (
        <div className="sb-job-note">
          <strong className="sb-job-notetitle">{t('sources.awaiting.title')}</strong>
          <span>{t('sources.awaiting.body')}</span>
          {job.message === null ? null : <span className="sb-note-line">{note(job.message)}</span>}
          <span className="sb-job-ways">
            <Button
              variant="secondary"
              size="sm"
              icon="sliders-horizontal"
              onClick={() => void navigate(ROUTING_ROUTE)}
            >
              {t('sources.awaiting.model')}
            </Button>
            {job.rawPath === null ? null : (
              <Button
                variant="ghost"
                size="sm"
                icon="folder-open"
                onClick={() => onOpenRaw(job.rawPath ?? '')}
              >
                {t('sources.job.raw')}
              </Button>
            )}
          </span>
        </div>
      ) : null}

      {unfiled ? (
        <div className="sb-job-note">
          <strong className="sb-job-notetitle">{t('sources.unfiled.title')}</strong>
          <span>{t('sources.unfiled.body')}</span>
        </div>
      ) : null}

      <div className="sb-job-actions">
        {running ? (
          <Button variant="ghost" size="sm" icon="x" onClick={() => onCancel(job.id)}>
            {t('sources.job.cancel')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" icon="refresh-cw" onClick={() => onRetry(job.id)}>
            {t('sources.job.retry')}
          </Button>
        )}
        {job.rawPath === null || job.stage === 'awaiting-llm' ? null : (
          <Button
            variant="ghost"
            size="sm"
            icon="folder-open"
            onClick={() => onOpenRaw(job.rawPath ?? '')}
          >
            {t('sources.job.raw')}
          </Button>
        )}
        {page === null ? null : (
          <Button variant="ghost" size="sm" icon="file-text" onClick={() => onOpenPage(page)}>
            {t('sources.job.page')}
          </Button>
        )}
        {job.touchedPages.length === 0 ? null : (
          <span className="sb-job-meta sb-mono">
            {t('sources.job.pages', { count: job.touchedPages.length })}
          </span>
        )}
      </div>
    </li>
  );
}

export function JobList(props: JobListProps) {
  const t = useT();
  if (props.jobs.length === 0) return <p className="sb-panel-empty">{t('sources.jobs.empty')}</p>;
  /* Jüngster oben: der Auftrag, den man gerade angestoßen hat, ist der wichtige. */
  const ordered = [...props.jobs].reverse();
  return (
    <ul className="sb-joblist">
      {ordered.map((job) => (
        <JobRow key={job.id} {...props} job={job} />
      ))}
    </ul>
  );
}
