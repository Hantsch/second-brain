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

import type { JournalCloseSuggestion, Project, ProposedTodo } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Select } from '../../atoms/Select';
import { Tag } from '../../atoms/Tag';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { useAreas } from '../../lib/queries/areas';
import type { TodoRowEdit } from '../../lib/close-proposal';
import { useCloseProposal, patch } from '../../lib/close-proposal';
import { payloadOf, rowsOf } from '../../lib/close-proposal-view';
import { CloseFieldRows } from './CloseFieldRows';
import { CloseTodoRow } from './CloseTodoRow';

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
  const payload = payloadOf(suggestion, edits);
  const areas = payload.frontmatter.areas;

  /** Merges one row's correction into the edit state — a row is corrected
   * field by field, so an earlier due date survives a later keep/drop.
   * `todo`/`waiting` rows only: their `at` indexes `edits.todoEdits`. */
  const editTodo = (at: number, next: TodoRowEdit): void => {
    patch(date, { todoEdits: { ...edits.todoEdits, [at]: { ...edits.todoEdits[at], ...next } } });
  };

  /** The same idea for a hand-added row (075, D3) — but merged straight into
   * `edits.added[at]` itself, a *separate* index space from `editTodo`'s.
   * Wiring every row to `editTodo` regardless of `kind` would silently
   * corrupt `edits.todoEdits` at whatever index an added row's `at` happens
   * to collide with. `keep` has no meaning on a `ProposedTodo` — an added row
   * is always kept and is only ever taken off the card via `removeAdded`. */
  const editAdded = (at: number, next: TodoRowEdit): void => {
    const fields = { ...next };
    delete fields.keep;
    patch(date, {
      added: edits.added.map((todo, i) => (i === at ? { ...todo, ...fields } : todo)),
    });
  };

  /** A todo the model missed, added by hand (075, D3, AC5) — a blank
   * scaffold the user fills in through the same row controls as a proposed
   * todo. `scope` defaults to `'private'`, the same harmless default
   * `emptySuggestion` uses elsewhere: the day's real scope isn't known here,
   * and D5's normalizer decides the written tag server-side regardless of
   * what the row shows; the user can also change it immediately via the
   * row's own scope select. */
  const addTodo = (): void => {
    patch(date, {
      added: [
        ...edits.added,
        { text: '', scope: 'private', due: null, waitingFor: null, priority: 0, project: null },
      ],
    });
  };

  const removeAdded = (at: number): void => {
    patch(date, { added: edits.added.filter((_, i) => i !== at) });
  };

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

        <fieldset className="sb-proposal-group">
          <legend className="gs-label">{t('journal.close.todos')}</legend>
          {rows.length === 0 ? null : (
            <ul className="sb-todoedit">
              {rows.map((row) => (
                <CloseTodoRow
                  key={`${row.kind}-${row.at}`}
                  row={row}
                  projects={projects}
                  onEdit={row.kind === 'added' ? editAdded : editTodo}
                  onRemove={row.kind === 'added' ? () => removeAdded(row.at) : undefined}
                />
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" icon="plus" onClick={addTodo}>
            {t('journal.close.addTodo')}
          </Button>
        </fieldset>

        <CloseFieldRows
          date={date}
          frontmatter={payload.frontmatter}
          keepField={edits.keepField}
          projects={projects}
        />

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

        {payload.writes ? null : <p className="sb-panel-empty">{t('journal.close.nothing')}</p>}
      </div>

      <div className="sb-proposal-actions sb-close-actions">
        <Button
          variant="secondary"
          icon="check"
          loading={busy}
          onClick={() => onApply({ todos: payload.todos, frontmatter: payload.frontmatter })}
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
