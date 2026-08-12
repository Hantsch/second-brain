/* New project: title, scope, status, optionally the first next step.

   The dialog is only rendered when open: that way the fields are empty on
   open, without an effect having to reset them.

   It shows which file will be created — the user shouldn't have to guess
   where their project ends up. The slug is built exactly as in the core
   (lowercase, hyphens, umlauts spelled out); it's a preview, not a promise:
   what gets written is the path the main process builds. */

import { useState } from 'react';
import type { ProjectStatus, Scope } from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { Select } from '../../atoms/Select';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

/* Combining diacritics. As a constructor, so that no combining character
   appears in the source — it would be invisible and fragile there. */
const DIACRITICS = new RegExp('[\u0300-\u036f]', 'g');

/**
 * Preview of the file name. The rule lives in `core/vault/slug` and applies
 * there; here it's replicated because the renderer doesn't know the core —
 * that's why the path is a preview and not a promise.
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
