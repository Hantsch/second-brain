/* The day close as a card on the day itself (018) — not a dialog.
 *
 * Same content as the old `CloseDialog` (todos with target labels, a
 * `DueField` per todo, a frontmatter fieldset, the heuristic hint), but it
 * sits next to the day's text instead of covering it: the point of this
 * story is that the user can check a finding against what they wrote
 * without losing sight of it behind a modal.
 *
 * State moved out of the component and into `close-proposal.ts` (D1) — a
 * session-scoped store keyed by date. That's what makes this a card and not
 * a dialog: nothing here needs to survive only as long as a mount, and
 * nothing here needs a focus trap to protect state that would otherwise be
 * lost on an accidental click outside.
 *
 * Three actions, none of them the screen's teal: the day screen's focal
 * point is the composer's send button, so "apply" here stays secondary.
 * Writing (`onApply`), discarding (`onDiscard`) and re-running the close
 * (`onRunAgain`) are exposed as props — D3 wires them to the vault and to
 * `close-proposal.ts`'s `clear`. */

import type { ReactNode } from 'react';
import type { JournalCloseSuggestion } from '@shared/ipc';
import type { Project, ProposedTodo, WaitingOn } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Checkbox } from '../../atoms/Checkbox';
import { Icon } from '../../atoms/Icon';
import { Select } from '../../atoms/Select';
import { Tag } from '../../atoms/Tag';
import { DueField } from '../../components/DueField';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { useAreas } from '../../lib/queries/areas';
import type { CloseProposalEdits } from '../../lib/close-proposal';
import { useCloseProposal, patch } from '../../lib/close-proposal';

/** A waiting-on is noted as a todo with `@wait:` — every editor recognizes that. */
function asTodo(entry: WaitingOn, scope: ProposedTodo['scope']): ProposedTodo {
  return {
    text: entry.what.trim().length === 0 ? entry.who : entry.what,
    scope,
    due: entry.due ?? null,
    waitingFor: entry.who,
    priority: 0,
    project: null,
  };
}

interface Row {
  todo: ProposedTodo;
  keep: boolean;
  /** Arose from a waiting-on — the card says so. */
  waiting: boolean;
}

/** Builds the display rows from the suggestion plus the edits made so far —
 * indices line up with `CloseProposalEdits.keepTodo` / `.dueTodo`: todos
 * first, then the waiting-on entries appended after them. */
function rowsOf(suggestion: JournalCloseSuggestion, edits: CloseProposalEdits): Row[] {
  const base: ProposedTodo[] = [
    ...suggestion.proposal.todos,
    ...suggestion.proposal.waitingOn.map((entry) => asTodo(entry, suggestion.proposal.scope)),
  ];
  return base.map((todo, index) => {
    const due = index in edits.dueTodo ? (edits.dueTodo[index] ?? null) : todo.due;
    return {
      todo: { ...todo, due },
      keep: edits.keepTodo[index] !== false,
      waiting: index >= suggestion.proposal.todos.length,
    };
  });
}

export interface CloseProposalProps {
  date: string;
  /** For reporting which project file a todo goes into. */
  projects: readonly Project[];
  busy: boolean;
  error: unknown;
  onApply: (request: {
    todos: ProposedTodo[];
    frontmatter: JournalCloseSuggestion['frontmatter'];
  }) => void;
  onDiscard: () => void;
  onRunAgain: () => void;
}

export function CloseProposal({
  date,
  projects,
  busy,
  error,
  onApply,
  onDiscard,
  onRunAgain,
}: CloseProposalProps) {
  const t = useT();
  const entry = useCloseProposal(date);
  const availableAreas = useAreas().data ?? [];

  if (entry === undefined) return null;
  const { suggestion, edits } = entry;
  const rows = rowsOf(suggestion, edits);
  const keeps = (key: string): boolean => edits.keepField[key] !== false;
  const areas = edits.areas ?? suggestion.frontmatter.areas;

  const patchTodo = (at: number, next: Partial<Pick<Row, 'keep' | 'todo'>>): void => {
    if ('keep' in next && next.keep !== undefined) {
      patch(date, { keepTodo: { ...edits.keepTodo, [at]: next.keep } });
    }
    if ('todo' in next && next.todo !== undefined) {
      patch(date, { dueTodo: { ...edits.dueTodo, [at]: next.todo.due } });
    }
  };

  const setField = (key: string, keep: boolean): void => {
    patch(date, { keepField: { ...edits.keepField, [key]: keep } });
  };

  const targetOf = (todo: ProposedTodo): string => {
    const own =
      todo.project === null ? null : projects.find((project) => project.slug === todo.project);
    return own === undefined || own === null
      ? t('journal.close.target.day')
      : t('journal.close.target.project', { title: own.title });
  };

  const frontmatter: JournalCloseSuggestion['frontmatter'] = {
    people: keeps('people') ? suggestion.frontmatter.people : [],
    projects: keeps('projects') ? suggestion.frontmatter.projects : [],
    areas,
    tags: keeps('tags') ? suggestion.frontmatter.tags : [],
    mood: keeps('mood') ? suggestion.frontmatter.mood : null,
    energy: keeps('energy') ? suggestion.frontmatter.energy : null,
  };
  const chosen = rows.filter((row) => row.keep).map((row) => row.todo);
  /* A button that writes nothing says so beforehand — instead of implying a
     confirmation for a write that never happened. */
  const writes =
    chosen.length > 0 ||
    frontmatter.people.length > 0 ||
    frontmatter.projects.length > 0 ||
    frontmatter.areas.length > 0 ||
    frontmatter.tags.length > 0 ||
    frontmatter.mood !== null ||
    frontmatter.energy !== null;

  /* A heading over an empty list implies there's something there. */
  const hasFields =
    suggestion.frontmatter.people.length > 0 ||
    suggestion.frontmatter.projects.length > 0 ||
    suggestion.frontmatter.tags.length > 0 ||
    suggestion.frontmatter.mood !== null ||
    suggestion.frontmatter.energy !== null;

  const fieldRow = (key: string, label: string, value: string): ReactNode => (
    <li className="sb-todoedit-row" key={key}>
      <Checkbox
        checked={keeps(key)}
        label={label}
        onChange={(event) => setField(key, event.target.checked)}
      />
      <span className="sb-closefield-value">{value}</span>
    </li>
  );

  /* Areas are chips plus an add-picker (036, D3) — never the single
     all-or-nothing checkbox the other fields use, because a proposal here is
     rarely all-or-nothing: the model may miss one area the user still wants
     kept, or name one that doesn't belong. Only areas that exist in the vault
     are ever offered by the picker. */
  const removeArea = (slug: string): void => {
    patch(date, { areas: areas.filter((existing) => existing !== slug) });
  };
  const addArea = (slug: string): void => {
    if (slug.length === 0 || areas.includes(slug)) return;
    patch(date, { areas: [...areas, slug] });
  };
  const pickableAreas = availableAreas.filter((area) => !areas.includes(area.slug));
  const areaTitle = (slug: string): string =>
    availableAreas.find((area) => area.slug === slug)?.title ?? slug;

  return (
    <Card padded={false} className="sb-proposal sb-close-proposal">
      <div className="sb-proposal-head">
        <span className="gs-overline">{t('journal.close.title')}</span>
        <p className="sb-proposal-reason">{suggestion.proposal.reason}</p>
      </div>

      {suggestion.heuristic ? (
        <div className="sb-proposal-note">
          <p className="sb-llm-note">
            <Icon name="info" size={14} />
            <span>{t('journal.close.heuristic')}</span>
          </p>
        </div>
      ) : null}

      <div className="sb-proposal-body sb-close">
        {error === null || error === undefined ? null : (
          <ErrorState error={error} variant="secondary" subject={suggestion.path} scrollIntoView />
        )}

        {rows.length === 0 ? null : (
          <fieldset className="sb-proposal-group">
            <legend className="gs-label">{t('journal.close.todos')}</legend>
            <ul className="sb-todoedit">
              {rows.map((row, at) => (
                <li key={`${row.todo.text}-${at}`} className="sb-todoedit-row">
                  <Checkbox
                    checked={row.keep}
                    label={row.todo.text}
                    onChange={(event) => patchTodo(at, { keep: event.target.checked })}
                  />
                  <span className="sb-todoedit-into">
                    {row.waiting
                      ? t('journal.close.waitingInto')
                      : t('journal.close.into', { target: targetOf(row.todo) })}
                  </span>
                  <DueField
                    value={row.todo.due}
                    ariaLabel={t('journal.close.dueOf', { text: row.todo.text })}
                    onChange={(due) => patchTodo(at, { todo: { ...row.todo, due } })}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <fieldset className="sb-proposal-group" hidden={!hasFields}>
          <legend className="gs-label">{t('journal.close.fields')}</legend>
          <ul className="sb-todoedit">
            {suggestion.frontmatter.people.length > 0
              ? fieldRow(
                  'people',
                  t('journal.close.people'),
                  suggestion.frontmatter.people.join(', '),
                )
              : null}
            {suggestion.frontmatter.projects.length > 0
              ? fieldRow(
                  'projects',
                  t('journal.close.projects'),
                  suggestion.frontmatter.projects.join(', '),
                )
              : null}
            {suggestion.frontmatter.tags.length > 0
              ? fieldRow('tags', t('journal.close.tags'), suggestion.frontmatter.tags.join(', '))
              : null}
            {suggestion.frontmatter.mood === null
              ? null
              : fieldRow(
                  'mood',
                  t('journal.close.mood', {
                    label: t(`journal.mood.${suggestion.frontmatter.mood}`),
                  }),
                  '',
                )}
            {suggestion.frontmatter.energy === null
              ? null
              : fieldRow(
                  'energy',
                  t('journal.close.energy', {
                    label: t(`journal.energy.${suggestion.frontmatter.energy}`),
                  }),
                  '',
                )}
          </ul>
        </fieldset>

        <fieldset className="sb-proposal-group">
          <legend className="gs-label">{t('journal.close.areas')}</legend>
          {areas.length === 0 ? (
            <p className="sb-panel-empty">{t('journal.close.areas.empty')}</p>
          ) : (
            <span className="sb-chips" role="group" aria-label={t('journal.close.areas')}>
              {areas.map((slug) => (
                <Tag
                  key={slug}
                  onRemove={() => removeArea(slug)}
                  removeLabel={t('journal.close.areas.removeOf', { title: areaTitle(slug) })}
                >
                  {areaTitle(slug)}
                </Tag>
              ))}
            </span>
          )}
          {pickableAreas.length === 0 ? null : (
            <Select
              aria-label={t('journal.close.areas.addLabel')}
              placeholder={t('journal.close.areas.addPlaceholder')}
              value=""
              onChange={(event) => addArea(event.target.value)}
              options={pickableAreas.map((area) => ({ value: area.slug, label: area.title }))}
            />
          )}
        </fieldset>

        {writes ? null : <p className="sb-panel-empty">{t('journal.close.nothing')}</p>}
      </div>

      <div className="sb-proposal-actions sb-close-actions">
        <Button
          variant="secondary"
          icon="check"
          loading={busy}
          onClick={() => onApply({ todos: chosen, frontmatter })}
        >
          {t('journal.close.apply')}
        </Button>
        <Button variant="ghost" icon="trash-2" onClick={onDiscard} disabled={busy}>
          {t('journal.close.discard')}
        </Button>
        <Button variant="ghost" icon="refresh-cw" onClick={onRunAgain} disabled={busy}>
          {t('journal.close.runAgain')}
        </Button>
      </div>
    </Card>
  );
}
