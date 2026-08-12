/* Anderes Ziel wählen: die Alternativen des Vorschlags als Liste, dazu ein
   Suchfeld für die freie Wahl.

   Gewählt wird ausschließlich aus fertigen Aktionen — Pfad und Text kommen aus
   dem Hauptprozess. Der Renderer baut keinen Vault-Pfad und kein Markdown; sonst
   stünde das Dateiformat an zwei Stellen.

   Der Name eines Ziels wird hier gebildet, weil er nur zur Anzeige dient: aus
   der Art, dem Pfad und — wenn der Index sie kennt — dem echten Titel des
   Projekts oder Moduls. */

import { useMemo, useRef, useState } from 'react';
import type { FilingAction, KnowledgeModule, Project } from '@shared/types';
import { Dialog } from '../atoms/Dialog';
import { Icon } from '../atoms/Icon';
import { t as translate, useT } from '../i18n';

/** Ab so vielen Zielen lohnt das Suchfeld. */
const SEARCH_FROM = 8;

export interface TargetNames {
  projects: readonly Project[];
  modules: readonly KnowledgeModule[];
}

/** Letzter Teil eines Pfades ohne Endung — `areas/gesundheit.md` → `gesundheit`. */
function leaf(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.md$/i, '');
}

/** Der Ordnername über der Datei — `projects/work/kundenportal/project.md`. */
function folder(path: string): string {
  const parts = path.split('/');
  return parts.length >= 2 ? (parts.at(-2) ?? leaf(path)) : leaf(path);
}

/** Aus einem Slug ein lesbares Wort machen, wenn kein Titel bekannt ist. */
function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.length === 0 ? slug : words.charAt(0).toUpperCase() + words.slice(1);
}

/** Der Name des Ziels: „Projekt Kundenportal Relaunch". Bereits übersetzt. */
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

/** Ziel samt Abschnitt: „Projekt Kundenportal Relaunch → Abschnitt Notizen". */
export function targetLabel(action: FilingAction, names: TargetNames): string {
  const name = targetName(action, names);
  if (action.section === null || action.section.length === 0) return name;
  return `${name} ${translate('inbox.target.section', { section: action.section })}`;
}

export interface TargetPickerProps {
  open: boolean;
  /** Alle wählbaren Ziele, in der Reihenfolge des Vorschlags. */
  actions: readonly FilingAction[];
  /** Was gerade gewählt ist — steht als solches gekennzeichnet in der Liste. */
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
