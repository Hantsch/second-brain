/* llama.cpp's own detail view (034, D4): the derived start plan with one
   sentence per value, its warnings, the stop button, and the foreign-engine
   notice. Rendered by `LocalRuntimeCard` only for `runtime === 'llamacpp'`
   once the engine is installed (see that file's gating condition, shared
   with `LlamaCppModelPanel`). No props — every fact comes from its own
   hooks, the same shape `LlamaCppModelPanel` already uses.

   Kept separate from `LlamaEngineCard` (which the story's original Plan
   text assumed, written before D2/D3 landed): a second card would mean a
   second start button for the one engine `LocalRuntimeCard` already starts
   via the generic `llm:startLocalRuntime` channel — this component only
   adds what that card doesn't already show. */

import { useId, useState } from 'react';
import { useT } from '../../i18n';
import type { LlamaOverrideParseError } from '@shared/llm/llama-overrides';
import { parseLlamaOverrideInt } from '@shared/llm/llama-overrides';
import type { LlamaOverrides, LlamaStartValue } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Switch } from '../../atoms/Switch';
import {
  useLlamaAutoStart,
  useLlamaEngineMutations,
  useLlamaEngineStatus,
  useLlamaStartPlan,
  useSetLlamaAutoStart,
  useSetLlamaOverrides,
} from '../../lib/queries/llm';

/** One planned value's kind — decides which reason-code vocabulary applies
    (see `src/core/llm/llama-args.ts`'s header comment). */
type PlanValueKind = 'gpuLayers' | 'context' | 'threads';

interface DescribedReason {
  /** i18n key for the value's own sentence. */
  i18nKey: string;
  params: Record<string, string | number>;
  /** Whether the reason carried a trailing `:estimated` segment — only ever
      true for `gpuLayers` (`llama-args.ts` never marks context/threads). */
  estimated: boolean;
}

/**
 * Turns one of D1's reason codes (`'vram-fit:28/33'`, `'context-floor:2048'`,
 * `'threads-budget:6/12'`, …) into the i18n key plus placeholders that
 * compose its one sentence (guardrail 7: core hands over a code, never a
 * sentence). Pure and local to this component — the vocabulary is small
 * enough that a shared module would be one more file for three call sites.
 */
function describeReason(kind: PlanValueKind, reason: string): DescribedReason {
  const estimated = reason.endsWith(':estimated');
  const body = estimated ? reason.slice(0, -':estimated'.length) : reason;
  const separatorIndex = body.indexOf(':');
  const code = separatorIndex === -1 ? body : body.slice(0, separatorIndex);
  const numbers = separatorIndex === -1 ? '' : body.slice(separatorIndex + 1);
  const [first, second] = numbers.split('/');
  const firstNumber = Number(first ?? 0);
  const secondNumber = Number(second ?? 0);

  if (kind === 'gpuLayers') {
    if (code === 'no-vram') {
      return { i18nKey: 'settings.runtime.plan.gpuLayers.no-vram', params: {}, estimated };
    }
    if (code === 'unknown-size') {
      return { i18nKey: 'settings.runtime.plan.gpuLayers.unknown-size', params: {}, estimated };
    }
    const i18nKey =
      code === 'manual'
        ? 'settings.runtime.plan.gpuLayers.manual'
        : 'settings.runtime.plan.gpuLayers.vram-fit';
    return { i18nKey, params: { n: firstNumber, total: secondNumber }, estimated };
  }

  if (kind === 'context') {
    if (code === 'context-floor') {
      return {
        i18nKey: 'settings.runtime.plan.context.floor',
        params: { tokens: firstNumber },
        estimated,
      };
    }
    if (code === 'manual') {
      return {
        i18nKey: 'settings.runtime.plan.context.manual',
        params: { tokens: firstNumber },
        estimated,
      };
    }
    return {
      i18nKey: 'settings.runtime.plan.context.fits',
      params: { tokens: firstNumber },
      estimated,
    };
  }

  // threads
  if (code === 'threads-default') {
    return {
      i18nKey: 'settings.runtime.plan.threads.default',
      params: { n: firstNumber },
      estimated,
    };
  }
  return {
    i18nKey: 'settings.runtime.plan.threads.budget',
    params: { n: firstNumber, cores: secondNumber },
    estimated,
  };
}

interface PlanRowProps {
  kind: PlanValueKind;
  value: LlamaStartValue<number>;
  t: ReturnType<typeof useT>;
}

function PlanRow({ kind, value, t }: PlanRowProps) {
  const described = describeReason(kind, value.reason);
  return (
    <p className="sb-setting-readout">
      <span>{t(described.i18nKey, described.params)}</span>
      {described.estimated ? <span>{t('settings.runtime.plan.estimatedNote')}</span> : null}
    </p>
  );
}

/** The two fields `OverrideField` edits — a subset of `PlanValueKind` (no
    `threads`: 034's Decisions Q1 names only these two as hand-editable). */
type OverrideKind = 'gpuLayers' | 'contextTokens';

/** One field's worth of `Partial<LlamaOverrides>`, built from a literal key
    rather than a computed `{ [field]: value }` — keeps the result a real
    `LlamaOverrides` subset instead of a generic index signature. */
function overridePatch(field: OverrideKind, value: number | null): Partial<LlamaOverrides> {
  return field === 'gpuLayers' ? { gpuLayers: value } : { contextTokens: value };
}

type SetLlamaOverrides = ReturnType<typeof useSetLlamaOverrides>;

interface OverrideFieldProps {
  field: OverrideKind;
  /** The plan's own value for this field — its `source` says whether a
      manual figure is currently active, so no second "is this manual" flag
      needs to travel alongside it (the sentence above already says so once
      the plan refetches, per D4's `describeReason`). */
  value: LlamaStartValue<number>;
  t: ReturnType<typeof useT>;
  setOverrides: SetLlamaOverrides;
}

/**
 * One of the two advanced overrides (034, D5): the number the plan would
 * otherwise derive, editable by hand. Mirrors `VramRow`'s override
 * convention (`MachineCard.tsx`) — a plain text field committed on blur or
 * Enter, plus a "clear" action once an override is active — but without
 * that row's separate edit toggle, since there is nothing else to show here
 * besides the field itself.
 */
function OverrideField({ field, value, t, setOverrides }: OverrideFieldProps) {
  const id = useId();
  const manualValue = value.source === 'manual' ? value.value : null;

  const [draft, setDraft] = useState(manualValue === null ? '' : String(manualValue));
  const [error, setError] = useState<LlamaOverrideParseError | null>(null);
  /* Resets the draft whenever the plan's own manual value changes from
     outside this field (cleared elsewhere, or a fresh plan after a
     resource-budget change) — the same "compare on render" trick `VramRow`
     uses via `knownFacts`, instead of an effect watching `value`. */
  const [lastManualValue, setLastManualValue] = useState(manualValue);
  if (lastManualValue !== manualValue) {
    setLastManualValue(manualValue);
    setDraft(manualValue === null ? '' : String(manualValue));
    setError(null);
  }

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      // An emptied field plus a blur is the same gesture as pressing
      // "clear" — the acceptance line only asks that clearing returns to
      // derived, not which of the two gestures does it.
      if (manualValue !== null) setOverrides.mutate(overridePatch(field, null));
      setError(null);
      return;
    }
    const parsed = parseLlamaOverrideInt(trimmed);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setOverrides.mutate(overridePatch(field, parsed.value));
  };

  const clear = (): void => {
    setDraft('');
    setError(null);
    setOverrides.mutate(overridePatch(field, null));
  };

  const errorText = error ? t(`settings.runtime.advanced.error.${error}`) : null;

  return (
    <div className="sb-setting">
      <label className="gs-label" htmlFor={id}>
        {t(`settings.runtime.advanced.${field}.label`)}
      </label>
      <div className="sb-numberrow">
        <div className="gs-inputwrap">
          <input
            id={id}
            className={`gs-input${errorText ? ' gs-input--invalid' : ''}`}
            type="text"
            inputMode="numeric"
            value={draft}
            placeholder={String(value.value)}
            aria-invalid={errorText ? true : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
        </div>
        {manualValue !== null ? (
          <Button variant="ghost" size="sm" loading={setOverrides.isPending} onClick={clear}>
            {t('settings.runtime.advanced.clear')}
          </Button>
        ) : null}
      </div>
      {errorText ? <span className="gs-errormsg">{errorText}</span> : null}
    </div>
  );
}

/**
 * The auto-start toggle (034, D6; Decisions Q2): `machine.llamaAutoStart`,
 * default `'manual'`. Always rendered, independent of whether a model or a
 * plan exists — it is a preference about *when* the engine may start, not a
 * value derived from one, so it doesn't share the plan rows' gate above.
 */
function AutoStartRow() {
  const t = useT();
  const id = useId();
  const autoStart = useLlamaAutoStart();
  const setAutoStart = useSetLlamaAutoStart();

  return (
    <div className="sb-setting">
      <Switch
        id={id}
        checked={autoStart === 'on-demand'}
        disabled={setAutoStart.isPending}
        onChange={(event) => setAutoStart.mutate(event.target.checked ? 'on-demand' : 'manual')}
        label={t('settings.runtime.autoStart.label')}
        description={t('settings.runtime.autoStart.note')}
      />
    </div>
  );
}

export function LlamaEngineDetails() {
  const t = useT();
  const engineStatus = useLlamaEngineStatus();
  const plan = useLlamaStartPlan();
  const { stop } = useLlamaEngineMutations();
  const setOverrides = useSetLlamaOverrides();

  const running = engineStatus.data?.status === 'running';
  const foreign = running && engineStatus.data?.ownedByApp === false;

  return (
    <div className="sb-setting-block">
      <AutoStartRow />

      {/* No `.gguf` file installed yet: nothing to plan for. `LlamaCppModelPanel`
          already covers "get a model" — this stays empty rather than a second
          empty state saying the same thing. */}
      {plan.data ? (
        <div className="sb-setting-block">
          <PlanRow kind="gpuLayers" value={plan.data.gpuLayers} t={t} />
          <PlanRow kind="context" value={plan.data.contextTokens} t={t} />
          <PlanRow kind="threads" value={plan.data.threads} t={t} />
          {plan.data.warnings.map((warning) => (
            <p key={warning} className="sb-note-detail">
              {t(`settings.runtime.plan.warning.${warning}`)}
            </p>
          ))}
        </div>
      ) : null}

      <details>
        <summary>{t('settings.runtime.advanced.summary')}</summary>
        {/* Nothing to override before a model is installed and a plan
            exists to deviate from — same gate the plan rows above use. */}
        {plan.data ? (
          <div className="sb-setting-block">
            <OverrideField
              field="gpuLayers"
              value={plan.data.gpuLayers}
              t={t}
              setOverrides={setOverrides}
            />
            <OverrideField
              field="contextTokens"
              value={plan.data.contextTokens}
              t={t}
              setOverrides={setOverrides}
            />
          </div>
        ) : null}
      </details>

      {running ? (
        <div className="sb-setting-block">
          <div className="sb-setting-actions">
            <Button
              variant="secondary"
              icon="square"
              disabled={foreign}
              loading={stop.isPending}
              onClick={() => stop.mutate()}
            >
              {t('settings.runtime.stop')}
            </Button>
          </div>
          {foreign ? (
            <p className="sb-note-detail sb-note-bad">{t('settings.runtime.foreignEngine')}</p>
          ) : null}
          <p className="sb-note-detail">{t('settings.runtime.stop.note')}</p>
        </div>
      ) : null}
    </div>
  );
}
