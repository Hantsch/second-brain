/* Der Vorschlag für Status und nächsten Schritt — als Karte, nie als Tat.

   Die Karte zeigt, was geschrieben würde, und die Begründung dazu. Erst ein
   Klick auf „Übernehmen" schreibt; „Nur den Schritt" schreibt bewusst weniger.
   Verworfen wird ohne Folgen (Guardrail 2). */

import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import type { ProjectStatus } from '@shared/types';
import { useT } from '../../i18n';
import type { StatusSuggestion } from '../../lib/queries/projects';

export interface SuggestionCardProps {
  suggestion: StatusSuggestion;
  /** Der Status, der jetzt in der Datei steht. */
  current: ProjectStatus;
  busy?: boolean;
  /** `both` schreibt Status und Schritt, `step` nur den Schritt. */
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
        {/* Kam der Vorschlag aus Regeln statt aus dem Modell, steht es hier —
            auch dann, wenn ein Modell geroutet ist und ausgefallen ist. Sonst
            behauptete die Karte eine Deutung, die nicht stattgefunden hat. */}
        {suggestion.heuristic === true ? (
          <p className="sb-suggest-reason">{t('project.suggest.heuristic')}</p>
        ) : null}
        <p className="sb-suggest-notice">
          <Icon name="info" size={13} />
          {t('project.suggest.notice')}
        </p>
        {/* Sekundär, obwohl es hier zu entscheiden gibt: das eine Teal des
            Screens gehört „Neues Projekt" im Kopf. Der Rahmen der Karte führt
            das Auge, nicht ein zweiter Akzent. */}
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
