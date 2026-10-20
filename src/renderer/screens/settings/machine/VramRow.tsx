/* The one editable fact on this card (028): VRAM is the one detection can
   get wrong (Windows' 32-bit `AdapterRAM` lies above 4 GB, see 019a's Done
   section), so it is the one the user can fill in or correct by hand. Every
   other row on this card stays scan-only (`MachineFactsList`). Lives in
   "what you may change" (035, D7) alongside `BudgetRow` — the two things on
   this card that are controls, not just numbers. */

import { useId, useState } from 'react';
import {
  parseVramOverrideGb,
  VRAM_OVERRIDE_MAX_GB,
  VRAM_OVERRIDE_MIN_GB,
} from '@shared/llm/vram-override';
import type { VramOverrideParseError } from '@shared/llm/vram-override';
import type { CapacityVerdict, MachineFacts, MachineScanResult, UiLanguage } from '@shared/types';
import { Button } from '../../../atoms/Button';
import type { Vars } from '../../../i18n';
import { formatNumber } from '../../../lib/format';
import { useSetVramOverride } from '../../../lib/queries/llm';
import { mbToGbDraft, plannedNote, vramGb } from './format';

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

export function VramRow({ facts, verdict, language, t, onResult }: VramRowProps) {
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
    setDraft(facts.vramMb === null ? '' : mbToGbDraft(facts.vramMb, language));
    setFieldError(null);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setFieldError(null);
  };

  /* The field reads and writes GB (035, D3); `parseVramOverrideGb` converts
     to MB at this edge — the only unit `useSetVramOverride` and settings
     storage ever see. */
  const save = (): void => {
    const parsed = parseVramOverrideGb(draft);
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
        min: formatNumber(VRAM_OVERRIDE_MIN_GB, language),
        max: formatNumber(VRAM_OVERRIDE_MAX_GB, language),
      })
    : null;

  const planned = plannedNote(t, language, verdict.plannedVramMb, verdict.budgetPercent);

  return (
    <div>
      <dt>{t('settings.machine.fact.vram')}</dt>
      <dd className="sb-mono">
        {facts.vramMb === null ? t('settings.machine.unknown') : vramGb(facts.vramMb, language)}
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
                  inputMode="decimal"
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
              <span className="sb-setting-suffix">{t('settings.machine.vram.unitGb')}</span>
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
              detected:
                vramGb(facts.detectedVramMb ?? null, language) ?? t('settings.machine.unknown'),
              manual: vramGb(facts.manualVramMb ?? null, language) ?? t('settings.machine.unknown'),
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
