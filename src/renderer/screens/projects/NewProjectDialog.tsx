/* Neues Projekt: Titel, Bereich, Status, optional der erste nächste Schritt.

   Der Dialog wird nur gerendert, wenn er offen ist: dann sind die Felder beim
   Öffnen leer, ohne dass ein Effekt sie zurücksetzen müsste.

   Er sagt, welche Datei entsteht — der Nutzer soll nicht raten, wo sein
   Projekt landet. Der Slug wird dabei genauso gebildet wie im Kern
   (klein, Bindestriche, Umlaute ausgeschrieben); er ist eine Vorschau, keine
   Zusage: geschrieben wird der Pfad, den der Hauptprozess bildet. */

import { useState } from 'react';
import type { ProjectStatus, Scope } from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { Select } from '../../atoms/Select';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

/* Kombinierende Diakritika. Als Konstruktor, damit im Quelltext kein
   kombinierendes Zeichen steht — es waere dort unsichtbar und zerbrechlich. */
const DIACRITICS = new RegExp('[\u0300-\u036f]', 'g');

/**
 * Vorschau des Dateinamens. Die Regel steht in `core/vault/slug` und gilt dort;
 * hier ist sie nachgebildet, weil der Renderer den Kern nicht kennt — deshalb
 * ist der Pfad eine Vorschau und keine Zusage.
 */
export function previewSlug(title: string): string {
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export interface NewProjectDialogProps {
  open: boolean;
  scope: Scope;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    scope: Scope;
    status: ProjectStatus;
    nextStep: string | null;
  }) => void;
}

export function NewProjectDialog({
  open,
  scope,
  busy,
  error,
  onClose,
  onCreate,
}: NewProjectDialogProps) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState<Scope>(scope);
  const [status, setStatus] = useState<ProjectStatus>('idea');
  const [step, setStep] = useState('');

  const slug = previewSlug(title);
  const ready = slug.length > 0;

  const submit = (): void => {
    if (!ready || busy) return;
    onCreate({
      title: title.trim(),
      scope: where,
      status,
      nextStep: step.trim().length === 0 ? null : step.trim(),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('projects.new.title')}
      description={t('projects.new.description')}
      size="lg"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button icon="folder-plus" disabled={!ready} loading={busy} onClick={submit}>
            {t('projects.new.submit')}
          </Button>
        </>
      }
    >
      <div className="sb-newproject">
        {error === null || error === undefined ? null : (
          <ErrorState error={error} variant="secondary" subject={title} />
        )}
        <Input
          label={t('projects.new.titleField')}
          placeholder={t('projects.new.titlePlaceholder')}
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <div className="sb-newproject-row">
          <Select
            label={t('projects.new.scopeField')}
            value={where}
            options={[
              { value: 'work', label: t('scope.work') },
              { value: 'private', label: t('scope.private') },
            ]}
            onChange={(event) => setWhere(event.target.value as Scope)}
          />
          <Select
            label={t('projects.new.statusField')}
            value={status}
            options={PROJECT_STATUSES.map((entry) => ({
              value: entry,
              label: t(`project.status.${entry}`),
            }))}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
          />
        </div>
        <Input
          label={t('projects.new.stepField')}
          placeholder={t('projects.new.stepPlaceholder')}
          hint={t('projects.new.stepHint')}
          value={step}
          onChange={(event) => setStep(event.target.value)}
        />
        <p className="sb-newproject-path sb-mono">
          {ready
            ? t('projects.new.pathHint', { path: `projects/${where}/${slug}/project.md` })
            : ''}
        </p>
      </div>
    </Dialog>
  );
}
