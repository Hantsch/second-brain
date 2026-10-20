/* "File as wiki page" — the path by which good questions feed back into the
   knowledge base.

   Without this step, every exploration disappears into the history
   (docs/MODULE-SCHEMA.md, "query" flow). So it's made visible and takes three
   steps: pick or create a knowledge module, check the title, file it.

   The dialog states beforehand what will be written — in words, not as a
   path: the file format belongs to the core, the renderer never builds vault
   paths. Afterward, the real path is shown, with an "open" action. */

import { useState } from 'react';
import type { ChatMessage, KnowledgeModule, WriteResult } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { Radio } from '../../atoms/Radio';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';

/** This is the max length a suggested title may have. */
const MAX_TITLE = 70;

/** Suggested title from the question: no question mark, truncated, otherwise unchanged. */
export function titleFromQuestion(question: string): string {
  const text = question
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?!.]+$/, '');
  if (text.length <= MAX_TITLE) return text;
  const cut = text.slice(0, MAX_TITLE);
  const space = cut.lastIndexOf(' ');
  return space > MAX_TITLE * 0.6 ? cut.slice(0, space) : cut;
}

export interface FileBackDialogProps {
  /** The answer being filed. `null` closes the dialog. */
  message: ChatMessage | null;
  question: string;
  modules: readonly KnowledgeModule[];
  busy: boolean;
  error: unknown;
  /** Result after writing — once set, the path is shown. */
  result: WriteResult | null;
  onSubmit: (input: { module: string; title: string }) => void;
  onOpen: (path: string) => void;
  onClose: () => void;
}

export function FileBackDialog({
  message,
  question,
  modules,
  busy,
  error,
  result,
  onSubmit,
  onOpen,
  onClose,
}: FileBackDialogProps) {
  const t = useT();
  const first = modules[0]?.slug ?? '';
  const [module, setModule] = useState(first);
  const [fresh, setFresh] = useState(modules.length === 0);
  const [name, setName] = useState('');
  const [title, setTitle] = useState(titleFromQuestion(question));

  if (message === null) return null;
  const target = fresh ? name.trim() : module;
  const shown = fresh ? name.trim() : (modules.find((entry) => entry.slug === module)?.title ?? '');
  const ready = target.length > 0 && title.trim().length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t('ask.fileBack.title')}
      description={t('ask.fileBack.body')}
      closeLabel={t('common.close')}
      footer={
        result === null ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              icon="book-open"
              loading={busy}
              disabled={!ready}
              onClick={() => onSubmit({ module: target, title: title.trim() })}
            >
              {t('ask.fileBack.confirm')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button icon="external-link" onClick={() => onOpen(result.path)}>
              {t('common.open')}
            </Button>
          </>
        )
      }
    >
      {result !== null ? (
        <div className="sb-fileback-done">
          <p className="sb-panel-empty">{t('ask.fileBack.done')}</p>
          <span className="sb-mono">{result.path}</span>
        </div>
      ) : (
        <div className="sb-fileback">
          <fieldset className="sb-fileback-modules">
            <legend className="gs-label">{t('ask.fileBack.module')}</legend>
            {modules.map((entry) => (
              <Radio
                key={entry.slug}
                name="sb-fileback-module"
                label={entry.title}
                checked={!fresh && module === entry.slug}
                onChange={() => {
                  setFresh(false);
                  setModule(entry.slug);
                }}
              />
            ))}
            <Radio
              name="sb-fileback-module"
              label={t('ask.fileBack.newModule')}
              checked={fresh}
              onChange={() => setFresh(true)}
            />
            {fresh ? (
              <Input
                autoFocus
                className="sb-fileback-name"
                aria-label={t('ask.fileBack.newModuleName')}
                placeholder={t('ask.fileBack.newModulePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            ) : null}
          </fieldset>

          <Input
            label={t('ask.fileBack.pageTitle')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <p className="sb-fileback-preview">
            {t('ask.fileBack.preview', {
              module: shown.length > 0 ? shown : t('ask.fileBack.newModule'),
              count: message.citations?.length ?? 0,
            })}
          </p>
          {error === null || error === undefined ? null : (
            <ErrorState error={error} variant="secondary" subject={title.trim()} />
          )}
        </div>
      )}
    </Dialog>
  );
}
