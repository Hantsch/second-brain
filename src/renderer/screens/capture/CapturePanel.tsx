/* Capture — one field, one question, one button, as a reusable panel body.

   This body is the app's reason for existing: under two seconds from
   "thought" to "saved". So focus lands in the field on mount, Ctrl+Enter
   files it, and afterward the field is empty, focused, and ready for the
   next thought — several dumps in a row go by without a single mouse
   click.

   No form: scope and tags are two calm offers in the footer, not required
   fields. Whoever doesn't touch them loses nothing — filing happens later,
   as a proposal one confirms.

   Why this is a component and not a screen: whoever hosts this body brings its
   own chrome. Today that host is the shell's capture overlay behind
   `#/capture`; the standalone quick-capture window deliberately keeps its own,
   smaller body (`screens/quick-capture/QuickCapture.tsx`) and stays untouched
   by anything here. The panel therefore renders no `ScreenHeader` and no chrome
   of its own, only the field, its footer and what follows from saving. */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DumpItem, Scope } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Kbd } from '../../atoms/Kbd';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { useCaptureMutations, useCaptureSettings, useProposal } from '../../lib/queries/capture';
import { useTaskRouted } from '../../lib/queries/llm';

/** The scope stays open as long as nobody sets it. */
const SCOPES: readonly (Scope | 'open')[] = ['open', 'work', 'private'];

/** Tags are separated by comma or whitespace. */
function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Escape without a host to hand it to: focus moves to the active rail entry. */
function focusRail(): void {
  document.querySelector<HTMLElement>('.sb-rail-item[aria-current="page"]')?.focus();
}

export interface CapturePanelProps {
  /** What happens after Escape left the field. Default: focus the rail. */
  onEscape?: () => void;
}

export function CapturePanel({ onEscape }: CapturePanelProps = {}) {
  const t = useT();
  const navigate = useNavigate();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<Scope | 'open'>('open');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState<DumpItem | null>(null);
  const mutations = useCaptureMutations();
  const settings = useCaptureSettings();
  const modelRouted = useTaskRouted('classify-dump');
  /* The same query as in the inbox (`useProposal`), on the same cache — no
     second model call, just a second observer. Without a trigger (no saved
     dump, or the setting is off), it stays inactive: otherwise "create
     proposal" would fire exactly where nobody wanted it. */
  const proposal = useProposal(
    saved !== null && settings?.autoClassify === true ? saved.path : null,
  );

  useEffect(() => {
    field.current?.focus();
  }, []);

  const save = (): void => {
    const content = text.trim();
    if (content.length === 0 || mutations.dump.isPending) return;
    mutations.dump.mutate(
      {
        text: content,
        origin: 'window',
        tags: parseTags(tags),
        scope: scope === 'open' ? null : scope,
      },
      {
        onSuccess: (dump) => {
          setText('');
          setSaved(dump);
          /* Focus stays where it was — the next thought needs no mouse. */
          field.current?.focus();
        },
      },
    );
  };

  /* Undo here means: the file moves to trash and the thought sits back in
     the field — not "saved somewhere, but gone". */
  const undoSave = (): void => {
    if (saved === null) return;
    const dump = saved;
    mutations.discard.mutate(dump.path, {
      onSuccess: () => {
        setText(dump.text);
        setSaved(null);
        field.current?.focus();
      },
    });
  };

  return (
    <>
      <Card padded={false} className="sb-capture">
        <label className="sb-capture-ask" htmlFor="sb-capture-field">
          {t('capture.ask')}
        </label>
        <textarea
          id="sb-capture-field"
          ref={field}
          className="sb-dumpfield"
          placeholder={t('capture.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (saved !== null) setSaved(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              save();
              return;
            }
            /* Esc used to not leave the field — focus stayed put, with no
               way back except the mouse. The draft stays as it is, only
               focus moves on: to the active rail entry, or wherever the
               host that passed `onEscape` sends it. */
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
              if (onEscape === undefined) focusRail();
              else onEscape();
            }
          }}
        />
        <div className="sb-capture-foot">
          <span className="sb-mono sb-capture-count">
            {t('capture.count', { chars: text.length, words: countWords(text) })}
          </span>

          <span className="sb-capture-choice">
            <label className="gs-label" htmlFor="sb-capture-scope">
              {t('capture.scope')}
            </label>
            <span className="gs-inputwrap">
              <select
                id="sb-capture-scope"
                className="gs-input gs-select sb-capture-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as Scope | 'open')}
              >
                {SCOPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === 'open' ? t('capture.scopeOpen') : t(`scope.${entry}`)}
                  </option>
                ))}
              </select>
              <span className="gs-select-chevron">
                <Icon name="chevron-down" size={15} />
              </span>
            </span>
          </span>

          <span className="sb-capture-choice">
            <label className="gs-label" htmlFor="sb-capture-tags">
              {t('capture.tags')}
            </label>
            <input
              id="sb-capture-tags"
              type="text"
              className="gs-input sb-capture-tagfield"
              placeholder={t('capture.tagsPlaceholder')}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </span>

          <span className="sb-capture-save">
            <Button
              icon="zap"
              loading={mutations.dump.isPending}
              disabled={text.trim().length === 0}
              onClick={save}
            >
              {t('capture.save')}
            </Button>
            <span className="sb-capture-hint">
              <Kbd keys={['Ctrl', 'Enter']} />
            </span>
          </span>
        </div>
        <p className="sb-capture-keys">
          <Kbd>Esc</Kbd>
          <span>{t('capture.hintEscape')}</span>
          <Kbd keys={['Ctrl', 'K']} />
          <span>{t('capture.hintPalette')}</span>
        </p>
      </Card>

      {mutations.dump.error ? (
        <ErrorState error={mutations.dump.error} onRetry={save} scrollIntoView />
      ) : null}

      {saved !== null ? (
        <div className="sb-savedbox" role="status">
          <p className="sb-capture-saved">
            <Icon name="circle-check-big" size={16} />
            <span>{t('capture.saved')}</span>
            <span className="sb-mono">{saved.path}</span>
            <button type="button" className="sb-textlink" onClick={undoSave}>
              {t('capture.undo')}
            </button>
            <button type="button" className="sb-textlink" onClick={() => void navigate('/inbox')}>
              {t('capture.toInbox')}
            </button>
          </p>
          {/* Bound to the process, not the setting: "being created" used to
              show unchanged whether the proposal was already sitting in
              the cache or still running. On failure, the existing toast
              (`toast.classifyFailed`) reports that — nothing is doubled
              here. */}
          {settings?.autoClassify === true && proposal.error === null ? (
            <p className="sb-capture-strip">
              <Icon name="sparkles" size={14} />
              <span>
                {proposal.isPending
                  ? t('capture.classifying')
                  : modelRouted === true
                    ? t('capture.classified')
                    : t('inbox.proposal.heuristic')}
              </span>
              {proposal.isPending ? null : (
                <button
                  type="button"
                  className="sb-textlink"
                  onClick={() => void navigate('/inbox')}
                >
                  {t('capture.toProposal')}
                </button>
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
