import { useState } from 'react';
import type { IngestJob, KnowledgeModule } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Select } from '../../atoms/Select';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { formatBytes, formatDate } from '../../lib/format';
import { isJobRunning, latestRefetchFor, runningJobFor } from '../../lib/jobs';
import { useIngestMutations, useSourceDetail } from '../../lib/queries/ingest';

export interface SourceDetailDialogProps {
  path: string | null;
  modules: readonly KnowledgeModule[];
  jobs: readonly IngestJob[];
  onClose: () => void;
  onOpenRaw: (path: string) => void;
  onOpenPage: (sourcePage: string, module: string) => void;
}

export function SourceDetailDialog({
  path,
  modules,
  jobs,
  onClose,
  onOpenRaw,
  onOpenPage,
}: SourceDetailDialogProps) {
  const t = useT();
  const language = useLanguage();
  const detail = useSourceDetail(path);
  const mutations = useIngestMutations();
  const [chosenModule, setChosenModule] = useState<string | null>(null);

  const source = detail.data?.source;
  const module = chosenModule ?? source?.modules[0] ?? '';

  const running = source === undefined ? null : runningJobFor(jobs, source.path);
  const condensed = source?.sourcePage !== null;
  const refetch = source === undefined ? null : latestRefetchFor(jobs, source.path);
  const refetching = refetch !== null && isJobRunning(refetch);
  const report = detail.data?.resourceReport ?? null;
  const attachments = detail.data?.attachments ?? [];
  const failure =
    mutations.condense.error ??
    mutations.refetch.error ??
    mutations.analyzeResources.error ??
    mutations.attachFiles.error ??
    null;

  const footer =
    source === undefined ? undefined : (
      <>
        <Button variant="ghost" size="sm" icon="folder-open" onClick={() => onOpenRaw(source.path)}>
          {t('sources.detail.folder')}
        </Button>
        {condensed && source.sourcePage !== null && source.modules[0] !== undefined ? (
          <Button
            variant="secondary"
            size="sm"
            icon="file-text"
            onClick={() => onOpenPage(source.sourcePage ?? '', source.modules[0] ?? '')}
          >
            {t('sources.detail.wikiPage')}
          </Button>
        ) : (
          <Button
            size="sm"
            icon="sparkles"
            disabled={module.length === 0 || running !== null}
            loading={mutations.condense.isPending}
            onClick={() => mutations.condense.mutate({ path: source.path, module })}
          >
            {running === null ? t('sources.detail.condense') : t('sources.detail.condensing')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      </>
    );

  return (
    <Dialog
      open={path !== null}
      onClose={onClose}
      title={source?.title ?? t('sources.detail.title')}
      description={source === undefined ? undefined : source.path}
      size="xl"
      closeLabel={t('common.close')}
      footer={footer}
    >
      {detail.error ? (
        <ErrorState
          error={detail.error}
          variant="secondary"
          onRetry={() => void detail.refetch()}
        />
      ) : detail.isPending || source === undefined ? (
        <Skeleton lines={5} height={36} />
      ) : (
        <div className="sb-source-detail">
          <section className="sb-source-detail-section">
            <div className="sb-source-detail-heading">
              <h3>{t('sources.detail.status')}</h3>
              <Badge variant={condensed ? 'success' : 'warning'}>
                {condensed ? t('sources.detail.condensed') : t('sources.list.uncondensed')}
              </Badge>
            </div>
            <dl className="sb-source-detail-facts">
              <dt>{t('sources.detail.kind')}</dt>
              <dd>{t(`sources.kind.${source.kind}`)}</dd>
              <dt>{t('sources.detail.ingested')}</dt>
              <dd>{formatDate(source.ingestedAt, language)}</dd>
              <dt>{t('sources.detail.origin')}</dt>
              <dd className="sb-mono">{source.origin ?? t('sources.detail.unknown')}</dd>
              <dt>{t('sources.detail.size')}</dt>
              <dd>{formatBytes(source.bytes, language)}</dd>
            </dl>
            {condensed ? null : (
              <Select
                label={t('sources.detail.targetModule')}
                value={module}
                onChange={(event) => setChosenModule(event.target.value)}
                options={modules.map((entry) => ({ value: entry.slug, label: entry.title }))}
                placeholder={t('sources.detail.chooseModule')}
                hint={t('sources.detail.targetHint')}
              />
            )}
          </section>

          {source.blocked === 'no-transcript' && !condensed ? (
            <section className="sb-source-detail-section">
              <div className="sb-source-detail-heading">
                <h3>{t('sources.detail.transcript')}</h3>
                <Badge variant="warning">{t('sources.stage.blocked.no-transcript')}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="refresh-cw"
                  disabled={running !== null}
                  loading={mutations.refetch.isPending || refetching}
                  onClick={() => mutations.refetch.mutate(source.path)}
                >
                  {refetching ? t('sources.detail.refetching') : t('sources.detail.refetch')}
                </Button>
              </div>
              <p className="sb-source-detail-empty">{t('sources.detail.refetchHint')}</p>
              {refetch?.stage === 'no-content' ? (
                <p className="sb-source-detail-empty">{t('sources.detail.refetchEmpty')}</p>
              ) : refetch?.stage === 'error' ? (
                <p className="sb-source-detail-empty">{t('sources.detail.refetchFailed')}</p>
              ) : null}
            </section>
          ) : null}

          {source.kind === 'youtube' ? (
            <section className="sb-source-detail-section">
              <div className="sb-source-detail-heading">
                <h3>{t('sources.detail.resources')}</h3>
                <Badge variant={report?.analyzedWithModel === true ? 'success' : 'neutral'}>
                  {report?.analyzedWithModel === true
                    ? t('sources.detail.resourcesChecked')
                    : t('sources.detail.linksOnly')}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="search"
                  loading={mutations.analyzeResources.isPending}
                  onClick={() => mutations.analyzeResources.mutate(source.path)}
                >
                  {t('sources.detail.checkResources')}
                </Button>
              </div>
              {report === null || report.resources.length === 0 ? (
                <p className="sb-source-detail-empty">{t('sources.detail.noResources')}</p>
              ) : (
                <ul className="sb-resource-list">
                  {report.resources.map((resource, index) => (
                    <li key={`${resource.name}-${resource.timestamp ?? index}`}>
                      <div className="sb-resource-title">
                        <strong>{resource.name}</strong>
                        <span className="sb-mono">
                          {resource.location === 'description'
                            ? t('sources.detail.inDescription')
                            : resource.timestamp === null
                              ? t('sources.detail.inVideo')
                              : t('sources.detail.inVideoAt', { time: resource.timestamp })}
                        </span>
                      </div>
                      <p>{resource.mention}</p>
                      {resource.links.map((link) => (
                        <button
                          type="button"
                          className="sb-textlink sb-resource-link"
                          key={link.url}
                          onClick={() =>
                            void api.shell.openExternal(link.url).catch(() => undefined)
                          }
                        >
                          {link.label ?? link.url}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              {report === null || report.descriptionLinks.length === 0 ? null : (
                <details className="sb-description-links">
                  <summary>
                    {t('sources.detail.descriptionLinks', {
                      count: report.descriptionLinks.length,
                    })}
                  </summary>
                  <ul>
                    {report.descriptionLinks.map((link) => (
                      <li key={link.url}>
                        <button
                          type="button"
                          className="sb-textlink"
                          onClick={() =>
                            void api.shell.openExternal(link.url).catch(() => undefined)
                          }
                        >
                          {link.label ?? link.url}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ) : null}

          {source.kind === 'youtube' ? (
            <section className="sb-source-detail-section">
              <div className="sb-source-detail-heading">
                <h3>{t('sources.detail.attachments')}</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  loading={mutations.attachFiles.isPending}
                  onClick={() => mutations.attachFiles.mutate(source.path)}
                >
                  {t('sources.detail.upload')}
                </Button>
              </div>
              {attachments.length === 0 ? (
                <p className="sb-source-detail-empty">{t('sources.detail.noAttachments')}</p>
              ) : (
                <ul className="sb-attachment-list">
                  {attachments.map((attachment) => (
                    <li key={attachment.path}>
                      <button
                        type="button"
                        className="sb-row-button"
                        onClick={() =>
                          void api.shell.openPath(attachment.path).catch(() => undefined)
                        }
                      >
                        <span>{attachment.name}</span>
                        <span className="sb-mono">
                          {attachment.directory
                            ? t('sources.detail.folderType')
                            : formatBytes(attachment.bytes, language)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="sb-source-detail-hint">{t('sources.detail.uploadHint')}</p>
            </section>
          ) : null}

          {failure === null ? null : <ErrorState error={failure} variant="secondary" />}
        </div>
      )}
    </Dialog>
  );
}
