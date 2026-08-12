/* Der Eingang: ein Feld, das selbst erkennt, was hereinkommt.

   Ein Feld statt vier Knöpfen — der Nutzer hat einen Link in der Zwischenablage
   und will ihn loswerden, nicht erst die Quellenart bestimmen. Was erkannt wurde,
   steht als Zeile darunter („YouTube-Video erkannt"), bevor irgendetwas passiert.

   Das Zielmodul ist eine Auswahl mit „später einordnen" als erstem Eintrag: die
   Verdichtung braucht ein Modul, aber die Rohquelle nicht. */

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
  /** Gewähltes Zielmodul, oder null für „später einordnen". */
  module: string | null;
  onModule: (module: string | null) => void;
  busy: boolean;
  onSubmit: (kind: IngestKind, input: string) => void;
  /** Dateidialog öffnen. */
  onPickFiles: () => void;
}

/** Symbol je erkannter Art — dieselbe Zuordnung wie in der Quellenliste. */
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
              /* Ctrl+Enter schickt ab — wie überall in dieser App. */
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
