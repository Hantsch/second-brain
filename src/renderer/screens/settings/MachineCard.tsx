/* Machine capacity card: scans this machine's RAM/VRAM/CPU/disk over IPC
   (`llm:scanMachine`) — main runs the pure heuristic (`judgeCapacity` in
   `@core/llm`) and sends the structured verdict back alongside the facts;
   the renderer never imports `core/llm` itself (it's outside the renderer's
   TypeScript project, `tsconfig.web.json`, on purpose — only main may run
   it). This file only turns that structured data into a sentence, per
   guardrail 7.

   Always rendered, in every state of the models tab: it isn't gated by
   whether a provider exists, because "what can this machine carry" is a
   useful answer even with zero providers configured. Re-scanning is always
   available once a result exists — nothing here is a one-shot action. */

import { useId, useState } from 'react';
import {
  DEFAULT_RESOURCE_BUDGET_PERCENT,
  MAX_RESOURCE_BUDGET_PERCENT,
  MIN_RESOURCE_BUDGET_PERCENT,
  parseResourceBudgetPercent,
} from '@shared/llm/resource-budget';
import type { ResourceBudgetParseError } from '@shared/llm/resource-budget';
import {
  parseVramOverrideMb,
  VRAM_OVERRIDE_MAX_MB,
  VRAM_OVERRIDE_MIN_MB,
} from '@shared/llm/vram-override';
import type { VramOverrideParseError } from '@shared/llm/vram-override';
import type { CapacityVerdict, MachineFacts, MachineScanResult, UiLanguage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { useLanguage, useT, type Vars } from '../../i18n';
import { formatBytes, formatNumber } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { useMachineScan, useSetResourceBudget, useSetVramOverride } from '../../lib/queries/llm';

/** MB facts render through the same compact unit convention as file sizes. */
function mb(value: number | null, language: UiLanguage): string | null {
  return value === null ? null : formatBytes(value * 1024 * 1024, language);
}

/**
 * The budgeted figure for a RAM/VRAM row (029, D4): `undefined` whenever the
 * verdict never computed one (the underlying raw fact is unknown, or the
 * verdict itself is `unknown`) — in that case the row says nothing about
 * planning rather than inventing a number. Always reads `plannedRamMb`/
 * `plannedVramMb` straight off the verdict, per the story's decision: the
 * budgeted figure already has the fixed reserve subtracted first, so
 * recomputing raw × percent here would silently disagree with it.
 */
function plannedNote(
  t: (key: string, vars?: Vars) => string,
  language: UiLanguage,
  plannedMb: number | undefined,
  budgetPercent: number | undefined,
): string | null {
  if (plannedMb === undefined || budgetPercent === undefined) return null;
  const planned = mb(Math.round(plannedMb), language);
  if (planned === null) return null;
  return t('settings.machine.budget.planned', { planned, percent: budgetPercent });
}

function verdictSentence(
  t: (key: string, vars?: Vars) => string,
  verdict: CapacityVerdict,
): string {
  if (verdict.limitingFactor === 'unknown' || verdict.maxComfortableParamsB === null) {
    return t('settings.machine.verdict.unknown');
  }
  return t(`settings.machine.verdict.${verdict.limitingFactor}`, {
    comfortable: Math.round(verdict.maxComfortableParamsB),
    possible: Math.round(verdict.maxPossibleParamsB ?? verdict.maxComfortableParamsB),
  });
}

const UNKNOWN_FACT_KEY: Record<string, string> = {
  ram: 'settings.machine.fact.ram',
  vram: 'settings.machine.fact.vram',
  cpu: 'settings.machine.fact.cpu',
};

interface VramRowProps {
  facts: MachineFacts;
  /** Only for the planned-figure suffix (029, D4) — this row never edits the
      budget itself, `BudgetRow` does. */
  verdict: CapacityVerdict;
  language: UiLanguage;
  t: (key: string, vars?: Vars) => string;
  /** Both mutations resolve to a fresh `MachineScanResult` — the parent
      swaps its displayed facts/verdict for whichever ran last. */
  onResult: (result: MachineScanResult) => void;
}

/**
 * The one editable fact on this card (028): VRAM is the one detection can
 * get wrong (Windows' 32-bit `AdapterRAM` lies above 4 GB, see 019a's Done
 * section), so it is the one the user can fill in or correct by hand. Every
 * other row on this card stays scan-only.
 */
function VramRow({ facts, verdict, language, t, onResult }: VramRowProps) {
  const id = useId();
  const override = useSetVramOverride();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<VramOverrideParseError | null>(null);

  /* The conflict note dismisses locally ("keep mine") and only reappears
     once a new scan or edit hands back a new `facts` object — caught up
     during render, the same pattern `SettingsFields.tsx`'s `NumberField`
     uses for its draft value, rather than an effect watching `facts`. */
  const [knownFacts, setKnownFacts] = useState(facts);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  if (knownFacts !== facts) {
    setKnownFacts(facts);
    setConflictDismissed(false);
    setEditing(false);
    setFieldError(null);
  }

  const startEdit = (): void => {
    setDraft(facts.vramMb === null ? '' : String(facts.vramMb));
    setFieldError(null);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setFieldError(null);
  };

  /* Validated with the exact same rule main applies at the IPC boundary
     (`parseVramOverrideMb`, shared) — a rejected value never reaches
     `useSetVramOverride`, per AC 7. */
  const save = (): void => {
    const parsed = parseVramOverrideMb(draft);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(null);
    override.mutate(parsed.valueMb, {
      onSuccess: (result) => {
        onResult(result);
        setEditing(false);
      },
    });
  };

  /* Shared by the manual value's own "clear" action and the conflict note's
     "use detected" action (Decision Q2): both mean "drop the override". */
  const clearOverride = (): void => {
    override.mutate(null, { onSuccess: onResult });
  };

  const errorText = fieldError
    ? t(`settings.machine.vram.error.${fieldError}`, {
        min: VRAM_OVERRIDE_MIN_MB,
        max: VRAM_OVERRIDE_MAX_MB,
      })
    : null;

  const planned = plannedNote(t, language, verdict.plannedVramMb, verdict.budgetPercent);

  return (
    <div>
      <dt>{t('settings.machine.fact.vram')}</dt>
      <dd className="sb-mono">
        {facts.vramMb === null ? t('settings.machine.unknown') : mb(facts.vramMb, language)}
        {facts.vramSource === 'manual' ? (
          <>
            {' '}
            <span className="gs-badge gs-badge--neutral">{t('settings.machine.vram.manual')}</span>
          </>
        ) : null}
        {planned ? <span className="sb-note-detail"> · {planned}</span> : null}
      </dd>
      <dd>
        {editing ? (
          <div className="sb-setting">
            <label className="gs-label" htmlFor={id}>
              {t('settings.machine.fact.vram')}
            </label>
            <div className="sb-numberrow">
              <div className="gs-inputwrap">
                <input
                  id={id}
                  className={`gs-input${errorText ? ' gs-input--invalid' : ''}`}
                  type="text"
                  inputMode="numeric"
                  value={draft}
                  aria-invalid={errorText ? true : undefined}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setFieldError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') save();
                    if (event.key === 'Escape') cancelEdit();
                  }}
                />
              </div>
              <span className="sb-setting-suffix">{t('settings.machine.vram.unitMb')}</span>
            </div>
            {errorText ? <span className="gs-errormsg">{errorText}</span> : null}
            <div className="sb-setting-actions">
              <Button variant="primary" size="sm" loading={override.isPending} onClick={save}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="sb-setting-actions">
            {facts.vramSource === 'manual' ? (
              <Button
                variant="ghost"
                size="sm"
                loading={override.isPending}
                onClick={clearOverride}
              >
                {t('settings.machine.vram.clear')}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={startEdit}>
                {t('settings.machine.vram.enter')}
              </Button>
            )}
          </div>
        )}

        {facts.vramConflict && !conflictDismissed ? (
          <p className="sb-note-detail">
            {t('settings.machine.vram.conflict', {
              detected: mb(facts.detectedVramMb ?? null, language) ?? t('settings.machine.unknown'),
              manual: mb(facts.manualVramMb ?? null, language) ?? t('settings.machine.unknown'),
            })}
            <span className="sb-setting-actions">
              <Button variant="ghost" size="sm" onClick={() => setConflictDismissed(true)}>
                {t('settings.machine.vram.conflict.keepMine')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={override.isPending}
                onClick={clearOverride}
              >
                {t('settings.machine.vram.conflict.useDetected')}
              </Button>
            </span>
          </p>
        ) : null}
      </dd>
    </div>
  );
}

interface BudgetRowProps {
  verdict: CapacityVerdict;
  t: (key: string, vars?: Vars) => string;
  /** Same shape as `VramRow.onResult` — a save resolves to a fresh
      `MachineScanResult`, and the parent swaps its displayed facts/verdict
      for whichever of the two mutations last completed. */
  onResult: (result: MachineScanResult) => void;
}

/**
 * The share of RAM/VRAM sizing may plan against (029, D4) — the one control
 * on this card that isn't a scanned fact but a global setting, which is why
 * it has no "detected vs. manual" source or conflict note the way `VramRow`
 * does. Same draft/commit shape otherwise: `sb-numberrow`, inline error,
 * nothing sent to `useSetResourceBudget` until `parseResourceBudgetPercent`
 * (the exact rule main applies too) accepts the draft.
 */
function BudgetRow({ verdict, t, onResult }: BudgetRowProps) {
  const id = useId();
  const setBudget = useSetResourceBudget();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<ResourceBudgetParseError | null>(null);

  /* `budgetPercent` is optional on `CapacityVerdict` only for pre-029 call
     sites/fixtures — every real scan populates it, but the fallback keeps
     this row honest if one somehow didn't. */
  const currentPercent = verdict.budgetPercent ?? DEFAULT_RESOURCE_BUDGET_PERCENT;

  /* Same "catch up during render" pattern as `VramRow`'s `knownFacts`: once a
     save (or a fresh scan) hands back a verdict with a different percentage,
     drop any leftover editing state instead of leaving it pointed at a value
     that no longer matches what's displayed. */
  const [knownPercent, setKnownPercent] = useState(currentPercent);
  if (knownPercent !== currentPercent) {
    setKnownPercent(currentPercent);
    setEditing(false);
    setFieldError(null);
  }

  const startEdit = (): void => {
    setDraft(String(currentPercent));
    setFieldError(null);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setFieldError(null);
  };

  const save = (): void => {
    const parsed = parseResourceBudgetPercent(draft);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(null);
    setBudget.mutate(parsed.valuePercent, {
      onSuccess: (result) => {
        onResult(result);
        setEditing(false);
      },
    });
  };

  const errorText = fieldError
    ? t(`settings.machine.budget.error.${fieldError}`, {
        min: MIN_RESOURCE_BUDGET_PERCENT,
        max: MAX_RESOURCE_BUDGET_PERCENT,
      })
    : null;

  return (
    <div>
      <dt>{t('settings.machine.budget.title')}</dt>
      <dd className="sb-mono">{t('settings.machine.budget.value', { percent: currentPercent })}</dd>
      <dd>
        <p className="sb-setting-example">{t('settings.machine.budget.help')}</p>
        {editing ? (
          <div className="sb-setting">
            <label className="gs-label" htmlFor={id}>
              {t('settings.machine.budget.title')}
            </label>
            <div className="sb-numberrow">
              <div className="gs-inputwrap">
                <input
                  id={id}
                  className={`gs-input${errorText ? ' gs-input--invalid' : ''}`}
                  type="text"
                  inputMode="numeric"
                  value={draft}
                  aria-invalid={errorText ? true : undefined}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setFieldError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') save();
                    if (event.key === 'Escape') cancelEdit();
                  }}
                />
              </div>
              <span className="sb-setting-suffix">{t('settings.machine.budget.unitPercent')}</span>
            </div>
            {errorText ? <span className="gs-errormsg">{errorText}</span> : null}
            <div className="sb-setting-actions">
              <Button variant="primary" size="sm" loading={setBudget.isPending} onClick={save}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="sb-setting-actions">
            <Button variant="ghost" size="sm" onClick={startEdit}>
              {t('settings.machine.budget.change')}
            </Button>
          </div>
        )}
      </dd>
    </div>
  );
}

export function MachineCard() {
  const t = useT();
  const language = useLanguage();
  const scan = useMachineScan();
  /* Neither mutation is cached (no idle-state getter channel, by design —
     see the story's decisions): the card keeps whichever result last
     resolved, from a scan or from a VRAM edit/clear, in local state. */
  const [latest, setLatest] = useState<MachineScanResult | null>(null);

  const run = (): void => {
    scan.mutate(undefined, { onSuccess: setLatest });
  };

  const facts: MachineFacts | null = latest?.facts ?? scan.data?.facts ?? null;
  const verdict: CapacityVerdict | null = latest?.verdict ?? scan.data?.verdict ?? null;
  const errorText = scan.error ? t(`error.code.${decodeIpcError(scan.error).code}`) : null;

  const gpuName =
    facts && facts.gpuDetection === 'detected' && facts.gpuName !== null
      ? facts.gpuName
      : t('settings.machine.unknown');

  const plannedRam = verdict
    ? plannedNote(t, language, verdict.plannedRamMb, verdict.budgetPercent)
    : null;

  return (
    <Panel
      title={t('settings.machine.title')}
      action={
        <Button variant="secondary" size="sm" icon="search" loading={scan.isPending} onClick={run}>
          {t(facts ? 'settings.machine.rescan' : 'settings.machine.scan')}
        </Button>
      }
      note={facts ? t('settings.machine.disclaimer') : undefined}
    >
      <div className="sb-setting-block">
        {errorText ? <p className="sb-note-detail sb-note-bad">{errorText}</p> : null}

        {!facts && !scan.isPending && !errorText ? (
          <p className="sb-panel-empty">{t('settings.machine.idle')}</p>
        ) : null}

        {facts && verdict ? (
          <>
            <p className="sb-routing-summary">{verdictSentence(t, verdict)}</p>

            {verdict.tiersThatFit.length > 0 ? (
              <p className="sb-routing-hint">
                {t('settings.machine.tiers', { tiers: verdict.tiersThatFit.join(', ') })}
              </p>
            ) : verdict.limitingFactor !== 'unknown' ? (
              /* A verdict exists (some ceiling was computed) but nothing on
                 the landmark list fits under it — honest per AC, not a
                 silent empty line (029, D4). */
              <p className="sb-routing-hint">{t('settings.machine.budget.noneFit')}</p>
            ) : null}

            <dl className="sb-kv">
              <BudgetRow verdict={verdict} t={t} onResult={setLatest} />
              <div>
                <dt>{t('settings.machine.fact.ram')}</dt>
                <dd className="sb-mono">
                  {mb(facts.totalRamMb, language) ?? t('settings.machine.unknown')}
                  {plannedRam ? <span className="sb-note-detail"> · {plannedRam}</span> : null}
                </dd>
              </div>
              <VramRow
                facts={facts}
                verdict={verdict}
                language={language}
                t={t}
                onResult={setLatest}
              />
              <div>
                <dt>{t('settings.machine.fact.gpu')}</dt>
                <dd className="sb-mono">{gpuName}</dd>
              </div>
              <div>
                <dt>{t('settings.machine.fact.cpu')}</dt>
                <dd className="sb-mono">
                  {facts.cpuCores === null
                    ? t('settings.machine.unknown')
                    : formatNumber(facts.cpuCores, language)}
                </dd>
              </div>
              <div>
                <dt>{t('settings.machine.fact.disk')}</dt>
                <dd className="sb-mono">
                  {mb(facts.freeDiskMb, language) ?? t('settings.machine.unknown')}
                </dd>
              </div>
            </dl>

            {verdict.unknowns.length > 0 ? (
              <p className="sb-routing-hint">
                {t('settings.machine.unknowns', {
                  list: verdict.unknowns.map((key) => t(UNKNOWN_FACT_KEY[key] ?? key)).join(', '),
                })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
