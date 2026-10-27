/* One row of the recommendation list: target, reason, tradeoff, cost or
   pending-download size, and — for a sensitive task with a pick — the
   policy that backed it. Split out of RecommendationSection.tsx to keep
   both files under the project's soft line limit.

   `reasonKey`/`tradeoffKey` are a closed set of i18n keys (guardrail 7):
   this file never invents a sentence, it only looks one up. */

import type {
  ProviderConfig,
  TaskDefinition,
  TaskKind,
  TaskRecommendation,
  UiLanguage,
} from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { describeRef } from '../../components/RoutingTable';
import { useT, type Vars } from '../../i18n';
import { formatCostUsd, formatDate, formatNumber } from '../../lib/format';

export interface RecommendationRowProps {
  row: TaskRecommendation;
  task: TaskDefinition;
  providers: readonly ProviderConfig[];
  language: UiLanguage;
  accepted: boolean;
  busy: boolean;
  onAccept: () => void;
  /**
   * A `pick === null` row is a dead end otherwise (067, D2 — AC1): this
   * raises the task up to `ModelsTab`, which scrolls the routing table's
   * matching row into view and focuses its select. Every reason key ends
   * here alike — the row looks identical for `no-reachable-model` and
   * `beyond-this-machine`, so the way out can't be conditional on which one.
   */
  onAssignManually: (task: TaskKind) => void;
}

function targetText(
  row: TaskRecommendation,
  providers: readonly ProviderConfig[],
  t: (key: string, vars?: Vars) => string,
): string {
  if (row.pick === null) return t('settings.routing.noModel');
  const name = describeRef(row.pick, providers, t('settings.routing.agent'));
  if (row.needsDownloadGb !== null) {
    return t('settings.recommend.needsDownload', { model: name, gb: row.needsDownloadGb });
  }
  return name;
}

/**
 * The machine's parameter ceiling for the shortfall line. It arrives from the
 * capacity heuristic as a raw division (7.2727272727272725), which `t()` would
 * interpolate verbatim and with a JS decimal point — wrong separator in German
 * and ten digits of false precision. Floored rather than rounded: flooring can
 * only understate what the machine carries, so the printed pair stays true to
 * the shortfall it describes (rounding 2.7 up against a 3 B floor would read
 * as "needs 3, carries 3"). The required figure needs no such treatment — it
 * is an exact constant from the tier table — but goes through `formatNumber`
 * too, so both numbers in the block follow the UI language.
 */
function formatCarriedParamsB(value: number, language: UiLanguage): string {
  return formatNumber(Math.floor(value), language);
}

/**
 * A pick is only acceptable once it names a provider actually configured in
 * this vault — a `needs-download` pick (nothing pulled yet, and possibly no
 * runtime configured at all) carries `recommend.ts`'s documented placeholder
 * `providerId` (the catalogue's `providerKind`, e.g. `'openai-compatible'`),
 * which `llm:setRoute` rejects as `not-found`. Offering "accept" on a pick
 * that can only fail would be a dead-end button, not a proposal (guardrail
 * 2 still has to end in something that actually writes).
 */
export function isAcceptable(
  row: TaskRecommendation,
  providers: readonly ProviderConfig[],
): boolean {
  return row.pick !== null && providers.some((provider) => provider.id === row.pick?.providerId);
}

export function RecommendationRow({
  row,
  task,
  providers,
  language,
  accepted,
  busy,
  onAccept,
  onAssignManually,
}: RecommendationRowProps) {
  const t = useT();
  const label = t(task.labelKey);
  /* A sensitive row only shows a policy line once something was actually
     picked under that policy — for the mandated-rule case (`pick: null`)
     the reason sentence already says nothing qualified, so a policy line
     would claim a source for a choice that never happened. */
  const showPolicy = task.sensitive && row.pick !== null && row.policySource !== null;

  return (
    <li className="sb-recommend-row">
      <div className="sb-recommend-head">
        <span className="sb-routing-task">{label}</span>
        {task.sensitive ? (
          <Badge variant="warning" title={t('settings.routing.sensitive')}>
            {t('settings.routing.sensitiveShort')}
          </Badge>
        ) : null}
      </div>

      <p className="sb-mono sb-recommend-target">{targetText(row, providers, t)}</p>

      <p className="sb-routing-hint">{t(`settings.recommend.reason.${row.reasonKey}`)}</p>

      {row.tradeoffKey ? (
        <p className="sb-routing-hint">
          {t(`settings.recommend.tradeoff.${row.tradeoffKey}`, {
            alternatives: row.alternatives
              .map((ref) => describeRef(ref, providers, t('settings.routing.agent')))
              .join(', '),
          })}
        </p>
      ) : null}

      {row.costPerRun !== null ? (
        <p className="sb-note-detail">
          {t('settings.recommend.costEstimate', { cost: formatCostUsd(row.costPerRun, language) })}
        </p>
      ) : null}

      {showPolicy ? (
        <p className="sb-note-detail">
          {t('settings.recommend.policy', {
            source: row.policySource as string,
            date: formatDate(row.policyReadAt, language),
          })}
        </p>
      ) : null}

      {row.shortfall ? (
        <div className="sb-note-detail">
          <p>
            {t('settings.recommend.shortfall.required', {
              required: formatNumber(row.shortfall.requiredParamsB, language),
            })}
          </p>
          <p>
            {row.shortfall.machineParamsB !== null
              ? t('settings.recommend.shortfall.carried', {
                  carried: formatCarriedParamsB(row.shortfall.machineParamsB, language),
                })
              : t('settings.recommend.shortfall.carriedUnknown')}
          </p>
          <p>
            {row.shortfall.cloudOptionAvailable
              ? t('settings.recommend.shortfall.optionCloud')
              : t('settings.recommend.shortfall.optionNone')}
          </p>
        </div>
      ) : null}

      <div className="sb-setting-actions">
        {isAcceptable(row, providers) ? (
          <Button
            size="sm"
            variant={accepted ? 'ghost' : 'secondary'}
            icon={accepted ? 'check' : undefined}
            loading={busy}
            disabled={accepted}
            onClick={onAccept}
            aria-label={t('settings.recommend.acceptAria', { task: label })}
          >
            {accepted ? t('settings.recommend.accepted') : t('settings.recommend.accept')}
          </Button>
        ) : row.pick !== null ? (
          /* A real pick that names no configured provider yet (a
             needs-download row with no runtime set up at all) — nothing to
             accept until that provider exists, so say so instead of
             offering a button that can only fail. */
          <p className="sb-routing-hint">{t('settings.recommend.notYetSetUp')}</p>
        ) : (
          /* No pick at all: the reason sentence above already says why —
             this is the way out of that dead end, not a repeat of it. */
          <>
            <p className="sb-routing-hint">{t('settings.routing.deadEnd.pointer')}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAssignManually(task.kind)}
              aria-label={t('settings.routing.deadEnd.assignAria', { task: label })}
            >
              {t('settings.routing.deadEnd.assign')}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
