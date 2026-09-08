/* Running and past ingest jobs.

   Every row states in plain language where the job stands ("transcript
   fetched", "condensing"), and offers exactly the actions available at that
   point: cancel while something is running; retry if it got stuck; a link to
   the raw source and to the wiki page, if either exists.

   Two states are their own statements, not errors:
   - **awaiting-llm** — the raw source is filed, condensing needs a model.
   - **ingested without a module** — intentional, from "file later".
   Both get their own paths forward instead of standing as a half-success. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IngestJob } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';
import { isJobRunning } from '../../lib/jobs';

/** The models tab: the route for "condense source" is set there. */
const ROUTING_ROUTE = '/settings?tab=models';

/* `job.message` either carries an `IngestNoteCode` — in which case there's a
   sentence for it — or a technical detail. Passing a detail through as a key
   would produce "ingest.note.ENOENT" on screen. */
const NOTE_CODES: readonly string[] = [
  'pdf-not-read',
  'binary-not-read',
  'no-transcript',
  'partial-metadata',
  'ytdlp-missing',
  'content-truncated',
  'unsupported-content',
  'awaiting-llm',
  'already-condensed',
  'no-content',
];

export interface JobListProps {
  jobs: readonly IngestJob[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  /** Re-run a duplicate job on purpose, bypassing the duplicate check. */
  onIngestAgain: (id: string) => void;
  /** A re-ingest is already in flight — disable "ingest again" everywhere so a
   * second click can't race the first for the same new raw path. Coarse on
   * purpose: it gates the whole list, not just the row that was clicked. */
  ingestAgainPending: boolean;
  /** Show the raw source in its folder. */
  onOpenRaw: (path: string) => void;
  /** Jump to the wiki page (path of a touched page). */
  onOpenPage: (path: string) => void;
}

function percent(job: IngestJob): number {
  return Math.max(0, Math.min(100, Math.round(job.progress * 100)));
}

/** The first touched page is the source page — the entry point into the wiki. */
function firstPage(job: IngestJob): string | null {
  return job.touchedPages[0] ?? null;
}

function JobRow({
  job,
  onCancel,
  onRetry,
  onIngestAgain,
  ingestAgainPending,
  onOpenRaw,
  onOpenPage,
}: JobListProps & { job: IngestJob }) {
  const t = useT();
  /** A note as a sentence, a detail as a detail. */
  const note = (message: string): string =>
    NOTE_CODES.includes(message) ? t(`ingest.note.${message}`) : message;
  const navigate = useNavigate();
  const [details, setDetails] = useState(false);
  const running = isJobRunning(job);
  const page = firstPage(job);
  const unfiled = job.stage === 'done' && job.module === null && job.touchedPages.length === 0;
  const condensedTwice = job.message === 'already-condensed';
  /* Repeating a finished run would condense the same source a second time — the
     queue stops that, so the button isn't offered here either. Only a run that
     didn't get there can be repeated. */
  const retryable = job.stage === 'error' || job.stage === 'awaiting-llm';

  return (
    <li className="sb-job">
      <div className="sb-job-head">
        <span className="sb-job-label">{job.label}</span>
        <Badge
          variant={
            job.stage === 'error'
              ? 'danger'
              : job.stage === 'done'
                ? 'success'
                : job.stage === 'duplicate' || job.stage === 'no-content'
                  ? 'warning'
                  : 'neutral'
          }
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

      {job.stage === 'no-content' ? (
        <div className="sb-job-note">
          <strong className="sb-job-notetitle">{t('sources.noContent.title')}</strong>
          <span>{t('sources.noContent.body')}</span>
          {job.message === null ? null : <span className="sb-note-line">{note(job.message)}</span>}
        </div>
      ) : null}

      {unfiled ? (
        <div className="sb-job-note">
          <strong className="sb-job-notetitle">{t('sources.unfiled.title')}</strong>
          <span>{t('sources.unfiled.body')}</span>
        </div>
      ) : null}

      {job.stage === 'duplicate' ? (
        <div className="sb-job-note">
          <strong className="sb-job-notetitle">
            {t(condensedTwice ? 'sources.duplicate.condensedTitle' : 'sources.duplicate.title')}
          </strong>
          <span>
            {condensedTwice ? t('ingest.note.already-condensed') : t('sources.duplicate.body')}
          </span>
          {job.duplicateOf === null || job.duplicateOf === undefined ? null : (
            <span className="sb-mono">{job.duplicateOf}</span>
          )}
        </div>
      ) : null}

      <div className="sb-job-actions">
        {running ? (
          <Button variant="ghost" size="sm" icon="x" onClick={() => onCancel(job.id)}>
            {t('sources.job.cancel')}
          </Button>
        ) : retryable ? (
          <Button variant="ghost" size="sm" icon="refresh-cw" onClick={() => onRetry(job.id)}>
            {t('sources.job.retry')}
          </Button>
        ) : null}
        {job.stage === 'duplicate' ? (
          <Button
            variant="ghost"
            size="sm"
            icon="refresh-cw"
            disabled={ingestAgainPending}
            onClick={() => onIngestAgain(job.id)}
          >
            {t('sources.duplicate.again')}
          </Button>
        ) : null}
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
  /* Newest on top: the job you just kicked off is the one that matters. */
  const ordered = [...props.jobs].reverse();
  return (
    <ul className="sb-joblist">
      {ordered.map((job) => (
        <JobRow key={job.id} {...props} job={job} />
      ))}
    </ul>
  );
}
