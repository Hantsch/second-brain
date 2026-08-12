/* A module's chronicle, rendered readably: date, kind, title, touched pages
   as references.

   `wiki/log.md` is append-only and only read here. What the display doesn't
   understand stays in the file — that's why the way to open it in the editor
   is shown below the list. */

import type { VaultDoc } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { fieldLabelKey, isRefField, parseLog, partsOf, refsOf } from './log';
import { WikiRef } from './WikiRef';

export interface ModuleLogProps {
  /** The chronicle as a document; `null` if it doesn't exist. */
  doc: VaultDoc | null | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  /** A reference was clicked. */
  onOpenTarget: (target: string) => void;
  /** Does this page exist? */
  exists: (target: string) => boolean;
}

export function ModuleLog({ doc, pending, error, onRetry, onOpenTarget, exists }: ModuleLogProps) {
  const t = useT();

  if (error !== null && error !== undefined) {
    return <ErrorState error={error} onRetry={onRetry} variant="secondary" />;
  }
  if (pending) return <Skeleton lines={4} height={40} />;
  if (doc === null || doc === undefined)
    return <p className="sb-panel-empty">{t('log.missing')}</p>;

  const entries = parseLog(doc.body);
  if (entries.length === 0) return <p className="sb-panel-empty">{t('log.empty')}</p>;

  return (
    <div className="sb-log">
      <ol className="sb-log-entries">
        {entries.map((entry, at) => (
          <li key={`${entry.day}-${at}`} className="sb-log-entry">
            <div className="sb-log-head">
              <span className="sb-log-day sb-mono">{entry.day}</span>
              <span className="sb-log-kind">{t(`log.kind.${entry.kind}`)}</span>
              {entry.title === null ? null : <span className="sb-log-title">{entry.title}</span>}
            </div>
            {entry.fields.length === 0 ? null : (
              <dl className="sb-log-fields">
                {entry.fields.map((field, index) => (
                  <div key={`${field.key}-${index}`} className="sb-log-field">
                    <dt className="sb-log-label">{t(fieldLabelKey(field.key))}</dt>
                    <dd className="sb-log-value">
                      {isRefField(field.key) ? (
                        <span className="sb-reflist">
                          {refsOf(field.value).map((ref, refAt) =>
                            ref.wiki ? (
                              <WikiRef
                                key={`${ref.target}-${refAt}`}
                                target={ref.target}
                                missing={!exists(ref.target)}
                                onOpen={onOpenTarget}
                              />
                            ) : (
                              <span key={`${ref.target}-${refAt}`} className="sb-mono">
                                {ref.target}
                              </span>
                            ),
                          )}
                        </span>
                      ) : (
                        <span>
                          {partsOf(field.value).map((part, partAt) =>
                            part.target === null ? (
                              <span key={`t${partAt}`}>{part.text}</span>
                            ) : (
                              <WikiRef
                                key={`w${partAt}`}
                                target={part.target}
                                label={part.text}
                                missing={!exists(part.target)}
                                onOpen={onOpenTarget}
                              />
                            ),
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ol>
      <Button
        variant="ghost"
        size="sm"
        icon="external-link"
        onClick={() => void api.shell.openPath(doc.path).catch(() => undefined)}
      >
        {t('common.openInEditor')}
      </Button>
    </div>
  );
}
