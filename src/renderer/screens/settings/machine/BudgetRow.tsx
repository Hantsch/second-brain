/* The share of RAM/VRAM sizing may plan against (029, D4; slider in 035,
   D5) — the one control on this card that isn't a scanned fact but a global
   setting, which is why it has no "detected vs. manual" source or conflict
   note the way `VramRow` does. Lives in "what you may change" (035, D7)
   alongside `VramRow`. A slider can't produce invalid input, so unlike
   `VramRow` there is no draft/parse/error step: `onChange` only relabels
   locally while dragging, and `onCommit` is the single point that calls
   `useSetResourceBudget` — once per completed drag or keypress, never per
   intermediate value.
*/

import { useId, useState } from 'react';
import {
  DEFAULT_RESOURCE_BUDGET_PERCENT,
  MAX_RESOURCE_BUDGET_PERCENT,
  MIN_RESOURCE_BUDGET_PERCENT,
} from '@shared/llm/resource-budget';
import type { CapacityVerdict, MachineScanResult } from '@shared/types';
import { Slider } from '../../../atoms/Slider';
import type { Vars } from '../../../i18n';
import { useSetResourceBudget } from '../../../lib/queries/llm';

interface BudgetRowProps {
  verdict: CapacityVerdict;
  t: (key: string, vars?: Vars) => string;
  /** Same shape as `VramRow.onResult` — a save resolves to a fresh
      `MachineScanResult`, and the parent swaps its displayed facts/verdict
      for whichever of the two mutations last completed. */
  onResult: (result: MachineScanResult) => void;
}

export function BudgetRow({ verdict, t, onResult }: BudgetRowProps) {
  const id = useId();
  const setBudget = useSetResourceBudget();

  /* `budgetPercent` is optional on `CapacityVerdict` only for pre-029 call
     sites/fixtures — every real scan populates it, but the fallback keeps
     this row honest if one somehow didn't. */
  const currentPercent = verdict.budgetPercent ?? DEFAULT_RESOURCE_BUDGET_PERCENT;

  /* Live value while dragging/pressing keys; `liveValue` and `currentPercent`
     intentionally diverge mid-interaction. Same "catch up during render"
     pattern as `VramRow`'s `knownFacts`: once a fresh verdict (a completed
     commit here, a VRAM edit, or a rescan) reports a different percentage,
     the slider snaps to it instead of staying pinned to a stale local value. */
  const [liveValue, setLiveValue] = useState(currentPercent);
  const [knownPercent, setKnownPercent] = useState(currentPercent);
  if (knownPercent !== currentPercent) {
    setKnownPercent(currentPercent);
    setLiveValue(currentPercent);
  }

  const commit = (percent: number): void => {
    setLiveValue(percent);
    setBudget.mutate(percent, { onSuccess: onResult });
  };

  const valueLabel = t('settings.machine.budget.value', { percent: liveValue });

  return (
    <div>
      <dt>{t('settings.machine.budget.title')}</dt>
      <dd className="sb-mono">{valueLabel}</dd>
      <dd>
        <p className="sb-setting-example">{t('settings.machine.budget.help')}</p>
        <div className="sb-setting">
          <label className="gs-label" htmlFor={id}>
            {t('settings.machine.budget.title')}
          </label>
          <Slider
            id={id}
            min={MIN_RESOURCE_BUDGET_PERCENT}
            max={MAX_RESOURCE_BUDGET_PERCENT}
            step={1}
            value={liveValue}
            aria-label={t('settings.machine.budget.aria')}
            aria-valuetext={valueLabel}
            onChange={setLiveValue}
            onCommit={commit}
          />
        </div>
      </dd>
    </div>
  );
}
