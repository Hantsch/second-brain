/* The suggestion for status and next step — as a card, never as an act.

   The card shows what would be written, along with the reasoning behind
   it. Only a click on "Accept" writes; "Only the step" deliberately writes
   less. Rejecting it has no consequences (guardrail 2). */

import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import type { ProjectStatus } from '@shared/types';
import { useT } from '../../i18n';
import type { StatusSuggestion } from '../../lib/queries/projects';

export interface SuggestionCardProps {
  suggestion: StatusSuggestion;
  /** The status that's currently in the file. */
  current: ProjectStatus;
  busy?: boolean;
  /** `both` writes status and step, `step` writes only the step. */
  onAccept: (what: 'both' | 'step') => void;
  onReject: () => void;
}

export function SuggestionCard({
  suggestion,
  current,
  busy = false,
  onAccept,
  onReject,
}: SuggestionCardProps) {
  const t = useT();
  const changesStatus = suggestion.status !== current;

  return (
    <Card padded={false} className="sb-suggest">
      <div className="sb-suggest-body">
        <span className="gs-overline">{t('project.suggest.title')}</span>
        <p className="sb-suggest-step">
          {t('project.suggest.step', { step: suggestion.nextStep })}
        </p>
        {changesStatus ? (
          <p className="sb-suggest-status">
            {t('project.suggest.status', { status: t(`project.status.${suggestion.status}`) })}
          </p>
        ) : null}
        <p className="sb-suggest-reason">{suggestion.reason}</p>
        {/* If the suggestion came from rules instead of the model, it says
            so here — including when a model is routed but failed. Otherwise
            the card would claim an interpretation that never happened. */}
        {suggestion.heuristic === true ? (
          <p className="sb-suggest-reason">{t('project.suggest.heuristic')}</p>
        ) : null}
        <p className="sb-suggest-notice">
          <Icon name="info" size={13} />
          {t('project.suggest.notice')}
        </p>
        {/* Secondary, even though there's a decision to make here: the
            screen's one teal belongs to "New project" in the header. The
            card's border guides the eye, not a second accent. */}
        <div className="sb-suggest-actions">
          {changesStatus ? (
            <Button
              size="sm"
              variant="secondary"
              icon="check"
              loading={busy}
              onClick={() => onAccept('both')}
            >
              {t('project.suggest.accept')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            icon="check"
            loading={busy}
            onClick={() => onAccept('step')}
          >
            {t('project.suggest.acceptStep')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject}>
            {t('project.suggest.reject')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
