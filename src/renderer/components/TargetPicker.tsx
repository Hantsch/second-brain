/* Choosing a different target: the proposal's alternatives as a list, plus a
   search field for free choice.

   Selection happens exclusively from finished actions — path and text come
   from the main process. The renderer never builds a vault path or
   markdown; otherwise the file format would end up defined in two places.

   The name of a target is assembled here because it's for display only:
   from the kind, the path, and — when the index knows it — the real title
   of the project or module. */

import { useMemo, useRef, useState } from 'react';
import type { FilingAction, KnowledgeModule, Project } from '@shared/types';
import { Dialog } from '../atoms/Dialog';
import { Icon } from '../atoms/Icon';
import { t as translate, useT } from '../i18n';

/** From this many targets on, the search field pays off. */
const SEARCH_FROM = 8;

export interface TargetNames {
  projects: readonly Project[];
  modules: readonly KnowledgeModule[];
}

/** Last part of a path without extension — `areas/gesundheit.md` → `gesundheit`. */
function leaf(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.md$/i, '');
}

/** The folder name above the file — `projects/work/kundenportal/project.md`. */
function folder(path: string): string {
  const parts = path.split('/');
  return parts.length >= 2 ? (parts.at(-2) ?? leaf(path)) : leaf(path);
}

/** Turn a slug into a readable word when no title is known. */
function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.length === 0 ? slug : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The target's name: "Project Kundenportal Relaunch". Already translated. */
export function targetName(action: FilingAction, names: TargetNames): string {
  const kind = translate(`inbox.target.${action.target}`);
  if (action.target === 'inbox') return kind;
  if (action.target === 'journal') return `${kind} ${leaf(action.path)}`;
  if (action.target === 'project' || action.target === 'new-project') {
    const known = names.projects.find((project) => project.path === action.path);
    return `${kind} ${known?.title ?? humanize(folder(action.path))}`;
  }
  if (action.target === 'module') {
    const slug = folder(action.path);
    const known = names.modules.find((module) => module.slug === slug);
    return `${kind} ${known?.title ?? humanize(slug)}`;
  }
  return `${kind} ${humanize(leaf(action.path))}`;
}

/** Target including section: "Project Kundenportal Relaunch → Section Notes". */
export function targetLabel(action: FilingAction, names: TargetNames): string {
  const name = targetName(action, names);
  if (action.section === null || action.section.length === 0) return name;
  return `${name} ${translate('inbox.target.section', { section: action.section })}`;
}

export interface TargetPickerProps {
  open: boolean;
  /** All selectable targets, in the order of the proposal. */
  actions: readonly FilingAction[];
  /** What's currently selected — marked as such in the list. */
  current: FilingAction;
  names: TargetNames;
  onPick: (action: FilingAction) => void;
  onClose: () => void;
}

export function TargetPicker({
  open,
  actions,
  current,
  names,
  onPick,
  onClose,
}: TargetPickerProps) {
  const t = useT();
  const [needle, setNeedle] = useState('');
  const field = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () =>
      actions.map((action) => ({
        action,
        label: targetLabel(action, names),
        key: `${action.target}:${action.path}`,
      })),
    [actions, names],
  );

  const query = needle.trim().toLowerCase();
  const shown =
    query.length === 0
      ? entries
      : entries.filter(
          (entry) =>
            entry.label.toLowerCase().includes(query) ||
            entry.action.path.toLowerCase().includes(query),
        );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('inbox.picker.title')}
      description={t('inbox.picker.body')}
      size="lg"
      closeLabel={t('common.close')}
    >
      {entries.length >= SEARCH_FROM ? (
        <div className="gs-inputwrap sb-picker-search">
          <span className="gs-input-icon">
            <Icon name="search" size={15} />
          </span>
          <input
            ref={field}
            className="gs-input gs-input--withicon"
            type="text"
            autoFocus
            aria-label={t('inbox.picker.search')}
            placeholder={t('inbox.picker.search')}
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
          />
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="sb-picker-empty">{t('inbox.picker.empty')}</p>
      ) : (
        <ul className="sb-picker-list">
          {shown.map((entry) => {
            const active = entry.action.path === current.path;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  className="sb-picker-item"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onPick(entry.action)}
                >
                  <span className="sb-picker-name">{entry.label}</span>
                  <span className="sb-mono sb-picker-path">{entry.action.path}</span>
                  {active ? <Icon name="check" size={14} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
