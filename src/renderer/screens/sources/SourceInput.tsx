/* The inbox: a single field that detects on its own what's coming in.

   One field instead of four buttons — the user has a link on the clipboard and
   wants to get rid of it, not determine the source type first. What was
   detected is shown as a line below ("YouTube video detected") before
   anything happens.

   The target module is a dropdown with "file later" as the first entry:
   condensing needs a module, but the raw source doesn't. */

import { useId } from 'react';
import type { IngestKind, KnowledgeModule } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';
import { detectKind } from './detect';

export interface SourceInputProps {
  value: string;
  onChange: (value: string) => void;
  modules: readonly KnowledgeModule[];
  /** Selected target module, or null for "file later". */
  module: string | null;
  onModule: (module: string | null) => void;
  busy: boolean;
  onSubmit: (kind: IngestKind, input: string) => void;
  /** Open the file dialog. */
  onPickFiles: () => void;
}

/** Icon per detected kind — same mapping as in the source list. */
const ICONS: Record<IngestKind, string> = {
  youtube: 'download',
  url: 'globe',
  file: 'file-text',
  text: 'paperclip',
};

export function SourceInput({
  value,
  onChange,
  modules,
  module,
  onModule,
  busy,
  onSubmit,
  onPickFiles,
}: SourceInputProps) {
  const t = useT();
  const fieldId = useId();
  const moduleId = useId();
  const kind = detectKind(value);

  const submit = (): void => {
    if (kind === null || busy) return;
    onSubmit(kind, value.trim());
  };

  return (
    <div className="sb-sourceinput">
      <div className="gs-field">
        <label className="gs-label" htmlFor={fieldId}>
          {t('sources.input.label')}
        </label>
        <div className="gs-inputwrap">
          <textarea
            id={fieldId}
            className="gs-input sb-sourceinput-field"
            rows={3}
            placeholder={t('sources.input.placeholder')}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              /* Ctrl+Enter submits — same as everywhere else in this app. */
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <span className={`sb-detect${kind === null ? ' sb-detect--idle' : ''}`}>
          {kind === null ? null : <Icon name={ICONS[kind]} size={14} />}
          {kind === null ? t('sources.detect.empty') : t(`sources.detect.${kind}`)}
        </span>
      </div>

      <div className="sb-sourceinput-foot">
        <div className="gs-field sb-sourceinput-module">
          <label className="gs-label" htmlFor={moduleId}>
            {t('sources.input.module')}
          </label>
          <div className="gs-inputwrap">
            <select
              id={moduleId}
              className="gs-input gs-select"
              value={module ?? ''}
              onChange={(event) => onModule(event.target.value === '' ? null : event.target.value)}
            >
              <option value="">{t('sources.input.moduleLater')}</option>
              {modules.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.title}
                </option>
              ))}
            </select>
            <span className="gs-select-chevron">
              <Icon name="chevron-down" size={15} />
            </span>
          </div>
        </div>

        <div className="sb-sourceinput-actions">
          <Button icon="download" loading={busy} disabled={kind === null} onClick={submit}>
            {t('sources.input.submit')}
          </Button>
          <Button variant="secondary" icon="folder-open" onClick={onPickFiles}>
            {t('sources.input.files')}
          </Button>
        </div>
      </div>

      {module === null ? <p className="sb-note-line">{t('sources.input.moduleHint')}</p> : null}
    </div>
  );
}
